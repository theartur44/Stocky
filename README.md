# Stocky

Aplicación Android para gestionar el inventario de alimentos de casa: fechas de caducidad, listas de la compra y sugerencias de recetas con lo que tienes. **Funciona sin conexión, sin cuenta y sin rastreadores.**

> Estado: **v0.1.0 en desarrollo.** Probada con pruebas automatizadas y empaquetado; **pendiente de prueba en dispositivo real** (ver [docs/pruebas.md](docs/pruebas.md)). Documentación legal en borrador, pendiente de revisión profesional.

## Funciones (v0.1.0)

- Inventario con catálogo de productos y **lotes** independientes (cantidad, unidad, ubicación, fecha de caducidad o de consumo preferente, fecha estimada, lote del fabricante, notas).
- Consumo por lote o por producto en orden de caducidad (FEFO), con conversión de unidades (g/kg, ml/l).
- **Escaneo rápido** de códigos de barras (EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, Code 128): la cámara queda abierta, cada producto se añade al momento y sus datos se buscan en segundo plano; se guarda todo de una vez en casa o en la lista.
- Consulta opcional a Open Food Facts, **solo con consentimiento** y solo si el producto no está ya en el dispositivo.
- Listas de la compra con entrada rápida («2 leche»), sugerencias de lo que se acaba, unión de duplicados y paso al inventario atómico e idempotente.
- Avisos locales de caducidad agrupados por día, sin nombres de productos por defecto.
- Sugerencias de recetas calculadas en el dispositivo, priorizando lo que vence antes.
- Estilo «cristal», seis colores a elegir y modo claro/oscuro/automático; componentes accesibles; textos en español (preparado para catalán e inglés).
- Bienvenida al instalar: **invitado** (todo en el móvil) o **iniciar sesión** en tu servidor.
- **Aviso de nuevas versiones**: al publicar una release en GitHub se compila el APK y la app avisa para descargarlo ([docs/publicar-version.md](docs/publicar-version.md)).
- **Hogar compartido opcional** con tu propio servidor (IP de casa o dominio): cuentas con **verificación en dos pasos**, invitaciones y sincronización automática entre móviles, también sin conexión. Desbloqueo con **huella** opcional. Instalación del servidor con Docker en un paso: [docs/servidor-docker.md](docs/servidor-docker.md).
- Borrado completo de datos desde Ajustes.

## Estructura

```
apps/android/        App Expo (React Native + TypeScript estricto)
  src/app/           Pantallas (Expo Router)
  src/domain/        Lógica pura: unidades, fechas, caducidades, recetas, validación
  src/data/          SQLite: adaptador, migraciones, repositorios, recetas locales
  src/services/      Casos de uso (inventario, compra, ajustes, escáner, recetas, privacidad)
  src/integrations/  Open Food Facts, notificaciones y almacén seguro de la sesión
  src/sync/          Sincronización con el servidor (cliente HTTP y motor push/pull)
  src/state/ src/ui/ src/i18n/
services/api/        Servidor de sincronización (FastAPI + PostgreSQL cifrado)
infra/docker/        Docker Compose del servidor e instalador stocky.sh
docs/                Arquitectura, pruebas y documentación legal (docs/legal)
scripts/             Revisión de secretos y licencias
```

Detalles de diseño, riesgos y plan por etapas: [docs/arquitectura.md](docs/arquitectura.md).

## Requisitos

- Node.js **22.13 o superior** (las pruebas usan `node:sqlite`) y npm.
- Para ejecutar en Android: Android Studio con SDK y un emulador, o un dispositivo con depuración USB. Java 17.
- La app usa módulos nativos (cámara, SQLite, notificaciones): **no funciona en Expo Go**; necesita una *development build*.

## Instalación y desarrollo

```bash
cd apps/android
npm ci                      # instala exactamente las versiones del package-lock
npm run android             # = expo run:android: compila e instala la development build
npm run start:dev-client    # arranca Metro para una development build ya instalada
```

Para añadir dependencias usa `npx expo install <paquete>` (elige la versión compatible con el SDK 57).

## Pruebas y comprobaciones

```bash
cd apps/android
npm test                    # pruebas unitarias e integración con SQLite real
npm run typecheck           # TypeScript estricto
npm run export:android      # comprueba que el código se empaqueta para Android
```

Desde la raíz, antes de publicar:

```bash
bash scripts/check-secrets.sh
node scripts/check-licenses.mjs
```

Más información en [docs/pruebas.md](docs/pruebas.md).

## Compilación para Android

Development build local:

```bash
cd apps/android
npx expo prebuild --platform android   # genera android/ (ignorado por git)
npx expo run:android --variant release # APK de release local (requiere configurar firma)
```

Con EAS Build (en la nube de Expo; implica subir el código a sus servidores):

```bash
npx eas-cli@latest build --platform android --profile preview
```

La carpeta `android/` se genera a partir de `app.json` y los plugins (Continuous Native Generation): no la edites a mano. **Nunca** subas al repositorio el almacén de claves de firma ni sus contraseñas.

El identificador de paquete `com.stoky.app` (escrito con el nombre anterior) es provisional: cambiarlo hace que Android trate la app como otra distinta (la versión instalada no se actualiza y sus datos no se trasladan). Debe fijarse el definitivo antes de publicar en Google Play, porque después no puede cambiarse.

## Privacidad

- Datos solo en el dispositivo; copias de seguridad automáticas de Android desactivadas.
- Sin analítica, publicidad ni registros con datos personales.
- Única comunicación externa de la app: el código de barras a Open Food Facts, con consentimiento.
- Ver [docs/legal/](docs/legal/README.md).

## Licencia

Stocky es **software libre de código abierto** bajo la [licencia MIT](LICENSE): se puede usar, copiar, modificar y redistribuir libremente, conservando el aviso de copyright y de licencia. Los componentes de terceros conservan sus propias licencias (ver [docs/legal/licencias-de-terceros.md](docs/legal/licencias-de-terceros.md)). Datos de productos: Open Food Facts, licencia ODbL.
