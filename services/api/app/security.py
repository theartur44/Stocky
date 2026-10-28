"""Primitivas de seguridad. Solo bibliotecas mantenidas; nada de criptografía propia.

- Contraseñas: Argon2id (argon2-cffi).
- Tokens de acceso: JWT HS256 de vida corta (PyJWT).
- Tokens de renovación: 256 bits aleatorios; en la base de datos solo su SHA-256.
- Cifrado de datos: AES-256-GCM (cryptography) con datos asociados (AAD) que
  ligan cada valor a su fila, de modo que no se puede mover un dato cifrado de
  un hogar a otro sin que falle el descifrado.
- Correo: índice ciego HMAC-SHA256 con «pepper» para buscar sin guardarlo en claro.
- Verificación en dos pasos: TOTP (RFC 6238, HMAC-SHA1, 6 cifras, 30 s), el
  estándar de las apps autenticadoras. El secreto se guarda cifrado y cada
  código solo vale una vez. Códigos de recuperación de un solo uso (solo su hash).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import struct
import uuid
from urllib.parse import quote
from datetime import UTC, datetime, timedelta

import threading

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import Settings

# Parámetros Argon2id (RFC 9106, perfil de memoria moderada).
_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2, hash_len=32, salt_len=16)
# Hash ficticio para igualar tiempos cuando el usuario no existe (anti-enumeración).
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))
# Cada cálculo usa 64 MiB: se limitan los simultáneos para que una avalancha de
# inicios de sesión no agote la memoria del servidor (el resto espera su turno).
_ARGON2_SLOTS = threading.BoundedSemaphore(4)

JWT_ISSUER = "stocky-api"
JWT_AUDIENCE = "stocky-app"


def hash_password(password: str) -> str:
    with _ARGON2_SLOTS:
        return _hasher.hash(password)


def verify_password(stored_hash: str | None, password: str) -> bool:
    """Verifica en tiempo similar exista o no el usuario."""
    try:
        with _ARGON2_SLOTS:
            ok = _hasher.verify(stored_hash or _DUMMY_HASH, password)
        return ok and stored_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(stored_hash: str) -> bool:
    return _hasher.check_needs_rehash(stored_hash)


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_invitation_code() -> str:
    """Código legible de 12 caracteres sin caracteres ambiguos (≈ 60 bits)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(12))


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def email_index(settings: Settings, email: str) -> str:
    normalized = email.strip().lower().encode("utf-8")
    return hmac.new(settings.email_pepper, normalized, hashlib.sha256).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


# ------------------------------------------------------------------ contraseñas

# Contraseñas muy usadas (o variantes triviales) que se rechazan aunque sean largas.
_COMMON_PASSWORDS = {
    "123456789012", "1234567890123", "12345678901234", "123456123456", "111111111111", "000000000000",
    "qwertyuiopas", "qwertyuiop123", "qwerty123456", "123456qwerty", "asdfghjklñ12", "passwordpassword",
    "password1234", "password12345", "password123456", "contraseña123", "contraseña1234", "contrasena1234",
    "contrasena123", "iloveyou1234", "abcdefghijkl", "abcdef123456", "abc123abc123", "123123123123",
    "aaaaaaaaaaaa", "letmein12345", "welcome12345", "bienvenido123", "bienvenido1234", "administrador",
    "administrator", "stocky123456", "stockystocky", "holahola1234", "teamo1234567", "superman1234",
    "barcelona1234", "realmadrid12", "1q2w3e4r5t6y", "q1w2e3r4t5y6", "zaq12wsxcde3", "trustno11234",
}


def password_problem(password: str, email: str | None = None) -> str | None:
    """Motivo por el que una contraseña no es aceptable, o None si lo es."""
    if len(password) < 12:
        return "too_short"
    lowered = password.lower()
    if lowered in _COMMON_PASSWORDS or len(set(lowered)) < 5:
        return "too_common"
    if email:
        local = email.split("@", 1)[0].lower()
        if len(local) >= 4 and local in lowered:
            return "contains_email"
    return None


# ------------------------------------------------------------------ verificación en dos pasos (TOTP)

TOTP_PERIOD = 30
TOTP_DIGITS = 6


def new_totp_secret() -> str:
    """160 bits aleatorios en base32 (lo que se escribe o escanea en la app autenticadora)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def totp_code(secret: str, step: int) -> str:
    key = base64.b32decode(secret, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**TOTP_DIGITS).zfill(TOTP_DIGITS)


def verify_totp(secret: str, code: str, now: datetime, last_step: int | None) -> int | None:
    """Devuelve el paso aceptado (para impedir reutilizarlo) o None.

    Se admite un paso de margen (±30 s) por desajustes de reloj. Un código ya
    usado (paso ≤ último aceptado) se rechaza.
    """
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != TOTP_DIGITS:
        return None
    current = int(now.timestamp()) // TOTP_PERIOD
    for step in (current - 1, current, current + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(totp_code(secret, step), code):
            return step
    return None


def totp_uri(secret: str, email: str) -> str:
    label = quote(f"Stocky:{email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer=Stocky&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD}"


def new_recovery_codes(n: int = 10) -> list[str]:
    """Códigos de recuperación legibles (XXXX-XXXX, ≈ 40 bits cada uno)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return ["".join(secrets.choice(alphabet) for _ in range(4)) + "-" + "".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(n)]


# ------------------------------------------------------------------ JWT


def create_access_token(settings: Settings, user_id: uuid.UUID, session_id: uuid.UUID) -> tuple[str, int]:
    now = datetime.now(UTC)
    ttl = timedelta(minutes=settings.access_token_minutes)
    payload = {
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "sub": str(user_id),
        "sid": str(session_id),
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256"), int(ttl.total_seconds())


MFA_TOKEN_MINUTES = 5


def create_mfa_token(settings: Settings, user_id: uuid.UUID) -> str:
    """Token de un solo propósito tras validar la contraseña: solo sirve para enviar el segundo factor."""
    now = datetime.now(UTC)
    payload = {
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "sub": str(user_id),
        "typ": "mfa",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=MFA_TOKEN_MINUTES)).timestamp()),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_mfa_token(settings: Settings, token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "typ"]},
        )
        return uuid.UUID(payload["sub"]) if payload.get("typ") == "mfa" else None
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


def decode_access_token(settings: Settings, token: str) -> tuple[uuid.UUID, uuid.UUID] | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "sid", "typ"]},
        )
        if payload.get("typ") != "access":
            return None
        return uuid.UUID(payload["sub"]), uuid.UUID(payload["sid"])
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


# ------------------------------------------------------------------ cifrado de datos

_FORMAT_VERSION = 1


class DecryptionError(Exception):
    pass


class DataCipher:
    """AES-256-GCM con rotación de claves.

    Formato: versión (1 B) | longitud id (1 B) | id de clave | nonce (12 B) | texto cifrado + etiqueta.
    """

    def __init__(self, keys: dict[str, bytes], active_key_id: str) -> None:
        if active_key_id not in keys:
            raise ValueError("Active key not configured")
        self._keys = {kid: AESGCM(k) for kid, k in keys.items()}
        self._active = active_key_id

    def encrypt(self, plaintext: bytes, aad: str) -> bytes:
        kid = self._active.encode("ascii")
        nonce = os.urandom(12)
        ct = self._keys[self._active].encrypt(nonce, plaintext, aad.encode("utf-8"))
        return bytes([_FORMAT_VERSION, len(kid)]) + kid + nonce + ct

    def decrypt(self, blob: bytes, aad: str) -> bytes:
        try:
            if blob[0] != _FORMAT_VERSION:
                raise DecryptionError("Unknown format")
            klen = blob[1]
            kid = blob[2 : 2 + klen].decode("ascii")
            nonce = blob[2 + klen : 14 + klen]
            ct = blob[14 + klen :]
            return self._keys[kid].decrypt(nonce, ct, aad.encode("utf-8"))
        except DecryptionError:
            raise
        except Exception as e:  # clave desconocida, datos alterados o AAD distinto
            raise DecryptionError("Cannot decrypt") from e

    def needs_reencrypt(self, blob: bytes) -> bool:
        klen = blob[1]
        return blob[2 : 2 + klen].decode("ascii") != self._active

    def encrypt_text(self, text: str, aad: str) -> bytes:
        return self.encrypt(text.encode("utf-8"), aad)

    def decrypt_text(self, blob: bytes, aad: str) -> str:
        return self.decrypt(blob, aad).decode("utf-8")
