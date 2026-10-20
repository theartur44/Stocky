# Montar el servidor de Stocky con Docker

Guía paso a paso para instalar el servidor de sincronización en tu propio servidor (VPS, mini PC, NAS con Docker…). La app funciona sin servidor; el servidor solo hace falta para compartir el inventario y las listas entre los móviles de la familia.

> Estado: el servidor está probado con pruebas automáticas, con PostgreSQL real con TLS y con esta misma pila Docker (Caddy + API + PostgreSQL), incluidas la copia de seguridad y la restauración. **La app todavía no se conecta al servidor**: es la siguiente etapa.

## Qué se instala

```
Móvil ──HTTPS (Let's Encrypt)──▶ Caddy :443 ──▶ API (FastAPI) ──TLS 1.3──▶ PostgreSQL 17
                                  (único con puertos      (sin puertos       (red interna sin
                                   abiertos: 80 y 443)      publicados)        salida a Internet)
```

| Capa | Protección |
|---|---|
| Internet → servidor | HTTPS obligatorio con certificado automático de Let's Encrypt (HTTP redirige a HTTPS), HSTS |
| API → base de datos | TLS 1.3 con certificado verificado (`verify-full`) y contraseña SCRAM; las conexiones sin cifrar se rechazan |
| Datos guardados | El inventario, las listas, los nombres de hogar y dispositivo y los correos se cifran con **AES-256-GCM** antes de guardarse. Aunque alguien copie la base de datos, sin `secrets/data_keys` no puede leerlos |
| Contraseñas | Argon2id; nunca se guardan ni se registran en claro |
| Sesiones | Tokens de 15 minutos y de renovación rotatorios; si se reutiliza uno robado, la sesión se cierra. Cada dispositivo se puede revocar |
| Aislamiento | Cada familia (hogar) solo ve sus datos; el hogar se deduce siempre de la sesión, nunca de lo que envía el móvil |
| Registro | Solo con el **código de registro** que generas tú (nadie de fuera puede crear cuentas) |
| Copias | Volcado diario cifrado con GPG (AES-256), con restauración probada |

## Requisitos

- Un servidor Linux con **Docker Engine 24+** y **Docker Compose v2** (`docker compose version`).
- Un **dominio o subdominio** que apunte a la IP pública del servidor, por ejemplo `stocky.tudominio.es` (registro DNS tipo A, y AAAA si tienes IPv6). Sirve uno gratuito tipo DuckDNS.
- Los puertos **80 y 443** abiertos hacia el servidor (en el router, si está en casa, redirígelos a la IP del servidor). Let's Encrypt necesita el 80 para emitir el certificado.
- `git`, `openssl` y `gpg` instalados en el servidor (`sudo apt install git openssl gnupg`).
- 1 GB de RAM es suficiente para una familia.

## Instalación

### 1. Descargar el proyecto

```bash
git clone https://github.com/theartur44/Stocky.git
cd Stocky/infra/docker
```

(Usa la rama donde esté el servidor; hoy es `ccr-42ebf557-g80t5j`: `git checkout ccr-42ebf557-g80t5j`.)

### 2. Generar los secretos

```bash
bash scripts/generate-secrets.sh
```

Crea la carpeta `secrets/` (ignorada por git, solo accesible por tu usuario) con:

| Fichero | Para qué sirve |
|---|---|
| `postgres_password` | Contraseña de la base de datos |
| `jwt_secret` | Firma de los tokens de sesión |
| `email_pepper` | Clave del índice de correos |
| `data_keys` | **Clave de cifrado de los datos.** Si la pierdes, los datos no se pueden recuperar |
| `registration_code` | Código para crear cuentas (dáselo a tu familia en persona) |
| `db_ca.crt`, `db_server.crt`, `db_server.key` | Certificados TLS internos de PostgreSQL |

El script muestra al final el **código de registro**. Guárdalo.

> **Haz ya una copia de `secrets/`** en un lugar seguro fuera del servidor (gestor de contraseñas, USB cifrado). Sin `data_keys` y `email_pepper`, una copia de la base de datos no sirve de nada.

### 3. Configurar el dominio

```bash
cp .env.example .env
nano .env
```

```ini
STOCKY_DOMAIN=stocky.tudominio.es
ACME_EMAIL=tu-correo@ejemplo.com
STOCKY_REGISTRATION=invite_code
```

### 4. Arrancar

```bash
docker compose up -d --build
docker compose ps
```

Los tres servicios (`caddy`, `api`, `db`) deben aparecer como `Up`, y `api` y `db` como `healthy`. La primera vez la API crea las tablas automáticamente y Caddy obtiene el certificado (puede tardar un minuto).

### 5. Comprobar

```bash
curl https://stocky.tudominio.es/api/v1/health
# {"status":"ok","api":"v1"}
curl https://stocky.tudominio.es/api/v1/ready
# {"status":"ready"}
```

Si funciona, el servidor está listo. Cuando la app tenga la opción de sincronizar, se configurará con la dirección `https://stocky.tudominio.es`.

## Uso diario

| Tarea | Orden (desde `infra/docker`) |
|---|---|
| Ver estado | `docker compose ps` |
| Ver registros | `docker compose logs -f api` (no contienen correos, contraseñas ni datos del inventario) |
| Parar / arrancar | `docker compose stop` / `docker compose start` |
| Actualizar a una versión nueva | `git pull && docker compose up -d --build` (las migraciones se aplican solas) |
| Restablecer la contraseña de alguien | `docker compose exec api python -m app.cli reset-password` |
| Limpiar sesiones, invitaciones y borrados antiguos | `docker compose exec api python -m app.cli purge` |

Programa la limpieza una vez por semana con `crontab -e`:

```cron
15 4 * * 0 cd /ruta/a/Stocky/infra/docker && docker compose exec -T api python -m app.cli purge
```

## Copias de seguridad

```bash
bash scripts/backup.sh
```

Crea `backups/stocky-FECHA.dump.gpg`: un volcado de PostgreSQL cifrado con GPG (AES-256). La frase de cifrado se genera la primera vez en `secrets/backup_passphrase`. Conserva las 14 copias más recientes.

Copia diaria a las 3:30 (`crontab -e`):

```cron
30 3 * * * cd /ruta/a/Stocky/infra/docker && bash scripts/backup.sh >> backups/backup.log 2>&1
```

Recomendaciones:

- Lleva las copias **fuera del servidor** (otro disco, otro equipo o un almacenamiento externo), por ejemplo con `rclone` o `rsync`.
- Guarda `secrets/` en un sitio **distinto** de las copias: si alguien obtiene ambas cosas, podría leer los datos.
- Prueba a restaurar de vez en cuando.

### Restaurar

```bash
bash scripts/restore.sh backups/stocky-20261020-030000.dump.gpg
```

Pide confirmación escribiendo `RESTAURAR`, para la API, sustituye los datos y vuelve a arrancarla. Necesita las **mismas** `data_keys` con las que se guardaron los datos.

## Seguridad recomendada del servidor

- Cortafuegos: deja abiertos solo 22 (SSH), 80 y 443. Con `ufw`: `sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable`. Docker publica solo los puertos de Caddy.
- SSH solo con clave (sin contraseña) y `fail2ban`.
- Actualizaciones automáticas del sistema (`unattended-upgrades`) y `docker compose pull && docker compose up -d --build` cada mes.
- Si el servidor tiene datos de varias familias, cifra también el disco (LUKS). Los datos sensibles ya van cifrados por la aplicación, pero así se protegen además los metadatos (fechas, número de registros).
- No compartas `secrets/` ni el fichero `.env` por chat o correo.

## Rotar la clave de cifrado

1. Genera una clave nueva: `docker compose exec api python -m app.cli generate-secrets` (usa solo la línea `STOCKY_DATA_KEYS`).
2. Edita `secrets/data_keys` y pon la **nueva primero**, separada por coma de la anterior: `k202701:NUEVA...,k202610:ANTERIOR...`
3. `docker compose up -d api`
4. Recifra los datos antiguos: `docker compose exec api python -m app.cli rotate-keys`
5. Cuando termine, puedes quitar la clave antigua del fichero y reiniciar la API.

## Sin dominio público

Si no quieres abrir puertos en casa, alternativas:

- **Tailscale** (VPN privada): instala Tailscale en el servidor y en los móviles, y usa el nombre `*.ts.net` con HTTPS de Tailscale.
- **Cloudflare Tunnel**: publica el servidor sin abrir puertos; Cloudflare termina el HTTPS.

En ambos casos el tráfico sigue cifrado de extremo a extremo hasta el servidor. La app solo aceptará direcciones `https://`.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `caddy` no obtiene certificado | El dominio no apunta a la IP del servidor o el puerto 80 está cerrado. Ver `docker compose logs caddy` |
| `api` no arranca: `... is required in production` | Falta algún fichero en `secrets/` (vuelve a ejecutar `generate-secrets.sh`) |
| `api` no arranca: error de certificado de la base de datos | Se regeneró `db_ca.crt` sin regenerar `db_server.*`. Borra los tres `db_*` y vuelve a ejecutar `generate-secrets.sh` |
| `429 Too Many Requests` | Demasiados intentos de inicio de sesión: espera 10 minutos |
| `internal_error` al leer datos | `data_keys` no es la misma con la que se guardaron los datos |

## Aspectos legales

Al alojar datos de otras personas (aunque sean de tu familia), quien opera el servidor pasa a ser **responsable del tratamiento** de esos datos. Revisa `docs/legal/` (escenario C) antes de ofrecer el servidor a personas fuera de tu hogar.
