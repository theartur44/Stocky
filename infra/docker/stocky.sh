#!/usr/bin/env bash
# Servidor de Stocky en Docker: instalar, actualizar y mantener.
#
#   git clone https://github.com/theartur44/Stocky.git
#   cd Stocky/infra/docker
#   ./stocky.sh                 # instala (pregunta la IP o el dominio) y arranca
#
# Otros comandos:
#   ./stocky.sh configurar      # cambiar la dirección (IP o dominio) o los puertos
#   ./stocky.sh actualizar      # descarga la última versión y reinicia
#   ./stocky.sh estado          # contenedores y comprobación de la API
#   ./stocky.sh datos           # qué poner en la app (dirección y código de registro)
#   ./stocky.sh logs            # registros (Ctrl+C para salir)
#   ./stocky.sh reiniciar | parar | arrancar
#   ./stocky.sh copia           # copia de seguridad cifrada (scripts/backup.sh)
#
# Requisitos: Docker con el plugin «docker compose», openssl y curl.
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=.env
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

compose() { docker compose --env-file "$ENV_FILE" "$@"; }

need() {
  command -v docker >/dev/null || fail "Docker no está instalado (https://docs.docker.com/engine/install/)."
  docker compose version >/dev/null 2>&1 || fail "Falta el plugin «docker compose»."
  command -v openssl >/dev/null || fail "Falta openssl (apt install openssl)."
  command -v curl >/dev/null || fail "Falta curl (apt install curl)."
  docker info >/dev/null 2>&1 || fail "No se puede usar Docker. ¿Está arrancado? ¿Tu usuario está en el grupo «docker» (o usas sudo)?"
}

# Lee una variable de .env (sin ejecutar el fichero).
env_get() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 || true; }

# Escribe KEY=valor en .env sin pasar el valor por sed (no admite caracteres que
# puedan romper .env o el Caddyfile).
env_set() {
  local key=$1 value=$2 tmp
  [[ $value =~ ^[A-Za-z0-9@._:/\ +-]*$ ]] || fail "Valor no válido para $key: $value"
  touch "$ENV_FILE"
  tmp=$(mktemp "$ENV_FILE.XXXXXX")
  K=$key V=$value awk 'BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"] }
    index($0, k "=") == 1 { if (!done) print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$ENV_FILE" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

# 10#: «010» es 10 en decimal (bash lo leería como octal).
is_ipv4() { [[ $1 =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] && for o in "${BASH_REMATCH[@]:1}"; do ((10#$o <= 255)) || return 1; done; }
is_port() { [[ $1 =~ ^[1-9][0-9]{0,4}$ ]] && (($1 <= 65535)); }
is_email() { [[ $1 =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; }
is_domain() { [[ $1 =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]; }
is_private_ip() { [[ $1 =~ ^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.) ]]; }

suggest_ip() { hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -n 1 || true; }

ask_address() {
  local current suggestion address email port tunnel
  current=$(env_get STOCKY_ADDRESS)
  suggestion=${current:-$(suggest_ip)}
  echo
  bold "¿Cómo llegarán los móviles a este servidor?"
  info "· La IP del servidor en tu red de casa (p. ej. 192.168.1.50): funciona dentro de tu wifi, sin cifrar."
  info "· Un dominio que apunte a este servidor (p. ej. stocky.midominio.com): HTTPS automático, también desde fuera."
  while true; do
    read -r -p "Dirección [${suggestion}]: " address
    address=${address:-$suggestion}
    address=${address#http://}
    address=${address#https://}
    address=${address%%/*}
    if is_ipv4 "$address"; then
      is_private_ip "$address" || info "Aviso: $address no es una IP privada. En modo IP la conexión no va cifrada: no la expongas a Internet."
      env_set STOCKY_ADDRESS "$address"
      env_set STOCKY_MODE lan
      read -r -p "Puerto HTTP [$(env_get STOCKY_HTTP_PORT | grep . || echo 80)]: " port
      port=${port:-$(env_get STOCKY_HTTP_PORT | grep . || echo 80)}
      is_port "$port" || fail "Puerto no válido: $port"
      env_set STOCKY_HTTP_PORT "$port"
      # En modo IP no se usa HTTPS: el puerto 443 queda solo en local para no chocar con otros servicios.
      env_set STOCKY_HTTPS_PORT 127.0.0.1:8443
      echo
      info "¿Vas a publicarlo además con un túnel que pone el HTTPS (Cloudflare Tunnel, Tailscale Funnel…)?"
      info "Escribe su dominio (p. ej. stocky.midominio.com) o pulsa Intro si no (se puede añadir después con ./stocky.sh configurar)."
      read -r -p "Dominio del túnel [$(env_get STOCKY_TUNNEL_DOMAIN)]: " tunnel
      tunnel=${tunnel:-$(env_get STOCKY_TUNNEL_DOMAIN)}
      tunnel=${tunnel#https://}
      tunnel=${tunnel%%/*}
      if [[ -n $tunnel ]]; then
        is_domain "$tunnel" || fail "Dominio no válido: $tunnel"
        env_set STOCKY_TUNNEL_DOMAIN "${tunnel,,}"
        info "Configura el túnel para que envíe https://${tunnel,,} a http://$address:$port (o a http://localhost:$port si el túnel corre en este mismo equipo)."
      fi
      ask_proxy
      break
    elif is_domain "$address"; then
      env_set STOCKY_ADDRESS "${address,,}"
      env_set STOCKY_MODE domain
      env_set STOCKY_HTTP_PORT 80
      env_set STOCKY_HTTPS_PORT 443
      env_set STOCKY_TUNNEL_DOMAIN ""
      read -r -p "Correo para el certificado HTTPS (Let's Encrypt) [$(env_get ACME_EMAIL)]: " email
      email=${email:-$(env_get ACME_EMAIL)}
      is_email "$email" || fail "Correo no válido."
      env_set ACME_EMAIL "$email"
      info "Recuerda: el dominio debe apuntar a la IP pública de este servidor y el router debe redirigir los puertos 80 y 443."
      break
    else
      info "Escribe una IP (192.168.1.50) o un dominio (stocky.midominio.com)."
    fi
  done
}

# IP del proxy que hay delante (Nginx Proxy Manager, túnel…), para conocer la IP real de cada móvil.
ask_proxy() {
  local current proxies p
  current=$(env_get STOCKY_TRUSTED_PROXIES)
  echo
  info "¿Hay otro proxy delante de Stocky (Nginx Proxy Manager, un túnel en este equipo…)?"
  info "Escribe su IP tal como llega a Stocky (la que sale en todas las líneas de ./stocky.sh logs), o Intro si no."
  info "Escribe «-» para quitarla."
  read -r -p "IP del proxy [${current}]: " proxies
  proxies=${proxies:-$current}
  [[ $proxies == "-" ]] && proxies=""
  for p in $proxies; do
    p=${p%/32}
    is_ipv4 "$p" || fail "IP no válida: $p (escribe una IP concreta, p. ej. 172.18.0.1)"
  done
  env_set STOCKY_TRUSTED_PROXIES "$(for p in $proxies; do printf '%s/32 ' "${p%/32}"; done | sed 's/ $//')"
}

ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp .env.example "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    env_set STOCKY_ADDRESS ""
    ask_address
  fi
  [[ -n "$(env_get STOCKY_ADDRESS)" ]] || ask_address
}

app_url() {
  local address mode port
  address=$(env_get STOCKY_ADDRESS)
  mode=$(env_get STOCKY_MODE)
  port=$(env_get STOCKY_HTTP_PORT)
  if [[ $mode == domain ]]; then echo "https://$address"
  elif [[ -z $port || $port == 80 ]]; then echo "$address"
  else echo "$address:$port"
  fi
}

wait_healthy() {
  local url mode i
  mode=$(env_get STOCKY_MODE)
  if [[ $mode == domain ]]; then url="https://$(env_get STOCKY_ADDRESS)/api/v1/health"
  else url="http://127.0.0.1:$(env_get STOCKY_HTTP_PORT | grep . || echo 80)/api/v1/health"
  fi
  printf '  Esperando a que la API responda'
  for i in $(seq 1 60); do
    if curl -fsS --max-time 3 -H "Host: $(env_get STOCKY_ADDRESS)" "$url" 2>/dev/null | grep -q '"ok"'; then
      echo " ✔"
      return 0
    fi
    printf '.'
    sleep 3
  done
  echo
  info "La API todavía no responde en $url."
  [[ $mode == domain ]] && info "En modo dominio, comprueba el DNS y los puertos 80/443 (el certificado puede tardar un minuto)."
  info "Revisa los registros con: ./stocky.sh logs"
  return 1
}

show_data() {
  echo
  bold "En la app (Ajustes → Servidor y hogar compartido):"
  info "Dirección del servidor:  $(app_url)"
  [[ -n "$(env_get STOCKY_TUNNEL_DOMAIN)" ]] && info "Desde fuera de casa (túnel): $(env_get STOCKY_TUNNEL_DOMAIN)"
  if [[ "$(env_get STOCKY_REGISTRATION)" != "open" && -s secrets/registration_code ]]; then
    info "Código de registro:      $(cat secrets/registration_code)"
    info "(Compártelo solo con tu familia. La primera persona crea el hogar y luego invita a las demás desde la app.)"
  fi
  [[ $(env_get STOCKY_MODE) == lan ]] && info "Modo red local: la app avisará de que la conexión va sin cifrar. Úsala solo en casa."
  echo
}

# Genera las claves que falten (no toca las que ya existen) y comprueba que están todas
# antes de arrancar: sin ellas Docker falla con «bind source path does not exist».
ensure_secrets() {
  local f out missing=()
  # Con una base de datos ya creada, regenerar estas claves dejaría los datos ilegibles o inaccesibles.
  if docker volume inspect stocky_db-data >/dev/null 2>&1; then
    for f in data_keys postgres_password; do
      [[ -s "secrets/$f" ]] || fail "Falta secrets/$f pero ya existe la base de datos de Stocky. No se genera una nueva porque los datos quedarían inaccesibles: restaura la carpeta secrets/ desde tu copia de seguridad."
    done
  fi
  out=$(bash scripts/generate-secrets.sh)
  sed -n '/^  [+]/p' <<<"$out"
  # Certificado de la base de datos renovado: hay que recrear el contenedor para que lo use.
  grep -q '^  + db_server.crt' <<<"$out" && RECREATE_DB=1
  for f in postgres_password jwt_secret email_pepper data_keys registration_code db_ca.crt db_server.crt db_server.key; do
    [[ -s "secrets/$f" ]] || missing+=("$f")
  done
  ((${#missing[@]} == 0)) || fail "Faltan claves en ./secrets: ${missing[*]}. Ejecuta: bash scripts/generate-secrets.sh"
}

RECREATE_DB=0
recreate_db_if_needed() {
  if ((RECREATE_DB)) && docker volume inspect stocky_db-data >/dev/null 2>&1; then
    info "Aplicando el certificado nuevo de la base de datos…"
    compose up -d --force-recreate db
  fi
}

cmd_install() {
  need
  ensure_env
  bold "Generando secretos (solo la primera vez)…"
  ensure_secrets
  bold "Construyendo y arrancando los contenedores…"
  compose up -d --build
  wait_healthy || true
  show_data
  info "Haz una copia de ./secrets en un lugar seguro: sin data_keys los datos no se pueden recuperar."
  info "Copias de seguridad automáticas: ./stocky.sh copia (o prográmala con cron, ver docs/servidor-docker.md)."
}

case "${1:-instalar}" in
  instalar | install) cmd_install ;;
  configurar)
    need
    [[ -f "$ENV_FILE" ]] || { cp .env.example "$ENV_FILE"; chmod 600 "$ENV_FILE"; }
    ask_address
    ensure_secrets
    compose up -d --build --remove-orphans
    recreate_db_if_needed
    wait_healthy || true
    show_data
    ;;
  actualizar | update)
    need
    git fetch --quiet
    if [[ -n "$(git log --oneline 'HEAD..@{u}')" ]]; then
      bold "Cambios nuevos:"
      git log --oneline --no-decorate 'HEAD..@{u}' | head -n 20 | sed 's/^/  /'
      git pull --ff-only --quiet
    else
      info "El código ya está al día."
    fi
    ensure_secrets
    # También las imágenes base (Caddy, PostgreSQL y Python), con sus parches de seguridad.
    compose pull caddy db
    compose build --pull api
    compose up -d --remove-orphans
    recreate_db_if_needed
    wait_healthy || true
    docker image prune -f >/dev/null
    ;;
  estado | status)
    compose ps
    wait_healthy || true
    ;;
  datos) show_data ;;
  logs) compose logs -f --tail 100 ;;
  reiniciar) ensure_secrets && compose up -d --force-recreate ;;
  parar) compose stop ;;
  arrancar) ensure_secrets && compose up -d ;;
  copia | backup) bash scripts/backup.sh ;;
  -h | --help | ayuda) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) fail "Comando desconocido: $1 (usa ./stocky.sh ayuda)" ;;
esac
