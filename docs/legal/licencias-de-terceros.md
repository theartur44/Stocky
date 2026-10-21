# Licencias de terceros

> **PENDIENTE DE REVISIÓN.** Generado a partir de `package.json`/`package-lock.json` el 2026-10-13. Regenerar el resumen con `node scripts/check-licenses.mjs --markdown` en cada versión.

## 1. Licencia del propio proyecto

**Código abierto, licencia MIT** (fichero [`LICENSE`](../../LICENSE) en la raíz del repositorio). Cubre la app, el servidor y la documentación propia. El aviso de copyright figura como «Stocky contributors» [COMPLETAR con el nombre del titular si se desea que conste]. La app lo indica en Ajustes → Acerca de.

## 2. Dependencias directas de la app (producción)

| Paquete | Versión | Licencia |
|---|---|---|
| expo | 57.0.28 | MIT |
| expo-router | 57.0.26 | MIT |
| expo-sqlite | 57.0.4 | MIT |
| expo-camera | 57.0.6 | MIT |
| expo-notifications | 57.0.22 | MIT |
| expo-crypto | 57.0.4 | MIT |
| expo-constants | 57.0.21 | MIT |
| expo-linking | 57.0.12 | MIT |
| expo-status-bar | 57.0.1 | MIT |
| expo-system-ui | 57.0.4 | MIT |
| expo-asset | 57.0.19 | MIT |
| expo-splash-screen | 57.0.x | MIT |
| expo-haptics | 57.0.x | MIT |
| expo-linear-gradient | 57.0.x | MIT |
| expo-blur | 57.0.3 | MIT |
| expo-font | 57.0.4 | MIT |
| @expo/vector-icons (incluye Ionicons) | 15.1.1 | MIT |
| react / react-dom | 19.2.3 | MIT |
| react-native | 0.86.3 | MIT |
| react-native-safe-area-context | 5.7.0 | MIT |
| react-native-screens | 4.26.2 | MIT |

## 3. Resumen de todas las dependencias de producción (npm)

| Licencia | Nº de paquetes |
|---|---|
| MIT | 494 |
| ISC | 29 |
| MPL-2.0 | 12 |
| Apache-2.0 | 9 |
| BSD-3-Clause | 6 |
| BlueOak-1.0.0 | 6 |
| BSD-2-Clause | 3 |
| (MIT OR CC0-1.0) | 3 |
| Unlicense | 2 |
| 0BSD | 2 |
| MIT AND Apache-2.0 | 1 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| (MIT OR Apache-2.0) | 1 |
| (BSD-3-Clause OR GPL-2.0) | 1 |

Total: 571 paquetes (incluye herramientas de compilación de Expo/Metro que no se empaquetan en el APK).

Excepciones revisadas:

- **lightningcss** (MPL-2.0): herramienta de compilación de Metro; no forma parte del APK.
- **node-forge** (BSD-3-Clause o GPL-2.0, a elección): se usa bajo BSD-3-Clause; herramienta de la CLI de Expo; no forma parte del APK.
- **@expo-google-fonts/material-symbols** (MIT y Apache-2.0): la fuente Material Symbols se incluye en el paquete por `expo-router`. Apache-2.0 exige conservar el aviso de licencia: **incluir una pantalla o fichero de avisos de licencias en la app antes de publicar** [PENDIENTE].

## 4. Bibliotecas nativas Android (Gradle) relevantes

No figuran en npm; se añaden al compilar. [VERIFICAR la lista completa con `./gradlew app:dependencies` en un entorno con Android SDK.]

| Biblioteca | Incluida por | Licencia / condiciones |
|---|---|---|
| com.google.mlkit:barcode-scanning 17.3.0 | expo-camera | Condiciones de ML Kit de Google [VERIFICAR] |
| com.google.android.gms:play-services-code-scanner 16.1.0 | expo-camera | Condiciones de Google Play services [VERIFICAR] |
| androidx.camera (CameraX) | expo-camera | Apache-2.0 |
| com.google.firebase:firebase-messaging 25.0.1 | expo-notifications | Apache-2.0 (SDK) y condiciones de Firebase si se usa el servicio [la app no usa el servicio] |
| com.github.Dimezis:BlurView 3.1.0 (desenfoque de la barra de pestañas) | expo-blur | Apache-2.0 |
| SQLite | expo-sqlite | Dominio público |

## 5. Datos e imágenes

| Fuente | Uso en Stocky | Licencia | Obligaciones |
|---|---|---|---|
| Open Food Facts — base de datos | Nombre, marca, categoría y unidad sugeridos al escanear | Open Database License (ODbL) 1.0 | Atribución («Datos de Open Food Facts, ODbL»), compartir igual si se redistribuye la base de datos o una base derivada. Stocky guarda solo los productos que el usuario añade, en su dispositivo. [REVISAR si el uso constituye «base de datos derivada»] |
| Open Food Facts — contenidos individuales | Ídem | Database Contents License (DbCL) 1.0 [VERIFICAR] | — |
| Open Food Facts — imágenes de producto | Miniatura mostrada al dar de alta un producto | Creative Commons Attribution-ShareAlike [VERIFICAR versión] | Atribución. Las imágenes pueden contener marcas registradas de terceros |
| Recetas incluidas | Base local de recetas | Redactadas para Stocky (licencia del proyecto) | — |
| Imagen de brillo del fondo (`apps/android/assets/glow.png`) | Fondo de cristal de las pantallas | Generada por `assets/brand/glow.mjs` (licencia del proyecto) | — |
| Logo e iconos de la app | Diseño aportado por el titular, redibujado en vectorial (`apps/android/assets/brand/`) | Licencia del proyecto [CONFIRMAR la autoría y los derechos del diseño original, especialmente si se generó con una herramienta de IA o un tercero] | — |
| Tipografía Nunito Black (texto del logo) | `apps/android/assets/brand/fonts/` | SIL Open Font License 1.1 (`OFL.txt`) | Conservar el fichero de licencia; solo se usa para generar las imágenes del logo |

La app muestra la atribución «Datos de productos: Open Food Facts (licencia ODbL)» en Ajustes → Acerca de.

## 6. Servidor futuro (Python)

Al implementarlo, documentar FastAPI (MIT), Uvicorn (BSD-3-Clause), SQLAlchemy (MIT), psycopg (LGPL-3.0 — revisar implicaciones), PostgreSQL (licencia PostgreSQL) y las imágenes Docker base.
