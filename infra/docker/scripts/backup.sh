#!/usr/bin/env bash
# Copia de seguridad CIFRADA de la base de datos de Stocky.
#
#   bash scripts/backup.sh            # crea backups/stocky-AAAAMMDD-HHMMSS.dump.gpg
#
# - El volcado se hace dentro del contenedor y se cifra en el servidor con GPG
#   (AES-256) usando la frase de ./secrets/backup_passphrase (se crea si no existe).
# - Conserva las últimas KEEP copias (por defecto 14).
# - El inventario ya va cifrado dentro de la base de datos; esto añade otra capa.
#   Guarda ./secrets (sobre todo data_keys) en un lugar DISTINTO a las copias.
# Programar a diario (crontab -e):  30 3 * * * cd /ruta/a/Stocky/infra/docker && bash scripts/backup.sh
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

KEEP="${KEEP:-14}"
mkdir -p backups
chmod 700 backups
PASS=secrets/backup_passphrase
if [[ ! -s "$PASS" ]]; then
  openssl rand -base64 48 | tr -d '\n' > "$PASS"
  chmod 600 "$PASS"
  echo "Creada la frase de cifrado de copias en $PASS (guárdala también fuera del servidor)."
fi
command -v gpg >/dev/null || { echo "Falta gpg (apt install gnupg)." >&2; exit 1; }

OUT="backups/stocky-$(date +%Y%m%d-%H%M%S).dump.gpg"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT
# La contraseña se lee del secreto dentro del contenedor (no pasa por la línea de órdenes).
docker compose exec -T db sh -c 'PGPASSWORD="$(cat /run/secrets/postgres_password)" pg_dump -U stocky -d stocky --format=custom --no-owner' \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 \
        --s2k-count 65011712 --passphrase-file "$PASS" -o "$TMP"
mv "$TMP" "$OUT"
echo "Copia creada: $OUT ($(du -h "$OUT" | cut -f1))"

ls -1t backups/stocky-*.dump.gpg | tail -n +$((KEEP + 1)) | xargs -r rm -f
