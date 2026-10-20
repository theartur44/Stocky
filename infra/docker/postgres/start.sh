#!/bin/sh
# Prepara la clave TLS con los permisos que exige PostgreSQL y arranca el servidor.
set -eu
mkdir -p /var/lib/postgresql/tls
cp /run/secrets/db_server_crt /var/lib/postgresql/tls/server.crt
cp /run/secrets/db_server_key /var/lib/postgresql/tls/server.key
chown -R postgres:postgres /var/lib/postgresql/tls
chmod 600 /var/lib/postgresql/tls/server.key
exec docker-entrypoint.sh postgres \
  -c ssl=on \
  -c ssl_cert_file=/var/lib/postgresql/tls/server.crt \
  -c ssl_key_file=/var/lib/postgresql/tls/server.key \
  -c ssl_min_protocol_version=TLSv1.3 \
  -c hba_file=/etc/postgresql/pg_hba.conf \
  -c password_encryption=scram-sha-256 \
  -c log_connections=off \
  -c log_statement=none
