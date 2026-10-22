# Pruebas de Stocky

## 1. Pruebas automatizadas (app)

Ejecutar desde `apps/android`:

```bash
npm test              # Jest (preset jest-expo)
npm run typecheck     # TypeScript estricto
```

Requisitos: Node.js ≥ 22.13 (las pruebas de base de datos usan el módulo `node:sqlite` incluido en Node, con SQLite real; Node muestra un aviso «ExperimentalWarning» que es esperado).

| Fichero | Qué cubre |
|---|---|
| `src/domain/domain.test.ts` | Unidades y conversiones, cantidades en milésimas, fechas (cambio de hora, años bisiestos), estados de caducidad, códigos GTIN/UPC-E, normalización de texto, validación de entradas |
| `src/domain/recipes.test.ts` | Coincidencia de ingredientes, faltantes, cantidades aproximadas, prioridad de productos que vencen, preferencias, coherencia de la base de recetas |
| `src/data/data.test.ts` | Migraciones (desde cero, de la 1 a la 2 con datos, idempotencia, migración pendiente con datos, reversión de una migración fallida, base de datos más nueva), claves foráneas y `CHECK`, transacciones serializadas |
| `src/services/services.test.ts` | Inventario (lotes con fechas, FEFO, unidades, consumos repetidos y concurrentes), lista de la compra (duplicados, paso al inventario atómico e idempotente), ajustes, borrado total |
| `src/services/scanService.test.ts` | Flujo del escáner: catálogo local primero, consentimiento, códigos internos, UPC-E, **modo sin conexión** |
| `src/integrations/integrations.test.ts` | Cliente de Open Food Facts con `fetch` simulado (minimización, 404, errores, tiempo máximo), planificación y texto de avisos |
| `src/services/scanSession.test.ts` | Sesión de escaneo rápido (repetir código suma, datos resueltos sin pisar nombres escritos, envases → cantidad) y guardado por lotes al inventario y a la lista (todo o nada) |
| `src/domain/quickAdd.test.ts` | Entrada rápida de la lista («2 leche», «arroz 1,5kg»…) |
| `src/ui/ui.test.tsx` | Accesibilidad de componentes (roles, estados, etiquetas) y existencia de todas las claves de texto |

Las pruebas **no** cubren: cámara real, notificaciones reales del sistema, rendimiento, ni el servicio real de Open Food Facts (bloqueado en el entorno de desarrollo donde se generó el proyecto).

Verificación adicional realizada en el entorno de desarrollo (sin Android SDK):

- `npx expo export --platform android`: el código se empaqueta correctamente para Hermes.
- `npx expo prebuild --platform android`: el AndroidManifest generado contiene `allowBackup="false"`, `CAMERA`, `POST_NOTIFICATIONS`, `INTERNET` y elimina los permisos bloqueados.
- APK compilado en GitHub Actions (primera compilación, commit `5863aa2`): `minSdk 24`, `targetSdk 36`, ABIs arm64-v8a/armeabi-v7a/x86_64. El manifiesto fusionado añadía permisos de bibliotecas: `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE` (reprogramar avisos tras reiniciar), `ACCESS_NETWORK_STATE`, y además `c2dm.permission.RECEIVE` (push de Firebase), `BIND_GET_INSTALL_REFERRER_SERVICE` (origen de instalación de Google Play) y ~20 permisos de contador de avisos en el icono de distintos fabricantes. Estos últimos no se usan y se han bloqueado en `app.json`; verificar `permisos.txt` del siguiente artefacto.

## 2. Comprobaciones antes de publicar

```bash
bash scripts/check-secrets.sh
node scripts/check-licenses.mjs
(cd apps/android && npm audit --omit=dev)
```

Y la lista completa de `docs/legal/lista-de-verificacion-legal.md`.

## 3. APK de pruebas

El flujo `.github/workflows/android-apk.yml` compila un APK de pruebas en GitHub Actions solo cuando se lanza a mano; las versiones publicadas se hacen con una release (ver [publicar-version.md](publicar-version.md)) (*Actions → APK Android (pruebas) → Run workflow*), para compilar únicamente la última versión. La CI (tests y tipos) sí se ejecuta en cada cambio. El artefacto `stocky-apk-<commit>` contiene:

- `app-release.apk`: APK para arm64-v8a, armeabi-v7a y x86_64 (móviles y emuladores).
- `app-release.apk.sha256`: suma de comprobación.
- `permisos.txt` y `badging.txt`: permisos del manifiesto **fusionado** y versiones de SDK.

**Solo para pruebas**: está firmado con la clave de depuración de la plantilla. No sirve para Google Play y, si más adelante se instala una versión firmada con otra clave, habrá que desinstalar esta primero (se perderán sus datos).

Instalación:

1. Descarga el artefacto (requiere sesión en GitHub) y descomprime el ZIP.
2. Copia `app-release.apk` al móvil y ábrelo; Android pedirá permitir «instalar aplicaciones desconocidas» para la app con la que lo abras.
   - O con cable: `adb install app-release.apk`.
3. Si Google Play Protect avisa de una app desconocida, es por la firma de depuración; comprueba antes la suma SHA-256.

## 4. Prueba manual en dispositivo (pendiente: no realizada aún)

Usar un dispositivo o emulador Android 10+ con una development build (`npx expo run:android`).

| # | Caso | Resultado esperado |
|---|---|---|
| M1 | Primera apertura | Inicio vacío, sin solicitudes de permisos |
| M2 | Escanear sin permiso de cámara | Explicación previa; tras denegar dos veces, botón a Ajustes de Android; la entrada manual sigue disponible |
| M3 | Escanear un EAN conocido (p. ej. de un producto de casa) por primera vez | Diálogo de consentimiento de Open Food Facts antes de cualquier conexión |
| M4 | Rechazar el consentimiento | Formulario manual con el código prellenado; ninguna petición de red (comprobar con un proxy) |
| M5 | Aceptar y escanear con conexión | Formulario prellenado y aviso de «datos sugeridos» |
| M6 | **Modo avión** y escanear producto nuevo | Mensaje «Sin conexión» y botón «Añadir a mano» con el código |
| M7 | Escanear un producto ya guardado (también en modo avión) | Va directamente a «Añadir existencias» sin red |
| M8 | Escanear el mismo código varias veces seguidas | Solo se procesa una vez |
| M9 | Añadir dos lotes con fechas distintas y consumir más de lo que tiene el primero | Se consume en orden de fecha y se elimina el lote agotado |
| M10 | Lista: añadir «Tomates 1 kg» y «tomates 500 g» | Un único artículo de 1,5 kg |
| M11 | Marcar artículos y «Pasar al inventario»; repetir | Se incorporan una sola vez |
| M12 | Activar avisos | Diálogo del sistema (Android 13+); avisos sin nombres; contenido oculto en la pantalla de bloqueo segura |
| M13 | Pulsar un aviso | Abre «Caducidades» |
| M14 | Tema oscuro del sistema | Contraste legible en todas las pantallas |
| M15 | TalkBack | Todos los botones, chips e interruptores se anuncian con nombre y estado |
| M16 | Tamaño de fuente máximo y pantalla pequeña | Sin texto cortado que impida usar la app |
| M17 | Eliminar todos los datos | Todo vacío; avisos cancelados |
| M18 | Actualizar desde la versión anterior | Los datos se conservan (migraciones) |
| S1 | Servidor en modo IP: Ajustes → Servidor → `IP:puerto` | Aviso de conexión sin cifrar; con una IP pública o un dominio con `http://` la app lo rechaza |
| S2 | Crear cuenta con el código de registro y crear hogar | «Conectado»; los datos del móvil aparecen en el servidor (Cambios por enviar = 0) |
| S3 | Invitar y unir un segundo móvil | Las listas por defecto se fusionan en una; los productos con el mismo código de barras quedan como uno solo |
| S4 | Consumir a la vez el mismo producto en los dos móviles | Al sincronizar se restan los dos consumos |
| S5 | Modo avión, hacer cambios y volver a conectar | Los cambios se envían solos al volver (o con «Sincronizar ahora») |
| S6 | Apagar el servidor | La app sigue funcionando; el error se muestra en Ajustes → Servidor |
| S7 | Desconectar este móvil | Los datos se quedan en el móvil; los del hogar siguen en el servidor |
| S8 | Eliminar todos los datos estando conectado | Se desconecta primero; el hogar del servidor no se borra |
| A1 | Instalación nueva | Pantalla de bienvenida: «Iniciar sesión», «Crear una cuenta», «Continuar como invitado»; como invitado no se vuelve a mostrar |
| A2 | Mi cuenta → Activar verificación en dos pasos | «Abrir en la app autenticadora» abre Google Authenticator/Aegis; tras el código se muestran 10 códigos de recuperación |
| A3 | Iniciar sesión en otro móvil con la verificación activada | Pide el código; un código incorrecto o ya usado se rechaza; un código de recuperación funciona una vez |
| A4 | Mi cuenta → Sesiones abiertas → cerrar otro móvil | Ese móvil deja de sincronizar y pide volver a entrar |
| A5 | Ajustes → Seguridad → Desbloquear con huella | Pide la huella para activarlo; al reabrir la app o volver tras más de un minuto pide la huella (o el PIN del móvil) |
| A6 | Huella activada y se quita el bloqueo de pantalla del móvil | La app no deja al usuario fuera |
| U1 | Publicar una release `vX.Y.Z` (repositorio público) y abrir una versión anterior | Aviso «Nueva versión X disponible» en Inicio; «Descargar» abre el APK; tras instalarlo encima los datos siguen ahí |
| U2 | Cerrar el aviso con la X | No vuelve a salir hasta la siguiente versión; sigue en Ajustes → Acerca de |
| U3 | Desactivar «Avisar de nuevas versiones» | No se hace ninguna petición a GitHub |

## 5. Cómo informar y reproducir errores (sin datos personales)

Incluir:

1. Versión de Stocky (Ajustes → Acerca de), modelo de dispositivo y versión de Android.
2. Pasos exactos para reproducirlo **con datos inventados** (p. ej. «producto Prueba, 2 ud., caduca 15/10/2026»).
3. Resultado esperado y obtenido; captura de pantalla sin información personal.
4. Si hubo conexión, modo avión o permisos denegados.

No adjuntar nunca la base de datos real ni capturas de listas personales. Si un error solo se reproduce con datos reales, crear una prueba automatizada que lo reproduzca con datos ficticios (patrón de `src/test-utils/fixtures.ts`).
