#!/usr/bin/env bash
# Genera los secretos y certificados del servidor de Stocky en ./secrets/
# (carpeta ignorada por git). Ejecutar UNA vez en el servidor, desde infra/docker:
#
#   bash scripts/generate-secrets.sh
#
# No sobrescribe nada que ya exista (borra un fichero si quieres regenerarlo).
# Requiere: openssl.
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
DIR=secrets
mkdir -p "$DIR"
chmod 700 "$DIR"

gen() { # gen <fichero> <comando que imprime el valor>
  local f="$DIR/$1"
  if [[ -s "$f" ]]; then echo "  = $1 (ya existe, no se toca)"; return; fi
  eval "$2" > "$f"
  chmod 600 "$f"
  echo "  + $1"
}

echo "Generando secretos en $DIR/"
gen postgres_password "openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-40"
gen jwt_secret "openssl rand -base64 48 | tr -d '\n'"
gen email_pepper "openssl rand -base64 48 | tr -d '\n'"
gen data_keys "printf 'k%s:%s' \"\$(date +%Y%m)\" \"\$(openssl rand -base64 32 | tr -d '\n')\""
gen registration_code "openssl rand -base64 18 | tr -d '/+=\n'"

# Autoridad de certificación propia y certificado TLS para PostgreSQL (nombre «db»).
if [[ ! -s "$DIR/db_ca.crt" ]]; then
  openssl req -x509 -new -nodes -newkey rsa:3072 -sha256 -days 3650 \
    -subj "/CN=Stocky DB CA" -keyout "$DIR/db_ca.key" -out "$DIR/db_ca.crt" 2>/dev/null
  echo "  + db_ca.crt / db_ca.key"
fi
if [[ ! -s "$DIR/db_server.crt" ]]; then
  openssl req -new -nodes -newkey rsa:3072 -sha256 -subj "/CN=db" \
    -keyout "$DIR/db_server.key" -out "$DIR/db_server.csr" 2>/dev/null
  printf "subjectAltName=DNS:db,DNS:localhost\nextendedKeyUsage=serverAuth\n" > "$DIR/db_server.ext"
  openssl x509 -req -in "$DIR/db_server.csr" -CA "$DIR/db_ca.crt" -CAkey "$DIR/db_ca.key" \
    -CAcreateserial -days 825 -sha256 -extfile "$DIR/db_server.ext" -out "$DIR/db_server.crt" 2>/dev/null
  rm -f "$DIR/db_server.csr" "$DIR/db_server.ext" "$DIR/db_ca.srl"
  echo "  + db_server.crt / db_server.key"
fi
chmod 600 "$DIR"/*
# Los contenedores leen los secretos con su propio usuario: se permite lectura,
# pero la carpeta sigue siendo privada (700) para el resto del sistema.
chmod 644 "$DIR"/postgres_password "$DIR"/jwt_secret "$DIR"/email_pepper "$DIR"/data_keys \
  "$DIR"/registration_code "$DIR"/db_ca.crt "$DIR"/db_server.crt "$DIR"/db_server.key

echo
echo "Listo. Código de registro para la familia (compártelo en persona):"
echo "  $(cat "$DIR/registration_code")"
echo
echo "IMPORTANTE: haz una copia de seguridad CIFRADA de $DIR/ fuera del servidor."
echo "Sin data_keys los datos cifrados de la base de datos no se pueden recuperar."
