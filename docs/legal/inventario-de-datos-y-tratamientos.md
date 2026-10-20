# Inventario de datos y registro de tratamientos

> **BORRADOR PENDIENTE DE REVISIÓN.** Sirve de base para el registro de actividades de tratamiento (art. 30 RGPD) cuando corresponda.

**Última actualización:** [FECHA DE ACTUALIZACIÓN]
**Responsable:** [NOMBRE DEL RESPONSABLE] — [CORREO DE CONTACTO]

## 1. Inventario técnico de datos (v0.1.0)

| Tabla / elemento | Campos | ¿Datos personales? | Ubicación | Sale del dispositivo |
|---|---|---|---|---|
| `products` | id, nombre, marca, código de barras, categoría, unidad y ubicación por defecto, umbral de existencias, URL de imagen, origen, notas, fechas de creación/modificación | Indirectamente: hábitos de consumo del hogar; las **notas** son texto libre y podrían contener cualquier dato | SQLite local `stoky.db` | No |
| `stock_lots` | id, producto, cantidad, unidad, ubicación, fecha de incorporación, fecha de caducidad, tipo de fecha, estimada, lote del fabricante, notas, fechas | Indirectamente (hábitos, ritmo de consumo) | SQLite local | No |
| `shopping_lists` | id, nombre, fechas | Indirectamente | SQLite local | No |
| `shopping_items` | id, lista, producto, nombre, cantidad, unidad, marcado, incorporado, fechas | Indirectamente | SQLite local | No |
| `settings` | antelación de avisos, hora, avisos activos, mostrar nombres, consentimiento de consulta externa y su fecha, preferencias de recetas (vegetariana, tiempo máximo) | La preferencia vegetariana puede revelar convicciones o hábitos; **no** es un dato de salud | SQLite local | No |
| Notificaciones programadas | título, número de productos y, si el usuario lo permite, nombres | Indirectamente | Sistema Android | No |
| Petición a Open Food Facts | código de barras; IP y cabeceras técnicas (implícitas) | La IP es un dato personal | Red → servidores de Open Food Facts | **Sí**, con consentimiento |
| Descarga de imagen de producto | URL de la imagen; IP (implícita) | IP | Red → servidores de imágenes de Open Food Facts | **Sí**, tras una consulta consentida |
| Métricas de ML Kit | [VERIFICAR] | [VERIFICAR] | Google | [VERIFICAR] |

No se recogen: nombre, correo, teléfono, ubicación, contactos, identificadores publicitarios, fotografías, datos de salud, datos de menores identificados.

## 2. Registro de actividades de tratamiento (propuesta)

### T1. Consulta de productos por código de barras

| Campo | Contenido |
|---|---|
| Finalidad | Identificar un producto escaneado para facilitar su alta |
| Base jurídica | Consentimiento (art. 6.1.a) [REVISAR rol del responsable] |
| Categorías de interesados | Usuarios de la app |
| Categorías de datos | Código de barras del producto; dirección IP |
| Destinatarios | Open Food Facts |
| Transferencias internacionales | [VERIFICAR] |
| Plazo de conservación | El responsable no conserva estos datos; Open Food Facts según su política |
| Medidas de seguridad | HTTPS, sin cookies, sin identificadores, catálogo local primero, revocable |

### T2. Atención de solicitudes y consultas

| Campo | Contenido |
|---|---|
| Finalidad | Responder consultas y solicitudes de ejercicio de derechos recibidas en [CORREO DE CONTACTO] |
| Base jurídica | Obligación legal (art. 6.1.c en relación con arts. 12-22 RGPD) |
| Datos | Identificación y contacto que aporte la persona; contenido de la solicitud |
| Conservación | El tiempo necesario para atender la solicitud y los plazos de prescripción aplicables [DEFINIR] |

### T3. Gestión de incidentes de seguridad

| Campo | Contenido |
|---|---|
| Finalidad | Detectar, gestionar y documentar incidentes (art. 33.5) |
| Base jurídica | Obligación legal (art. 6.1.c) |
| Datos | Los mínimos necesarios para describir el incidente |
| Conservación | [DEFINIR] |

### T4 (futuro). Cuentas, hogares y sincronización

A completar antes de implementar el servidor: cuentas (correo, hash de contraseña), miembros y permisos del hogar, dispositivos y sesiones, datos sincronizados del inventario y listas, registros de seguridad.

## 3. Flujo de datos

```
[Usuario] ──escribe/escanea──▶ [App Stocky] ──SQLite──▶ [Almacenamiento privado del dispositivo]
                                   │
                                   ├── cámara ──▶ [ML Kit en el dispositivo] ─(métricas, VERIFICAR)─▶ [Google]
                                   │
                                   └── solo con consentimiento y si el producto no está en local:
                                       GET /api/v2/product/{código}.json ──HTTPS──▶ [Open Food Facts]
```
