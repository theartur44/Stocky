# Publicar una versión nueva de Stocky

Cuando publicas una *release* en GitHub, se compila el APK y se adjunta solo. A partir de ahí, las apps instaladas muestran en Inicio el aviso **«Nueva versión X disponible»**, con un botón para descargarla.

## Requisito: repositorio público

La app consulta `https://api.github.com/repos/theartur44/Stocky/releases/latest` **sin credenciales**: en el APK no puede ir ninguna clave de GitHub, porque cualquiera podría extraerla. Con el repositorio **privado**, GitHub responde «no encontrado», la app no avisa de nada y tampoco da error.

Para que funcione, haz público el repositorio (*Settings → General → Danger Zone → Change repository visibility*). Es coherente con la licencia MIT. Antes de hacerlo:

- Ejecuta `bash scripts/check-secrets.sh`: no debe encontrar secretos. El historial del repositorio también se hace público.
- Los secretos del servidor (`infra/docker/secrets/`, `.env`) nunca se suben: están en `.gitignore`.

Si prefieres mantenerlo privado, se puede publicar solo los APK en otro repositorio público y cambiar `expo.extra.updates.repo` en `apps/android/app.json`.

## Publicar (cada versión)

1. En GitHub: **Releases → Draft a new release**.
2. **Choose a tag**: escribe la versión nueva con el formato `v0.2.0` (cada número de 0 a 99) y pulsa *Create new tag*. En **Target** elige la rama con los cambios.
3. Pon un título y, si quieres, pulsa *Generate release notes*.
4. **Publish release**.

El flujo **«Publicar versión»** (*Actions*) tarda unos 20 minutos. Hace esto:

- pone la versión de la etiqueta en la app (`expo.version` = 0.2.0 y `versionCode` = 200, que siempre crece);
- pasa las pruebas, compila el APK y lo adjunta a la release como `stocky-0.2.0.apk`, junto con su `.sha256`.

Mientras el APK no está adjunto, la app no avisa.

Alternativa: *Actions → Publicar versión → Run workflow*, escribiendo la versión. Crea la release sobre la rama elegida y adjunta el APK.

## Qué ve quien usa la app

- **Comprobación:** una vez al día, al abrir la app, consulta la última versión publicada. Solo se pide el número de versión; la petición no lleva datos del usuario, aunque GitHub ve la IP, como cualquier web.
- **Aviso en Inicio:** si hay una versión nueva, aparece un aviso con **Descargar** (abre el APK en el navegador; Android lo descarga y pregunta si instalarlo) y **Novedades**. La X lo oculta hasta la siguiente versión.
- **Ajustes → Acerca de:** muestra la versión instalada, el botón «Buscar actualizaciones» y el interruptor para desactivar el aviso.
- **Datos:** al instalar encima se conservan todos los datos.

## Firma con una clave propia (una sola vez, muy recomendable)

Sin clave propia, los APK se firman con la clave de pruebas de la plantilla, que es **pública**. Cualquiera podría crear un APK que Android aceptara como «actualización» de Stocky.

Con una clave propia, solo tus APK pueden actualizar la app.

1. Crea la clave en tu ordenador. `keytool` viene con Android Studio:
   ```bat
   "C:\Program Files\Android\Android Studio\jbr\bin\keytool" -genkeypair -v -keystore stocky-release.keystore -alias stocky -keyalg RSA -keysize 4096 -validity 10000
   ```
   Pide una contraseña y unos datos (nombre, etc.).
2. **Guarda `stocky-release.keystore` y la contraseña en un lugar seguro**, fuera del repositorio. Sin ellos no se pueden publicar actualizaciones de la app.
3. Convierte el fichero a texto (PowerShell). El resultado queda copiado en el portapapeles:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("stocky-release.keystore")) | Set-Clipboard
   ```
4. En GitHub: *Settings → Secrets and variables → Actions → New repository secret*. Crea:

   | Nombre | Valor |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | lo copiado en el paso 3 |
   | `ANDROID_KEYSTORE_PASSWORD` | la contraseña del almacén |
   | `ANDROID_KEY_ALIAS` | `stocky` |
   | `ANDROID_KEY_PASSWORD` | la contraseña de la clave (la misma, si no pusiste otra) |

A partir de ahí, las releases y los APK de pruebas se firman con tu clave. Las contraseñas se leen de los *secrets* al compilar; nunca se escriben en el proyecto (`apps/android/plugins/withReleaseSigning.js`).

**Importante, solo la primera vez:** un móvil que tenga instalado un APK firmado con la clave de pruebas no acepta encima uno firmado con tu clave (Android avisa de conflicto). Hay que **desinstalar la app una vez** e instalar la nueva. Los datos que estén solo en el móvil se pierden. Si usas el servidor, al volver a iniciar sesión se recuperan los del hogar.
