#!/bin/sh
# Aplica las migraciones pendientes y arranca la API.
set -eu
alembic upgrade head
# --proxy-headers: la IP real del cliente llega de Caddy (único acceso a la API), que
# sustituye cualquier X-Forwarded-For del cliente por una sola IP ya comprobada.
# --limit-concurrency: por encima, responde 503 en vez de agotar la memoria.
exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 \
  --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}" \
  --limit-concurrency 64 \
  --no-server-header --no-date-header --workers 1
