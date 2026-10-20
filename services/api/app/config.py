"""Configuración desde variables de entorno (o ficheros de secretos de Docker).

Cada secreto se puede dar directamente (`STOCKY_JWT_SECRET=...`) o, mejor, como
fichero (`STOCKY_JWT_SECRET_FILE=/run/secrets/jwt_secret`), que es como lo
monta Docker Compose. En producción, si falta un secreto o es débil, el
servidor no arranca. En desarrollo y pruebas se generan secretos efímeros.
"""

from __future__ import annotations

import base64
import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote


class ConfigError(RuntimeError):
    pass


REGISTRATION_MODES = {"invite_code", "open", "closed"}


@dataclass(frozen=True)
class Settings:
    environment: str
    allowed_hosts: tuple[str, ...]
    max_body_bytes: int
    database_url: str
    jwt_secret: bytes
    #: Claves de cifrado de datos {id: clave de 32 bytes}; la primera es la activa.
    data_keys: dict[str, bytes] = field(repr=False)
    active_key_id: str = ""
    email_pepper: bytes = field(default=b"", repr=False)
    registration_mode: str = "invite_code"
    registration_code: str | None = field(default=None, repr=False)
    access_token_minutes: int = 15
    refresh_token_days: int = 60

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


def _read(env: dict[str, str], name: str) -> str | None:
    """Lee `NAME` o el contenido del fichero indicado en `NAME_FILE`."""
    path = env.get(f"{name}_FILE")
    if path:
        try:
            return Path(path).read_text(encoding="utf-8").strip()
        except OSError as e:
            raise ConfigError(f"Cannot read {name}_FILE") from e
    value = env.get(name)
    return value.strip() if value else None


def _secret_bytes(env: dict[str, str], name: str, production: bool) -> bytes:
    value = _read(env, name)
    if not value:
        if production:
            raise ConfigError(f"{name} is required in production")
        return secrets.token_bytes(32)
    raw = value.encode("utf-8")
    if len(raw) < 32:
        raise ConfigError(f"{name} must be at least 32 characters")
    return raw


def _parse_data_keys(value: str | None, production: bool) -> tuple[dict[str, bytes], str]:
    """Formato: `id1:base64,id0:base64` (la primera es la que cifra)."""
    if not value:
        if production:
            raise ConfigError("STOCKY_DATA_KEYS is required in production")
        return {"dev": secrets.token_bytes(32)}, "dev"
    keys: dict[str, bytes] = {}
    order: list[str] = []
    for part in value.split(","):
        kid, _, b64 = part.strip().partition(":")
        if not kid or not b64 or not kid.isalnum() or len(kid) > 16:
            raise ConfigError("STOCKY_DATA_KEYS has an invalid entry")
        try:
            key = base64.b64decode(b64, validate=True)
        except ValueError as e:
            raise ConfigError("STOCKY_DATA_KEYS has invalid base64") from e
        if len(key) != 32:
            raise ConfigError("Each data key must be 32 bytes (AES-256)")
        if kid in keys:
            raise ConfigError("Duplicated data key id")
        keys[kid] = key
        order.append(kid)
    return keys, order[0]


def _database_url(env: dict[str, str], production: bool) -> str:
    url = _read(env, "STOCKY_DATABASE_URL")
    if url:
        return url
    host = env.get("POSTGRES_HOST")
    if not host:
        if production:
            raise ConfigError("Database configuration is required in production")
        return "sqlite+pysqlite:///:memory:"
    password = _read(env, "POSTGRES_PASSWORD")
    if not password:
        raise ConfigError("POSTGRES_PASSWORD is required")
    user = env.get("POSTGRES_USER", "stocky")
    db = env.get("POSTGRES_DB", "stocky")
    port = env.get("POSTGRES_PORT", "5432")
    sslmode = env.get("POSTGRES_SSLMODE", "verify-full")
    if production and sslmode not in {"verify-full", "verify-ca", "require"}:
        raise ConfigError("POSTGRES_SSLMODE must enforce TLS in production")
    query = f"sslmode={sslmode}"
    rootcert = env.get("POSTGRES_SSLROOTCERT")
    if rootcert:
        query += f"&sslrootcert={quote(rootcert)}"
    return f"postgresql+psycopg://{quote(user)}:{quote(password)}@{host}:{port}/{quote(db)}?{query}"


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ) if env is None else env
    environment = env.get("STOCKY_ENV", "development")
    if environment not in {"development", "test", "production"}:
        raise ConfigError("STOCKY_ENV must be development, test or production")
    production = environment == "production"

    hosts = tuple(h.strip() for h in env.get("STOCKY_ALLOWED_HOSTS", "").split(",") if h.strip())
    if production and (not hosts or "*" in hosts):
        raise ConfigError("STOCKY_ALLOWED_HOSTS must list explicit hosts in production")

    try:
        max_body = int(env.get("STOCKY_MAX_BODY_BYTES", "1048576"))
    except ValueError as e:
        raise ConfigError("STOCKY_MAX_BODY_BYTES must be an integer") from e
    if not 1024 <= max_body <= 10 * 1024 * 1024:
        raise ConfigError("STOCKY_MAX_BODY_BYTES out of range")

    mode = env.get("STOCKY_REGISTRATION", "invite_code")
    if mode not in REGISTRATION_MODES:
        raise ConfigError("STOCKY_REGISTRATION must be invite_code, open or closed")
    code = _read(env, "STOCKY_REGISTRATION_CODE")
    if mode == "invite_code" and production and (not code or len(code) < 12):
        raise ConfigError("STOCKY_REGISTRATION_CODE (12+ characters) is required in production")

    database_url = _database_url(env, production)
    if production and not database_url.startswith("postgresql"):
        raise ConfigError("PostgreSQL is required in production")

    keys, active = _parse_data_keys(_read(env, "STOCKY_DATA_KEYS"), production)
    return Settings(
        environment=environment,
        allowed_hosts=hosts or ("localhost", "127.0.0.1", "testserver"),
        max_body_bytes=max_body,
        database_url=database_url,
        jwt_secret=_secret_bytes(env, "STOCKY_JWT_SECRET", production),
        data_keys=keys,
        active_key_id=active,
        email_pepper=_secret_bytes(env, "STOCKY_EMAIL_PEPPER", production),
        registration_mode=mode,
        registration_code=code,
    )
