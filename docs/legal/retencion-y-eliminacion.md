# Retención y eliminación de datos

> **BORRADOR PENDIENTE DE REVISIÓN.** Describe el comportamiento real de la v0.1.0.

**Última actualización:** [FECHA DE ACTUALIZACIÓN]

## 1. Principio

Los datos se conservan solo mientras el usuario los necesita (art. 5.1.e RGPD, limitación del plazo de conservación). En la v1 todos los datos están en el dispositivo y el usuario controla su eliminación.

## 2. Plazos por tipo de dato

| Dato | Ubicación | Plazo | Cómo se elimina |
|---|---|---|---|
| Productos del catálogo | SQLite local | Hasta que el usuario lo borre | Producto → Eliminar producto (borra también sus lotes) |
| Lotes de existencias | SQLite local | Hasta que se consumen por completo o el usuario los borra | Al consumir toda la cantidad el lote se elimina automáticamente; Producto → lote → Eliminar |
| Artículos de la compra | SQLite local | Hasta que el usuario los quita | Quitar artículo; «Quitar los ya incorporados»; eliminar lista |
| Ajustes y decisión de consentimiento | SQLite local | Mientras se use la app | Eliminar todos mis datos |
| Avisos programados | Sistema de Android | Hasta su fecha o hasta la siguiente reprogramación | Se reprograman tras cada cambio; se cancelan al desactivar avisos o borrar todo |
| Imágenes de la cámara | Memoria temporal | No se conservan | — |
| Imagen de producto (URL de Open Food Facts) | SQLite local (solo la dirección) | Como el producto | Con el producto |
| Caché HTTP del sistema de la imagen descargada | Caché de la app | Gestionado por Android | Borrar caché de la app en Ajustes de Android; desinstalación |
| Registros de errores | Solo consola en modo desarrollo | No se guardan en producción | — |
| Datos en Open Food Facts / Google | Servidores del tercero | Según sus políticas | Ejercicio de derechos ante el tercero |

## 3. Procedimiento de borrado total

**Ajustes → Eliminar todos mis datos** (con confirmación):

1. Cancela todas las notificaciones programadas y descarta las mostradas.
2. Elimina en una transacción todas las filas de `shopping_items`, `shopping_lists`, `stock_lots`, `products` y `settings`.
3. Ejecuta `VACUUM` para reconstruir el fichero sin páginas antiguas y `PRAGMA wal_checkpoint(TRUNCATE)` para vaciar el diario WAL.
4. Con `PRAGMA secure_delete = ON`, el contenido borrado se sobrescribe con ceros.
5. Crea una lista de la compra vacía para que la app siga funcionando.

Limitaciones: el borrado lógico en almacenamiento flash no garantiza la eliminación física de copias anteriores gestionadas por el controlador del dispositivo; la protección efectiva depende del cifrado del sistema de Android. Para eliminar todo rastro, el usuario puede además **desinstalar la app** o usar Ajustes de Android → Aplicaciones → Stocky → Borrar almacenamiento.

Prueba automatizada: `services.test.ts` → «elimina todos los datos locales».

## 4. Copias de seguridad

- Copias automáticas de Android (Google Drive / transferencia entre dispositivos): **desactivadas** (`android:allowBackup="false"`).
- Exportación manual: no disponible en la v1. Si se implementa, el fichero exportado deberá protegerse (p. ej. cifrado con contraseña elegida por el usuario mediante una biblioteca mantenida) e informar de que contiene datos del hogar.

## 5. Servidor futuro (pendiente de definir antes de implementarlo)

| Dato | Plazo propuesto |
|---|---|
| Cuenta y datos del hogar | Mientras la cuenta esté activa; borrado en ≤ 30 días tras la solicitud |
| Lápidas de sincronización (registros de borrado) | 90 días, después purga |
| Registros de seguridad (inicios de sesión, errores de autorización) | 6-12 meses, sin contenido del inventario |
| Copias de seguridad del servidor | Rotación ≤ 35 días; los borrados se propagan al expirar las copias |
| Sesiones / tokens de refresco | Caducidad definida; revocación inmediata al cerrar sesión o eliminar dispositivo |
