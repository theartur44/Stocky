# Stocky

**Tu despensa, nevera y lista de la compra, siempre al día.**

Stocky es una app para Android que te ayuda a saber qué tienes en casa, qué caduca pronto y qué hay que comprar. Escaneas los productos con la cámara y la app se encarga del resto: te avisa antes de que algo caduque, te sugiere recetas con lo que tienes y lleva la lista de la compra.

Funciona **sin conexión y sin cuenta**: todo se guarda en tu móvil. Si quieres compartir el inventario con tu familia, puedes montar tu **propio servidor** en casa con Docker (instrucciones más abajo). Sin publicidad, sin analítica y sin rastreadores.

## Qué puedes hacer

- **Escanear la compra en un momento.** Abre el escáner y ve pasando productos: cada código se añade al instante y los datos (nombre, marca, tamaño) se buscan solos en [Open Food Facts](https://world.openfoodfacts.org), solo si das permiso. Al terminar, lo guardas todo de una vez en casa o en la lista.
- **Inventario por ubicación:** nevera, congelador o despensa, con cantidades, envases y fechas. Cuando gastas algo, se descuenta primero lo que caduca antes.
- **Fechas de caducidad y de consumo preferente**, con avisos en el móvil unos días antes. Por defecto, los avisos no muestran nombres de productos en la pantalla de bloqueo.
- **Lista de la compra** rápida: escribe «2 leche» o «tomates 1 kg», recibe sugerencias de lo que se está acabando y, al volver de comprar, pasa lo comprado al inventario con un toque.
- **Recetas** sugeridas con lo que tienes, empezando por lo que caduca antes.
- **Hogar compartido (opcional):** con tu servidor, toda la familia ve el mismo inventario y la misma lista, también sin conexión. Los cambios se sincronizan solos.
- **Seguridad:** cuentas con verificación en dos pasos y desbloqueo de la app con huella.
- **A tu gusto:** seis colores, modo claro, oscuro o automático, y un estilo moderno tipo «cristal».

## Instalar la app

1. Descarga el fichero **`stocky-X.Y.Z.apk`** de la última versión en **[Releases](https://github.com/theartur44/Stocky/releases/latest)**.
2. Ábrelo en el móvil. Android te pedirá permitir «instalar aplicaciones desconocidas» para el navegador o el gestor de archivos con el que lo abras.
3. Al abrir Stocky por primera vez, elige:
   - **Continuar como invitado:** todo se guarda solo en tu móvil. Podrás iniciar sesión más tarde.
   - **Iniciar sesión / Crear una cuenta:** para compartir el inventario a través de tu servidor (ver abajo).

**Actualizaciones:** cuando haya una versión nueva, la app te avisará en Inicio con un botón para descargarla. Se instala encima y tus datos se conservan.

Requisitos: Android 7.0 o superior.

## Montar el servidor (opcional) con Docker

El servidor sirve para que **varios móviles compartan** el inventario y las listas. Lo instalas tú, en tu casa o en tu propio servidor, y los datos no salen de ahí.

### Qué necesitas

- Un equipo con **Linux** encendido de forma continua: un mini PC, una Raspberry Pi 4/5, un NAS con Docker o un servidor. Con 1 GB de RAM es suficiente.
- **Docker** con **Docker Compose**, más `git`, `openssl` y `curl`:
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  sudo apt install -y git openssl curl gnupg
  ```
  > ⚠️ No uses el Docker de **snap**, el que ofrece el instalador de Ubuntu Server. Está aislado y no puede leer carpetas como `/opt`, y la instalación falla con «bind source path does not exist». Compruébalo con `which docker`: si sale `/snap/bin/docker`, instala el oficial con el comando de arriba o pon Stocky dentro de `/home`.

### Instalación (3 comandos)

```bash
git clone https://github.com/theartur44/Stocky.git
cd Stocky/infra/docker
./stocky.sh
```

El instalador te hace unas preguntas:

| Pregunta | Qué responder |
|---|---|
| **Dirección** | Para usarlo **en casa**: la IP del servidor en tu red (te la propone; pulsa Intro). Para usarlo **también fuera** con HTTPS automático: un dominio que apunte a tu IP pública, con los puertos 80 y 443 abiertos en el router. |
| **Puerto HTTP** (modo IP) | `80`, u otro (p. ej. `8080`) si ya lo usa otro servicio. |
| **Dominio del túnel** (modo IP, opcional) | Si publicas el servidor con un túnel que pone el HTTPS (Cloudflare Tunnel, Tailscale Funnel…), su dominio. Configura el túnel para que apunte a `http://IP-del-servidor:PUERTO`. Si no, pulsa Intro. |
| **Correo** (modo dominio) | Para el certificado HTTPS de Let's Encrypt. |

Después genera las claves, arranca todo y te muestra lo que tienes que poner en la app:

```
Dirección del servidor:  192.168.1.50:8080
Código de registro:      Xk3p…
```

**Guarda una copia de la carpeta `infra/docker/secrets/` fuera del servidor**, por ejemplo en un USB. Sin ella los datos no se pueden recuperar.

### Conectar la app

1. En el primer móvil: **Ajustes → Servidor y hogar compartido → Configurar**, o «Crear una cuenta» en la bienvenida.
2. Escribe la **dirección** del servidor, tu **correo**, una **contraseña** (mínimo 12 caracteres) y el **código de registro**.
3. **Crea tu hogar.** Lo que ya tuvieras en el móvil se sube al hogar.
4. Pulsa **Invitar a alguien** y pasa el código de invitación a cada familiar. Vale 24 horas y para una sola persona. En su móvil: crear cuenta con el código de registro y luego **Unirme** con el código de invitación.

Recomendado: en **Mi cuenta y seguridad**, activa la **verificación en dos pasos** con una app autenticadora (Google Authenticator, Aegis…) y guarda los códigos de recuperación.

### Mantenimiento

Desde la carpeta `infra/docker`:

| Para… | Comando |
|---|---|
| Ver la dirección y el código de registro | `./stocky.sh datos` |
| Ver si todo funciona | `./stocky.sh estado` |
| Actualizar a la última versión | `./stocky.sh actualizar` |
| Cambiar la IP, el puerto, el dominio o el túnel | `./stocky.sh configurar` |
| Copia de seguridad cifrada | `./stocky.sh copia` |
| Ver los registros | `./stocky.sh logs` |
| Parar / arrancar / reiniciar | `./stocky.sh parar` · `arrancar` · `reiniciar` |
| Quitar la verificación en dos pasos a quien perdió el móvil | `docker compose exec api python -m app.cli reset-mfa` |
| Cambiar la contraseña de alguien que la olvidó | `docker compose exec api python -m app.cli reset-password` |

Guía completa (copias automáticas, restauración, cortafuegos y problemas frecuentes): [docs/servidor-docker.md](docs/servidor-docker.md).

### Cómo se protegen los datos

- **Conexión:** con dominio o túnel, va cifrada con HTTPS. Con la IP de casa va sin cifrar dentro de tu red; la app lo avisa y solo lo permite con direcciones de red local.
- **Almacenamiento:** el inventario, las listas, los correos y los nombres se guardan **cifrados** (AES-256) en la base de datos. Aunque alguien copie la base de datos, sin las claves de `secrets/` no puede leerla.
- **Contraseñas:** nunca se guardan en claro. Hay límite de intentos y verificación en dos pasos opcional.
- **Aislamiento:** cada hogar solo ve sus datos. La base de datos no está expuesta a Internet.

## Privacidad

- **Sin servidor**, todo se queda en tu móvil. Las copias de seguridad automáticas de Android están desactivadas para Stocky.
- **Conexiones externas**, solo estas:
  - el **código de barras** a Open Food Facts, si das permiso;
  - una consulta diaria a **GitHub** para avisarte de versiones nuevas, que se desactiva en Ajustes;
  - **tu servidor**, si lo configuras.
- **Sin publicidad**, analítica ni rastreadores.
- **Borrar datos:** desde Ajustes puedes borrar todos los datos del móvil.

Más detalles en [docs/legal](docs/legal/README.md). Los fallos de seguridad se comunican en privado: [SECURITY.md](SECURITY.md).

## Licencia

Stocky es **código abierto** bajo la [licencia MIT](LICENSE). Los componentes de terceros mantienen sus licencias ([detalle](docs/legal/licencias-de-terceros.md)). Los datos de productos proceden de Open Food Facts (licencia ODbL).
