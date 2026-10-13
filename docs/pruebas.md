# Pruebas de Stoky

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
| `src/data/data.test.ts` | Migraciones (desde cero, idempotencia, migración pendiente con datos, reversión de una migración fallida, base de datos más nueva), claves foráneas y `CHECK`, transacciones serializadas |
| `src/services/services.test.ts` | Inventario (lotes con fechas, FEFO, unidades, consumos repetidos y concurrentes), lista de la compra (duplicados, paso al inventario atómico e idempotente), ajustes, borrado total |
| `src/services/scanService.test.ts` | Flujo del escáner: catálogo local primero, consentimiento, códigos internos, UPC-E, **modo sin conexión** |
| `src/integrations/integrations.test.ts` | Cliente de Open Food Facts con `fetch` simulado (minimización, 404, errores, tiempo máximo), planificación y texto de avisos |
| `src/ui/ui.test.tsx` | Accesibilidad de componentes (roles, estados, etiquetas) y existencia de todas las claves de texto |

Las pruebas **no** cubren: cámara real, notificaciones reales del sistema, rendimiento, ni el servicio real de Open Food Facts (bloqueado en el entorno de desarrollo donde se generó el proyecto).

Verificación adicional realizada en el entorno de desarrollo (sin Android SDK):

- `npx expo export --platform android`: el código se empaqueta correctamente para Hermes.
- `npx expo prebuild --platform android`: el AndroidManifest generado contiene `allowBackup="false"`, `CAMERA`, `POST_NOTIFICATIONS`, `INTERNET` y elimina los permisos bloqueados. El manifiesto **fusionado** (con las bibliotecas) no se ha podido comprobar sin Android SDK.

## 2. Comprobaciones antes de publicar

```bash
bash scripts/check-secrets.sh
node scripts/check-licenses.mjs
(cd apps/android && npm audit --omit=dev)
```

Y la lista completa de `docs/legal/lista-de-verificacion-legal.md`.

## 3. Prueba manual en dispositivo (pendiente: no realizada aún)

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

## 4. Cómo informar y reproducir errores (sin datos personales)

Incluir:

1. Versión de Stoky (Ajustes → Acerca de), modelo de dispositivo y versión de Android.
2. Pasos exactos para reproducirlo **con datos inventados** (p. ej. «producto Prueba, 2 ud., caduca 15/10/2026»).
3. Resultado esperado y obtenido; captura de pantalla sin información personal.
4. Si hubo conexión, modo avión o permisos denegados.

No adjuntar nunca la base de datos real ni capturas de listas personales. Si un error solo se reproduce con datos reales, crear una prueba automatizada que lo reproduzca con datos ficticios (patrón de `src/test-utils/fixtures.ts`).
