#!/bin/sh
# Aplica las migraciones pendientes y arranca la API.
set -eu
alembic upgrade head
# --proxy-headers: la IP real del cliente llega de Caddy (único acceso a la API).
exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 \
  --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}" \
  --no-server-header --no-date-header --workers 1
