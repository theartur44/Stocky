"""Primitivas de seguridad. Solo bibliotecas mantenidas; nada de criptografía propia.

- Contraseñas: Argon2id (argon2-cffi).
- Tokens de acceso: JWT HS256 de vida corta (PyJWT).
- Tokens de renovación: 256 bits aleatorios; en la base de datos solo su SHA-256.
- Cifrado de datos: AES-256-GCM (cryptography) con datos asociados (AAD) que
  ligan cada valor a su fila, de modo que no se puede mover un dato cifrado de
  un hogar a otro sin que falle el descifrado.
- Correo: índice ciego HMAC-SHA256 con «pepper» para buscar sin guardarlo en claro.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import Settings

# Parámetros Argon2id (RFC 9106, perfil de memoria moderada).
_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2, hash_len=32, salt_len=16)
# Hash ficticio para igualar tiempos cuando el usuario no existe (anti-enumeración).
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))

JWT_ISSUER = "stocky-api"
JWT_AUDIENCE = "stocky-app"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str | None, password: str) -> bool:
    """Verifica en tiempo similar exista o no el usuario."""
    try:
        return _hasher.verify(stored_hash or _DUMMY_HASH, password) and stored_hash is not None
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
