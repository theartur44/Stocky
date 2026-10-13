# Licencias de terceros

> **PENDIENTE DE REVISIÓN.** Generado a partir de `package.json`/`package-lock.json` el 2026-10-13. Regenerar el resumen con `node scripts/check-licenses.mjs --markdown` en cada versión.

## 1. Licencia del propio proyecto

**[PENDIENTE DE DECIDIR por el titular]** (por ejemplo, MIT, Apache-2.0 o propietaria). Hasta que se decida, el código no se ofrece bajo ninguna licencia abierta. Se ha eliminado el fichero `LICENSE` de la plantilla de Expo porque pertenecía a la plantilla, no a Stoky.

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
| SQLite | expo-sqlite | Dominio público |

## 5. Datos e imágenes

| Fuente | Uso en Stoky | Licencia | Obligaciones |
|---|---|---|---|
| Open Food Facts — base de datos | Nombre, marca, categoría y unidad sugeridos al escanear | Open Database License (ODbL) 1.0 | Atribución («Datos de Open Food Facts, ODbL»), compartir igual si se redistribuye la base de datos o una base derivada. Stoky guarda solo los productos que el usuario añade, en su dispositivo. [REVISAR si el uso constituye «base de datos derivada»] |
| Open Food Facts — contenidos individuales | Ídem | Database Contents License (DbCL) 1.0 [VERIFICAR] | — |
| Open Food Facts — imágenes de producto | Miniatura mostrada al dar de alta un producto | Creative Commons Attribution-ShareAlike [VERIFICAR versión] | Atribución. Las imágenes pueden contener marcas registradas de terceros |
| Recetas incluidas | Base local de recetas | Redactadas para Stoky (licencia del proyecto) | — |
| Iconos de la app | Plantilla de Expo | [VERIFICAR / sustituir por iconos propios antes de publicar] | — |

La app muestra la atribución «Datos de productos: Open Food Facts (licencia ODbL)» en Ajustes → Acerca de.

## 6. Servidor futuro (Python)

Al implementarlo, documentar FastAPI (MIT), Uvicorn (BSD-3-Clause), SQLAlchemy (MIT), psycopg (LGPL-3.0 — revisar implicaciones), PostgreSQL (licencia PostgreSQL) y las imágenes Docker base.
