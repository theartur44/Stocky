#!/usr/bin/env bash
# Restaura una copia cifrada creada con backup.sh. ¡SUSTITUYE los datos actuales!
#
#   bash scripts/restore.sh backups/stocky-AAAAMMDD-HHMMSS.dump.gpg
#
# Requiere ./secrets/backup_passphrase y las MISMAS data_keys con las que se
# cifraron los datos (sin ellas, el inventario restaurado no se puede leer).
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Indica el fichero de copia}"
[[ -s secrets/backup_passphrase ]] || { echo "Falta secrets/backup_passphrase" >&2; exit 1; }
read -r -p "Esto borrará los datos actuales y restaurará $FILE. Escribe RESTAURAR para continuar: " ok
[[ "$ok" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }

docker compose stop api
# Pase lo que pase, la API vuelve a arrancar al terminar.
trap 'docker compose start api >/dev/null' EXIT
gpg --batch --decrypt --passphrase-file secrets/backup_passphrase "$FILE" \
  | docker compose exec -T db sh -c 'PGPASSWORD="$(cat /run/secrets/postgres_password)" pg_restore -U stocky -d stocky --clean --if-exists --no-owner --single-transaction'
echo "Restauración completada."
