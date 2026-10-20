# Documentación legal inicial de Stocky

> **BORRADORES PENDIENTES DE REVISIÓN PROFESIONAL.** Estos documentos se han preparado como punto de partida técnico. No constituyen asesoramiento jurídico y no acreditan el cumplimiento del RGPD, la LOPDGDD, la LSSI ni de ninguna otra norma. Antes de distribuir Stocky públicamente deben ser revisados por un profesional jurídico o de protección de datos y completados con los datos reales del responsable.

## Contexto que condiciona el análisis

El tratamiento de datos depende de **cómo se distribuya** Stocky. Los documentos distinguen tres escenarios:

| Escenario | Descripción | Consecuencia principal |
|---|---|---|
| A. Uso personal | El desarrollador usa la app en sus propios dispositivos o en su hogar | Probable aplicación de la exención doméstica (art. 2.2.c RGPD) para el uso propio. Los documentos son orientativos |
| B. Distribución pública sin servidor (v1) | Publicación en Google Play u otro canal; los datos se guardan solo en cada dispositivo | El desarrollador no recibe datos del inventario. Debe informar de forma transparente (Google Play exige política de privacidad) y analizar su papel respecto a terceros integrados (Open Food Facts, Google ML Kit) |
| C. Sincronización con servidor propio (fase futura) | Cuentas, hogares y datos en un servidor | El operador del servidor será **responsable del tratamiento** de los datos alojados (o encargado, si opera por cuenta de otro). Requiere actualizar todos los documentos antes de activar la función |

## Documentos

| Documento | Contenido |
|---|---|
| [politica-de-privacidad.md](politica-de-privacidad.md) | Información a los usuarios (art. 13 RGPD) |
| [terminos-de-uso.md](terminos-de-uso.md) | Condiciones de uso de la app |
| [proteccion-de-datos.md](proteccion-de-datos.md) | Análisis de roles, bases jurídicas, privacidad desde el diseño, cookies |
| [retencion-y-eliminacion.md](retencion-y-eliminacion.md) | Plazos de conservación y procedimientos de borrado |
| [licencias-de-terceros.md](licencias-de-terceros.md) | Software, datos e imágenes de terceros |
| [seguridad-y-gestion-de-incidentes.md](seguridad-y-gestion-de-incidentes.md) | Medidas de seguridad y procedimiento ante incidentes y brechas |
| [inventario-de-datos-y-tratamientos.md](inventario-de-datos-y-tratamientos.md) | Qué datos existen, dónde y con qué finalidad |
| [evaluacion-de-riesgos.md](evaluacion-de-riesgos.md) | Riesgos para las personas y medidas |
| [lista-de-verificacion-legal.md](lista-de-verificacion-legal.md) | Comprobaciones antes de publicar |

**No se incluye `politica-de-cookies.md`**: la aplicación nativa no usa cookies ni tecnologías equivalentes con fines distintos de los estrictamente necesarios para prestar el servicio solicitado por el usuario. El análisis está en [proteccion-de-datos.md §6](proteccion-de-datos.md#6-cookies-y-tecnologías-similares). Si se crea una web, deberá evaluarse por separado.

## Marcadores pendientes

| Marcador | Dónde obtenerlo |
|---|---|
| `[NOMBRE DEL RESPONSABLE]` | Persona física o jurídica que publica la app |
| `[NIF/CIF]` | Identificación fiscal del responsable (si procede según LSSI) |
| `[DOMICILIO]` | Domicilio a efectos de notificaciones |
| `[CORREO DE CONTACTO]` | Correo para consultas y ejercicio de derechos |
| `[CORREO DE SEGURIDAD]` | Correo para notificar vulnerabilidades |
| `[DPD, SI EXISTE]` | Delegado de protección de datos, si se designa |
| `[FECHA DE ACTUALIZACIÓN]` | Fecha de la versión publicada de cada documento |
| `[URL DE LA POLÍTICA]` | Dirección pública donde se aloje la política (exigida por Google Play) |
