# Montar el servidor de Stocky con Docker

Guía para instalar el servidor de sincronización en tu propio equipo: un mini PC, un NAS con Docker, una Raspberry Pi 4/5 o un VPS. La app funciona sin servidor; el servidor solo hace falta para compartir el inventario y las listas entre los móviles de la familia.

> **Estado:** el servidor y la app están conectados. Cuentas, hogares, invitaciones y sincronización están probados con pruebas automáticas y de extremo a extremo (dos móviles simulados contra el servidor real). Falta probarlo en móviles reales.

## Resumen: tres pasos

```bash
# 1. En el servidor (una vez): instala Docker → https://docs.docker.com/engine/install/
# 2. Descarga Stocky
git clone https://github.com/theartur44/Stocky.git
cd Stocky/infra/docker
# 3. Instala y arranca (te pregunta la IP o el dominio)
./stocky.sh
```

Al terminar, el script muestra lo que hay que poner en la app:

```
En la app (Ajustes → Servidor y hogar compartido):
  Dirección del servidor:  192.168.1.50
  Código de registro:      Xk3p...
```

Toda la configuración está en un solo fichero, `infra/docker/.env`, que crea el script la primera vez. Para cambiarla: `./stocky.sh configurar`.

## Elegir: IP de casa o dominio

| | **IP de tu red** (p. ej. `192.168.1.50`) | **Dominio** (p. ej. `stocky.midominio.com`) |
|---|---|---|
| Para qué | Usar Stocky solo dentro de la wifi de casa | Usarlo también fuera de casa |
| Conexión móvil ↔ servidor | HTTP **sin cifrar** dentro de tu red (la app lo avisa) | **HTTPS** con certificado automático de Let's Encrypt |
| Qué necesitas | Nada más. Conviene reservar la IP del servidor en el router (IP fija por DHCP) | Un dominio o subdominio que apunte a tu IP pública (vale uno gratuito tipo DuckDNS) y los puertos 80 y 443 redirigidos al servidor |
| Seguridad | No abras este puerto en el router. Los datos siguen cifrados dentro de la base de datos y entre la API y PostgreSQL | Recomendado |

La app solo permite `http://` hacia direcciones de red local (192.168.x.x, 10.x.x.x, 172.16-31.x.x, `*.local`). Para cualquier otra dirección exige `https://`.

## Qué se instala

```
Móvil ──HTTPS (dominio) o HTTP (IP de casa)──▶ Caddy ──▶ API (FastAPI) ──TLS 1.3──▶ PostgreSQL 17
                                              (único con     (sin puertos        (red interna sin
                                               puertos)       publicados)          salida a Internet)
```

| Capa | Protección |
|---|---|
| Móvil → servidor | Con dominio: HTTPS obligatorio (HTTP redirige a HTTPS) y HSTS. Con IP: HTTP solo en la red local |
| API → base de datos | TLS 1.3 con certificado verificado (`verify-full`) y contraseña SCRAM; las conexiones sin cifrar se rechazan |
| Datos guardados | El inventario, las listas, los nombres de hogar y dispositivo y los correos se cifran con **AES-256-GCM** antes de guardarse. Aunque alguien copie la base de datos, sin `secrets/data_keys` no puede leerlos |
| Contraseñas | Argon2id; nunca se guardan ni se registran en claro |
| Sesiones | Tokens de 15 minutos y de renovación rotatorios; si se reutiliza uno robado, la sesión se cierra. En el móvil se guardan en el almacén seguro de Android |
| Aislamiento | Cada hogar solo ve sus datos; el hogar se deduce siempre de la sesión, nunca de lo que envía el móvil |
| Registro | Solo con el **código de registro** que genera la instalación (nadie de fuera puede crear cuentas) |
| Copias | Volcado cifrado con GPG (AES-256), con restauración probada |

## Requisitos

- Linux con **Docker Engine 24+** y **Docker Compose v2** (`docker compose version`). Sirve también un NAS con Docker (Synology, QNAP, Unraid…) si tienes acceso por SSH.
- `git`, `openssl`, `curl` y `gpg`: `sudo apt install git openssl curl gnupg`.
- 1 GB de RAM es suficiente para una familia.
- Solo en modo dominio: el dominio apuntando a tu IP pública y los puertos **80 y 443** redirigidos en el router hacia el servidor.

## Instalación detallada

1. **Descarga el proyecto** en el servidor:
   ```bash
   git clone https://github.com/theartur44/Stocky.git
   cd Stocky/infra/docker
   ```
2. **Ejecuta el instalador**:
   ```bash
   ./stocky.sh
   ```
   - Te propone la IP del servidor en tu red. Pulsa Intro para aceptarla o escribe un dominio.
   - Con IP: te pregunta el puerto (80 por defecto; usa otro, p. ej. 8080, si el 80 ya está ocupado).
   - Con dominio: te pide un correo para Let's Encrypt.
   - Genera los secretos en `secrets/` (contraseñas, claves de cifrado y certificados de la base de datos), construye la API y arranca los tres contenedores. Las migraciones de la base de datos se aplican solas.
3. **Guarda una copia de `secrets/`** en un lugar seguro, fuera del servidor (un USB o un gestor de contraseñas). Sin `data_keys` los datos no se pueden recuperar.

Si usas `sudo` para Docker: `sudo ./stocky.sh`.

## Conectar la app

1. En el primer móvil: **Ajustes → Servidor y hogar compartido → Configurar**.
2. **Dirección del servidor**: lo que mostró el instalador (`192.168.1.50`, `192.168.1.50:8080` o `stocky.midominio.com`). No hace falta escribir `http://` ni `https://`.
3. Elige **Crear cuenta**, escribe tu correo, una contraseña (mínimo 12 caracteres) y el **código de registro**, y pulsa **Conectar**.
4. **Crea el hogar** (p. ej. «Casa»). Lo que ya tenías en el móvil se sube al hogar.
5. Pulsa **Invitar a alguien** y comparte el código de invitación (válido 24 horas y para una sola persona).
6. En cada móvil más: Configurar → misma dirección → **Crear cuenta** con el código de registro → **Unirme** con su código de invitación. Sus datos se suman a los del hogar; los productos con el mismo código de barras y las listas con el mismo nombre se fusionan.

A partir de ahí la app se sincroniza sola: al abrirla, a los pocos segundos de cada cambio y cada minuto mientras está abierta. Sin conexión sigue funcionando y envía los cambios al volver. Los consumos hechos a la vez en dos móviles se suman, no se pisan.

## Uso diario

| Tarea | Orden (desde `infra/docker`) |
|---|---|
| Ver qué poner en la app (dirección y código de registro) | `./stocky.sh datos` |
| Ver estado | `./stocky.sh estado` |
| Ver registros | `./stocky.sh logs` (no contienen correos, contraseñas ni datos del inventario) |
| Parar / arrancar / reiniciar | `./stocky.sh parar` / `./stocky.sh arrancar` / `./stocky.sh reiniciar` |
| Cambiar la IP, el dominio o el puerto | `./stocky.sh configurar` (después, cambia la dirección en la app: Desconectar y volver a entrar) |
| Actualizar a una versión nueva | `./stocky.sh actualizar` (las migraciones se aplican solas) |
| Copia de seguridad cifrada | `./stocky.sh copia` |
| Restablecer la contraseña de alguien | `docker compose exec api python -m app.cli reset-password` |
| Limpiar sesiones, invitaciones y borrados antiguos | `docker compose exec api python -m app.cli purge` |

Programa la limpieza una vez por semana con `crontab -e`:

```cron
15 4 * * 0 cd /ruta/a/Stocky/infra/docker && docker compose exec -T api python -m app.cli purge
```

## Copias de seguridad

```bash
./stocky.sh copia        # equivale a: bash scripts/backup.sh
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

- Cortafuegos: deja abiertos solo 22 (SSH) y los puertos de Caddy (80 y 443 con dominio; el puerto HTTP elegido con IP). Con `ufw`: `sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable`. Docker publica solo los puertos de Caddy.
- En modo IP, **no** redirijas el puerto en el router: el servidor debe quedar solo en tu red.
- SSH solo con clave (sin contraseña) y `fail2ban`.
- Actualizaciones automáticas del sistema (`unattended-upgrades`) y `./stocky.sh actualizar` cada mes.
- Si el servidor tiene datos de varias familias, cifra también el disco (LUKS). Los datos sensibles ya van cifrados por la aplicación, pero así se protegen además los metadatos (fechas, número de registros).
- No compartas `secrets/` ni el fichero `.env` por chat o correo.

## Rotar la clave de cifrado

1. Genera una clave nueva: `docker compose exec api python -m app.cli generate-secrets` (usa solo la línea `STOCKY_DATA_KEYS`).
2. Edita `secrets/data_keys` y pon la **nueva primero**, separada por coma de la anterior: `k202701:NUEVA...,k202610:ANTERIOR...`
3. `docker compose up -d api`
4. Recifra los datos antiguos: `docker compose exec api python -m app.cli rotate-keys`
5. Cuando termine, puedes quitar la clave antigua del fichero y reiniciar la API.

## Usarlo fuera de casa sin abrir puertos

Con el modo IP solo funciona dentro de tu wifi. Para usarlo fuera sin abrir puertos en el router:

- **Tailscale** (VPN privada): instala Tailscale en el servidor y en los móviles y usa el nombre `*.ts.net` con HTTPS de Tailscale como dominio.
- **Cloudflare Tunnel**: publica el servidor sin abrir puertos; Cloudflare termina el HTTPS.

En ambos casos la conexión va cifrada y en la app se usa la dirección `https://`.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| La app dice «No se puede conectar con el servidor» | El móvil no está en la misma wifi (modo IP), la dirección o el puerto no son los que muestra `./stocky.sh datos`, o el cortafuegos del servidor bloquea el puerto |
| Funcionaba y deja de conectar tras reiniciar el router | La IP del servidor ha cambiado: resérvala en el router y ejecuta `./stocky.sh configurar` |
| «En esa dirección no hay un servidor de Stocky» | Otro servicio usa ese puerto; elige otro con `./stocky.sh configurar` |
| `caddy` no obtiene certificado | El dominio no apunta a la IP del servidor o el puerto 80 está cerrado. Ver `docker compose logs caddy` |
| `api` no arranca: `... is required in production` | Falta algún fichero en `secrets/` (vuelve a ejecutar `./stocky.sh`) |
| `api` no arranca: error de certificado de la base de datos | Se regeneró `db_ca.crt` sin regenerar `db_server.*`. Borra los tres `db_*` y vuelve a ejecutar `./stocky.sh` |
| `429 Too Many Requests` | Demasiados intentos de inicio de sesión: espera 10 minutos |
| `internal_error` al leer datos | `data_keys` no es la misma con la que se guardaron los datos |

## Aspectos legales

Al alojar datos de otras personas (aunque sean de tu familia), quien opera el servidor pasa a ser **responsable del tratamiento** de esos datos. Revisa `docs/legal/` (escenario C) antes de ofrecer el servidor a personas fuera de tu hogar.
