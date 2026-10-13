# Stoky — Análisis, arquitectura y plan de implementación

> Estado: documento vivo. Última revisión: 2026-10-13.
> Describe decisiones reales tomadas en el código. Si el código y este documento discrepan, prevalece el código y debe corregirse el documento.

## 1. Análisis del entorno de trabajo

| Elemento | Situación detectada | Consecuencia |
|---|---|---|
| Repositorio | Vacío (sin commits) | Estructura creada desde cero |
| Node.js / npm | 22.x / 10.x | Compatible con Expo SDK 57 |
| Python | 3.13 | Suficiente para el esqueleto de FastAPI |
| Docker | Disponible | Se puede preparar `infra/docker` |
| Android SDK / emulador | **No disponible** | No se puede generar ni probar un APK en este entorno. La verificación se limita a: tipos, pruebas unitarias, empaquetado JS (`expo export`) y generación nativa (`expo prebuild`). La prueba en dispositivo queda pendiente (ver §8) |
| Red | Solo registro npm/PyPI. Bloqueados `docs.expo.dev`, `api.expo.dev` y `world.openfoodfacts.org` | Las APIs de Expo se han verificado contra los tipos `.d.ts` instalados. El cliente de Open Food Facts se prueba con respuestas simuladas; **no se ha probado contra el servicio real** |

Versiones elegidas: Expo SDK 57 (última estable), React Native 0.86, React 19.2, TypeScript 6 en modo estricto. Todas las dependencias nativas se han fijado a la versión que declara `expo/bundledNativeModules.json` para el SDK 57 (equivalente a `npx expo install`, que no pudo usarse por la restricción de red).

## 2. Análisis de requisitos

Prioridades (en orden): seguridad y privacidad → funcionamiento offline → integridad de datos → usabilidad → preparación para sincronización → funciones inteligentes.

Requisitos que condicionan la arquitectura:

1. **Offline-first y sin cuenta**: toda la lógica vive en el dispositivo; la única llamada de red de la v1 es la consulta opcional a Open Food Facts.
2. **Catálogo separado de existencias**: `products` (qué es) frente a `stock_lots` (cuánto hay, dónde y hasta cuándo).
3. **Integridad**: operaciones compuestas (pasar la compra al inventario, consumir de varios lotes) se ejecutan en una única transacción SQLite y son idempotentes.
4. **Sincronización futura**: las pantallas no acceden a SQL; usan repositorios con interfaces estables. IDs UUID generados en el cliente y marcas `created_at`/`updated_at` en todas las tablas.
5. **Privacidad**: sin telemetría, sin analítica, sin anuncios, copias de seguridad automáticas desactivadas, notificaciones genéricas en pantalla de bloqueo, consulta externa sujeta a aviso y consentimiento.

## 3. Arquitectura propuesta

```
┌───────────────────────── apps/android (Expo) ─────────────────────────┐
│ src/app/            Pantallas (Expo Router). Sin SQL ni fetch directo  │
│ src/ui/             Componentes, tema claro/oscuro, accesibilidad      │
│ src/i18n/           Textos (es; preparado para ca/en)                  │
│ src/state/          Contexto React que expone los servicios            │
│ src/services/       Casos de uso: inventario, compra, avisos, recetas  │
│ src/data/           Repositorios + migraciones + adaptador SQL         │
│ src/domain/         Lógica pura: unidades, cantidades, fechas,         │
│                     validación, motor de recetas (100 % testeable)     │
│ src/integrations/   Open Food Facts, notificaciones (bordes externos)  │
└────────────────────────────────────────────────────────────────────────┘
                 │ (fase 2, opcional, HTTPS)
                 ▼
┌──────────── services/api (FastAPI + PostgreSQL, Docker) ──────────────┐
│ /api/v1  auth · hogares · miembros · sync (push/pull incremental)     │
└────────────────────────────────────────────────────────────────────────┘
```

Decisiones principales:

- **Adaptador SQL (`SqlDatabase`)**: interfaz mínima (`run`, `all`, `get`, `exec`, `transaction`). En la app se implementa con `expo-sqlite`; en pruebas con `node:sqlite` (incluido en Node 22, sin dependencias extra). Así las migraciones y repositorios se prueban con SQLite real.
- **Migraciones versionadas** con `PRAGMA user_version`, aplicadas dentro de una transacción. Nunca se modifica una migración publicada; se añade otra.
- **Cantidades como enteros** (milésimas de la unidad, `quantity_milli`) para evitar errores de coma flotante. Unidades: `unit`, `g`, `kg`, `ml`, `l`. Conversión solo dentro de la misma dimensión (masa, volumen, recuento).
- **Fechas de caducidad como fecha local `YYYY-MM-DD`** (no instantes), con tipo `use_by` (caducidad) o `best_before` (consumo preferente) y marca `expiry_estimated`.
- **Borrado físico** en la v1 (mejor para la privacidad y la limitación de conservación). Al incorporar sincronización se añadirá, mediante migración, un registro de cambios (outbox) y lápidas (`deleted_at`) con purga programada.
- **Inyección de servicios** mediante un contexto React: las pantallas reciben `services.inventory`, `services.shopping`, etc. Sustituir la implementación local por una sincronizada no exige tocar las pantallas.

### Sincronización futura (diseño, no implementado)

- Cada tabla sincronizable añadirá `household_id`, `deleted_at` y `rev` (contador de servidor).
- Tabla local `pending_ops(id, entity, entity_id, op, payload, created_at, attempts)` escrita en la misma transacción que el cambio.
- `POST /api/v1/sync/push` (lote de operaciones con `op_id` idempotente) y `GET /api/v1/sync/pull?since=<rev>`.
- Conflictos: último escritor gana por campo con `updated_at` del servidor, salvo cantidades de lotes, que se sincronizan como **operaciones de delta** (consumo −X, alta +Y) para no perder consumos concurrentes.
- El servidor deriva el hogar del token, nunca de un parámetro del cliente; cada consulta filtra por `household_id`.
- Detalle en `services/api/README.md`.

## 4. Riesgos técnicos y legales

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| T1 | No hay Android SDK en el entorno: errores nativos no detectados | Alta | Medio | Prebuild + export JS en CI; checklist de prueba manual en dispositivo antes de publicar |
| T2 | Cambios incompatibles entre SDK de Expo | Media | Medio | Versiones fijadas al SDK; `expo-doctor` antes de actualizar |
| T3 | Corrupción o pérdida de datos locales (desinstalación, fallo) | Media | Alto | Transacciones, migraciones probadas; exportación/importación cifrada planificada (fase 2) |
| T4 | Notificaciones programadas desincronizadas con el inventario | Media | Bajo | Se reprograman todas tras cada cambio y al abrir la app |
| T5 | Datos incorrectos de Open Food Facts | Alta | Bajo | Se muestran como sugerencia editable; el usuario confirma |
| T6 | Vulnerabilidades en dependencias de herramientas de compilación (npm audit) | Alta | Bajo | Afectan a CLI/Metro, no al paquete de la app; revisión en cada versión |
| L1 | Fecha mal interpretada por el usuario como garantía de seguridad alimentaria | Media | Alto | Textos que no afirman seguridad; distinción caducidad/consumo preferente; fechas estimadas marcadas |
| L2 | Envío de datos a terceros (Open Food Facts; ML Kit de Google en el escáner) | Alta | Medio | Aviso y consentimiento antes de la primera consulta; solo se envía el código de barras; documentado en la política de privacidad |
| L3 | Publicación en Google Play sin formulario de seguridad de datos coherente | Media | Alto | `docs/legal/lista-de-verificacion-legal.md` |
| L4 | Futuro tratamiento de alergias (datos de salud, art. 9 RGPD) | Baja (v1) | Alto | No se recogen en la v1; requiere evaluación previa |
| L5 | Responsable del tratamiento indeterminado al publicar | Alta | Medio | Marcadores en documentos legales; revisión profesional obligatoria |
| S1 | Copias de seguridad de Android que expongan el inventario | Media | Medio | `android.allowBackup: false` |
| S2 | Contenido privado visible en pantalla de bloqueo | Media | Bajo | Canal con visibilidad privada; texto genérico por defecto |

## 5. Modelo de datos (SQLite, migración 1)

```
products            catálogo
  id TEXT PK (UUID)  name TEXT NOT NULL   brand TEXT   barcode TEXT UNIQUE
  category TEXT NOT NULL  default_unit TEXT NOT NULL  default_location TEXT NOT NULL
  low_stock_threshold_milli INTEGER  image_url TEXT  source TEXT ('manual'|'openfoodfacts')
  notes TEXT  created_at TEXT  updated_at TEXT

stock_lots          existencias (varias por producto)
  id TEXT PK  product_id TEXT FK→products ON DELETE CASCADE
  quantity_milli INTEGER CHECK(>=0)  unit TEXT  location TEXT
  added_on TEXT (YYYY-MM-DD)  expiry_date TEXT NULL  expiry_kind TEXT ('use_by'|'best_before')
  expiry_estimated INTEGER(0/1)  lot_code TEXT  notes TEXT  created_at  updated_at

shopping_lists       id  name  created_at  updated_at
shopping_items       id  list_id FK  product_id FK NULL (SET NULL)  name  name_key
                     quantity_milli  unit  checked  checked_at
                     transferred_at NULL  transferred_lot_id NULL  created_at  updated_at

settings             key TEXT PK  value TEXT (JSON)
```

Reglas de integridad:

- Un lote con cantidad 0 se elimina al consumirse (no se conservan existencias vacías).
- Un artículo de la compra solo pasa a `transferred_at != NULL` dentro de la transacción que crea el lote.
- Añadir a la lista un artículo ya pendiente (mismo producto o mismo nombre normalizado y unidad compatible) suma la cantidad en vez de duplicarlo.

## 6. Estructura de carpetas

```
Stocky/
├── apps/android/          Cliente Expo/React Native (TypeScript estricto)
│   ├── src/app/           Rutas de Expo Router
│   ├── src/{ui,i18n,state,services,data,domain,integrations}/
│   └── __tests__ junto al código (*.test.ts)
├── services/api/          Servidor futuro (FastAPI) — esqueleto y contrato
│   └── tests/
├── infra/docker/          Docker Compose futuro (API + PostgreSQL)
├── docs/                  Arquitectura, seguridad, pruebas
│   └── legal/             Documentos legales iniciales (pendientes de revisión)
├── scripts/               Revisión de secretos y licencias
├── README.md
└── .gitignore
```

Se mantiene `apps/android` como nombre por petición, aunque el código Expo es multiplataforma.

## 7. Dependencias y motivos

| Paquete | Motivo | Alternativa descartada |
|---|---|---|
| `expo`, `react`, `react-native` | Base del proyecto | — |
| `expo-router` (+ `react-native-screens`, `react-native-safe-area-context`, `expo-linking`, `expo-constants`) | Navegación por archivos recomendada por Expo; dependencias exigidas por el router | React Navigation directo (más configuración) |
| `expo-sqlite` | SQLite oficial de Expo, transacciones, soporte opcional de SQLCipher | `react-native-sqlite-storage` (menos mantenido) |
| `expo-camera` | Escáner de códigos integrado (`CameraView`); `expo-barcode-scanner` está retirado | `react-native-vision-camera` (más potente, más complejidad) |
| `expo-notifications` | Notificaciones locales programadas y canales Android | Notifee (dependencia extra) |
| `expo-crypto` | `randomUUID()` criptográficamente seguro para IDs | `uuid` + polyfill |
| `@expo/vector-icons` | Iconos de la barra inferior | SVG propios |
| `expo-splash-screen` | Pantalla de carga nativa con el logo, visible hasta que la base de datos está lista | Pantalla de carga en JS (parpadeo al arrancar) |
| `expo-haptics` | Vibración breve al leer un código en el escaneo rápido (confirma sin mirar la pantalla) | Sonido (requiere otra dependencia y molesta en tiendas) |
| `expo-linear-gradient` | Degradados de la marca (cabeceras, botón de escanear) | Imágenes de fondo |
| `expo-status-bar` | Barra de estado según tema | — |
| `jest`, `jest-expo`, `@types/jest` (dev) | Pruebas unitarias con el preset oficial | Vitest (sin soporte RN oficial) |

**No** se usan: SDK de analítica, publicidad, crash reporting remoto, NetInfo (la falta de conexión se detecta por el error de la petición), librerías de estado globales, AsyncStorage (los ajustes van a SQLite).

### Cifrado local: evaluación

- SQLite **no cifra** los datos. La base de datos se guarda en el almacenamiento privado de la app, protegido por el sandbox de Android y por el cifrado de almacenamiento del sistema (FBE, obligatorio desde Android 10 en dispositivos certificados), que protege con el dispositivo bloqueado pero no frente a un dispositivo desbloqueado y comprometido (root).
- `expo-sqlite` admite SQLCipher (`useSQLCipher` en su plugin). Usarlo exigiría generar una clave aleatoria y guardarla con `expo-secure-store` (Android Keystore). Limitaciones: si se pierde la clave (borrado de datos del Keystore, restauración en otro dispositivo) los datos son irrecuperables; aumenta el tamaño del APK; la clave está disponible para la app en ejecución, por lo que no protege frente a malware con privilegios de la propia app.
- **Decisión v1**: no cifrar la base de datos. El inventario doméstico es de sensibilidad baja-media, no hay credenciales ni datos de salud, y las copias automáticas están desactivadas. **Revisar** esta decisión antes de: (a) almacenar tokens de sincronización (irán en `expo-secure-store`, nunca en SQLite), (b) recoger alergias o datos de salud, (c) habilitar exportaciones.

## 8. Plan de implementación por etapas

| Etapa | Contenido | Verificación | Estado (2026-10-13) |
|---|---|---|---|
| 0 | Análisis, arquitectura, estructura, `.gitignore` | Revisión documental | Hecho |
| 1 | Dominio puro: unidades, cantidades, fechas, validación, códigos de barras | Jest (también con TZ Europe/Madrid y Pacific/Auckland) | Hecho |
| 2 | Datos: adaptador, migraciones, repositorios, servicios de inventario, compra y ajustes | Jest + SQLite real (`node:sqlite`) | Hecho |
| 3 | Integraciones: Open Food Facts, planificador de avisos, i18n | Jest con `fetch` simulado | Hecho; **sin probar contra el servicio real** (red bloqueada) |
| 4 | Motor de recetas local + base de recetas | Jest | Hecho |
| 5 | Interfaz: pestañas, inventario, compra, caducidades, escáner, recetas, ajustes | `tsc`, pruebas de accesibilidad y textos, `expo export`, `expo prebuild` | Hecho; **sin probar en dispositivo** |
| 6 | Documentación legal y de pruebas, scripts de secretos y licencias | Revisión; scripts ejecutados | Borradores pendientes de revisión profesional |
| 7 | Esqueleto del servidor (FastAPI), Docker Compose, contrato de sincronización, CI | `pytest`, `docker compose config` | Hecho; imagen Docker no construida |
| 8 | Prueba en dispositivo Android real | Checklist manual en `docs/pruebas.md §4` | **Pendiente** (requiere SDK/dispositivo) |

### Etapa 9 (2026-10-13): rediseño visual y escaneo rápido

- Logo propio (tarro con niveles de existencias y hoja) generado desde `apps/android/assets/brand/` (`node assets/brand/render.mjs <ruta-a-chrome>`). Vista previa: `docs/logo-preview.png`.
- Pantalla de carga nativa con el logo (`expo-splash-screen`) que se oculta con fundido al terminar de abrir la base de datos.
- Tema renovado: tarjetas con sombra, degradados de marca, animación al pulsar, avatares por categoría, avisos emergentes.
- Barra inferior con botón central de escanear.
- **Escaneo rápido**: la cámara queda abierta; cada código se añade al instante a una bandeja; los datos se buscan en segundo plano (hasta 3 a la vez) sin bloquear el siguiente escaneo; repetir un código suma un envase; atajos de fecha («≈ 1 mes», marcadas como aproximadas); se guarda todo en una única transacción, al inventario o a la lista.
- Migración 2: tamaño del envase en el catálogo (`pack_quantity_milli`) para convertir envases en cantidades (6 × 1 l = 6 l).
- Lista de la compra con entrada rápida («2 leche», «arroz 1 kg»), sugerencias de lo que se acaba, −/+ por artículo y botón fijo para pasar al inventario.
- Inventario con buscador, filtros por ubicación y «por caducar», y botón «−1» para gastar un envase.

### Siguientes etapas propuestas

1. Prueba en dispositivo (etapa 8) y corrección de lo que aparezca.
2. Pantalla de avisos de licencias en la app (requisito Apache-2.0 de Material Symbols) y enlace a la política de privacidad.
3. Exportación/importación de datos (portabilidad y copia manual), protegida.
4. Traducciones al catalán y al inglés (`src/i18n/ca.ts`, `en.ts`) y selección por idioma del sistema.
5. Iconos y marca propios.
6. Servidor de sincronización según `services/api/README.md`.
