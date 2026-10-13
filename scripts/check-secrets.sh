#!/usr/bin/env bash
# Revisión básica de secretos en los ficheros versionados (y en el área de
# preparación). No sustituye a una herramienta dedicada (gitleaks, trufflehog),
# pero detecta los errores más comunes antes de publicar.
#
# Uso: scripts/check-secrets.sh
# Sale con código 1 si encuentra coincidencias.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

patterns=(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'                          # AWS access key
  'AIza[0-9A-Za-z_-]{35}'                     # Google API key
  'ghp_[0-9A-Za-z]{36}'                       # GitHub token
  'github_pat_[0-9A-Za-z_]{40,}'
  'xox[abpr]-[0-9A-Za-z-]{10,}'               # Slack
  'sk-[A-Za-z0-9]{32,}'                       # claves estilo OpenAI/Stripe
  'sk-ant-[A-Za-z0-9_-]{20,}'                 # Anthropic
  '(password|passwd|secret|api_key|apikey|token)[[:space:]]*[:=][[:space:]]*["'\''][^"'\'' ]{8,}["'\'']'
  'postgres(ql)?://[^:/ ]+:[^@/ ]+@'          # URL con contraseña
)

# Ficheros que nunca deberían estar versionados.
forbidden_files='(^|/)(\.env(\..*)?|google-services\.json|.*\.(jks|keystore|p12|p8|pem|key)|.*\.(db|sqlite|sqlite3))$'

status=0
files=$(git ls-files --cached --others --exclude-standard | grep -v -E '(^|/)node_modules/|package-lock\.json$|\.png$|\.ttf$' || true)

bad_files=$(echo "$files" | grep -E "$forbidden_files" | grep -v -E '\.env\.example$' || true)
if [[ -n "$bad_files" ]]; then
  echo "Ficheros sensibles que no deberían versionarse:"
  echo "$bad_files" | sed 's/^/  - /'
  status=1
fi

for p in "${patterns[@]}"; do
  # Se excluye este propio script, que contiene los patrones.
  hits=$(echo "$files" | grep -v '^scripts/check-secrets.sh$' | xargs -r grep -n -I -E -i -- "$p" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "Posible secreto (patrón: $p):"
    # Se muestra solo fichero y línea, no el valor.
    echo "$hits" | cut -d: -f1,2 | sed 's/^/  - /'
    status=1
  fi
done

if [[ $status -eq 0 ]]; then
  echo "No se han encontrado secretos ni ficheros sensibles."
fi
exit $status
