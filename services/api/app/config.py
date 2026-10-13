"""Configuración desde variables de entorno.

Los secretos nunca tienen valor por defecto: si faltan en producción, el
servidor no arranca. Ver `infra/docker/.env.example`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    environment: str
    allowed_hosts: tuple[str, ...]
    max_body_bytes: int

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ) if env is None else env
    environment = env.get("STOKY_ENV", "development")
    if environment not in {"development", "test", "production"}:
        raise ConfigError("STOKY_ENV must be development, test or production")

    hosts = tuple(h.strip() for h in env.get("STOKY_ALLOWED_HOSTS", "").split(",") if h.strip())
    if environment == "production" and (not hosts or "*" in hosts):
        raise ConfigError("STOKY_ALLOWED_HOSTS must list explicit hosts in production")

    try:
        max_body = int(env.get("STOKY_MAX_BODY_BYTES", "1048576"))
    except ValueError as e:
        raise ConfigError("STOKY_MAX_BODY_BYTES must be an integer") from e
    if not 1024 <= max_body <= 10 * 1024 * 1024:
        raise ConfigError("STOKY_MAX_BODY_BYTES out of range")

    return Settings(
        environment=environment,
        allowed_hosts=hosts or ("localhost", "127.0.0.1", "testserver"),
        max_body_bytes=max_body,
    )
