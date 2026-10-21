# Política de privacidad de Stocky

> **BORRADOR PENDIENTE DE REVISIÓN JURÍDICA.** Refleja el comportamiento de la versión 0.1.0 de la aplicación Android, incluida la sincronización opcional con un servidor propio (§12). Debe actualizarse antes de publicar cualquier versión que cambie el tratamiento de datos.

**Última actualización:** [FECHA DE ACTUALIZACIÓN]
**Versión de la app a la que se refiere:** 0.1.0

## 1. Quién es el responsable

- Responsable: [NOMBRE DEL RESPONSABLE]
- NIF/CIF: [NIF/CIF]
- Domicilio: [DOMICILIO]
- Contacto: [CORREO DE CONTACTO]
- Delegado de protección de datos: [DPD, SI EXISTE]

> Nota para la revisión: en la versión actual, el responsable **no recibe** los datos del inventario ni las listas, que solo existen en el dispositivo del usuario. Debe analizarse qué tratamientos realiza efectivamente el responsable (ver `proteccion-de-datos.md`) para ajustar esta sección.

## 2. Resumen

- Stocky funciona **sin cuenta, sin registro y sin conexión obligatoria**.
- Tu inventario, tus listas de la compra y tus ajustes se guardan **solo en tu dispositivo**. No los recibimos.
- Stocky **no incluye publicidad, analítica ni rastreadores**.
- Hay **una única comunicación externa** iniciada por la app: si lo permites, al escanear un producto que no está en tu inventario, se consulta su **código de barras** en Open Food Facts.
- El escáner usa el componente **Google ML Kit**, que procesa la imagen en el dispositivo (ver §5.2).

## 3. Qué datos trata la app y dónde

| Datos | Ejemplos | Dónde se guardan | ¿Salen del dispositivo? |
|---|---|---|---|
| Inventario | Productos, marcas, cantidades, ubicaciones, fechas de caducidad, lotes, notas | Base de datos local de la app (almacenamiento privado de Android) | No |
| Listas de la compra | Artículos, cantidades, estado | Base de datos local | No |
| Ajustes | Días de antelación, hora de avisos, preferencias de recetas, decisión sobre la consulta externa y su fecha | Base de datos local | No |
| Código de barras escaneado | 8-14 dígitos de un producto comercial | Se guarda en el producto si lo añades | Solo si has permitido la consulta y el producto no está ya en tu dispositivo (ver §5.1) |
| Imagen de la cámara | Fotograma de vídeo durante el escaneo | **No se guarda** | No (se analiza en el dispositivo) |
| Avisos programados | Fecha, número de productos y, si lo activas, sus nombres | Sistema de notificaciones de Android | No |

Las notas del inventario son texto libre: te recomendamos no escribir en ellas datos personales ni de salud.

## 4. Para qué se usan

- Gestionar tu inventario, tus listas y tus avisos de caducidad (función principal que solicitas).
- Sugerir recetas: el cálculo se hace **en el dispositivo**; el inventario no se envía a ningún servicio ni a proveedores de inteligencia artificial.
- Identificar un producto escaneado (solo con tu permiso).

No se elaboran perfiles, no se toman decisiones automatizadas con efectos jurídicos y no se usan los datos con fines publicitarios.

## 5. Terceros que intervienen

### 5.1. Open Food Facts (consulta opcional de productos)

- **Qué se envía:** el código de barras del producto, en la dirección de la petición. Como en cualquier conexión a Internet, el servidor recibe también la **dirección IP** del dispositivo y datos técnicos de la conexión (por ejemplo, la identificación de la app «Stocky/versión»).
- **Qué no se envía:** inventario, listas, nombres que hayas escrito, imágenes, identificadores del dispositivo o cookies.
- **Cuándo:** solo si has aceptado la consulta (se pregunta la primera vez que escaneas un producto desconocido) y el producto no está ya guardado en tu dispositivo. Puedes desactivarla en **Ajustes → Privacidad**.
- **Quién lo recibe:** Open Food Facts, base de datos colaborativa gestionada por una asociación sin ánimo de lucro con sede en Francia, según su información pública. El tratamiento que realice de las peticiones (por ejemplo, registros de servidor) se rige por su propia política de privacidad: [ENLACE A LA POLÍTICA DE OPEN FOOD FACTS — verificar].
- **Transferencias internacionales:** [VERIFICAR la ubicación de los servidores y proveedores de Open Food Facts]. Según la información disponible, el servicio se presta desde la Unión Europea.
- **Imagen del producto:** si Open Food Facts devuelve una imagen, la app la descarga de sus servidores para mostrártela al dar de alta el producto, lo que implica otra conexión con tu IP.

### 5.2. Google ML Kit (lectura de códigos de barras)

El escáner usa la biblioteca de Google ML Kit incluida en la app. El análisis de la imagen **se realiza en el dispositivo** y la app no guarda ni envía fotografías. Según la documentación de Google, ML Kit puede comunicarse con servidores de Google para enviar **métricas de uso y diagnóstico** de la biblioteca. [VERIFICAR la declaración de datos vigente de ML Kit y, si procede, sus opciones de configuración, e indicar aquí qué datos se envían, su finalidad y el país de destino.]

### 5.3. Servicios del sistema

- **Notificaciones**: los avisos son **locales**; se programan en el propio dispositivo. La app no solicita tokens de notificaciones push ni usa Firebase Cloud Messaging, aunque la biblioteca `expo-notifications` incluye su código. El permiso de recepción de mensajes push (`c2dm.permission.RECEIVE`) y el de origen de instalación de Google Play se eliminan del manifiesto. [VERIFICAR en dispositivo que no se inicializa Firebase ni se registran tokens.]
- **Google Play** (si se distribuye por esta vía): Google trata datos relacionados con la descarga y las actualizaciones conforme a su propia política.

## 6. Base jurídica

> A completar tras la revisión jurídica. Propuesta inicial:

- Funciones locales (inventario, listas, avisos): los datos no llegan al responsable. Para el usuario que gestiona su propio hogar, el tratamiento puede quedar dentro de la actividad exclusivamente personal o doméstica (art. 2.2.c RGPD).
- Consulta a Open Food Facts: **consentimiento** del usuario (art. 6.1.a RGPD), solicitado antes de la primera consulta, revocable en cualquier momento en Ajustes. [REVISAR si procede otra base y el papel del responsable respecto a esta transmisión.]
- Métricas de ML Kit: [PENDIENTE de análisis].

## 7. Cuánto tiempo se conservan

- Datos locales: hasta que los borres (individualmente o con **Ajustes → Eliminar todos mis datos**) o desinstales la app.
- Las **copias de seguridad automáticas de Android están desactivadas** para Stocky: los datos no se copian a la nube de Google. Si desinstalas la app, los datos se pierden.
- Datos recibidos por terceros: según sus políticas. Detalle en `retencion-y-eliminacion.md`.

## 8. Tus derechos

Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad (arts. 15 a 22 RGPD).

- **Datos de tu dispositivo:** puedes consultarlos, corregirlos y borrarlos directamente en la app. El responsable no tiene acceso a ellos, por lo que no puede consultarlos ni borrarlos por ti.
- **Retirar el consentimiento** a la consulta externa: **Ajustes → Privacidad**. La retirada no afecta a las consultas ya realizadas.
- **Datos tratados por Open Food Facts o Google:** dirígete a ellos según sus políticas.
- **Contacto con el responsable:** [CORREO DE CONTACTO]. Responderemos en el plazo de un mes (ampliable en los casos previstos en el art. 12.3 RGPD).
- **Reclamación:** puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es) o la autoridad de control de tu país.

## 9. Menores

Stocky no está dirigida específicamente a menores. [REVISAR la edad mínima y la configuración de público objetivo en Google Play. En España, el art. 7 LOPDGDD fija en 14 años la edad para consentir el tratamiento de datos.]

## 10. Seguridad

Los datos se guardan en el almacenamiento privado de la app, protegido por el aislamiento de aplicaciones de Android y el cifrado del sistema del dispositivo. La base de datos de Stocky **no está cifrada por la propia app** (ver `proteccion-de-datos.md §5`). Recomendamos proteger el dispositivo con bloqueo de pantalla.

## 11. Información de salud

Stocky no solicita alergias, intolerancias ni otros datos de salud. Las recetas y avisos son orientativos y **no** constituyen consejo médico ni nutricional.

## 12. Sincronización con un servidor (opcional)

La app permite conectar, de forma **opcional y desactivada por defecto**, un servidor de sincronización para compartir el inventario y las listas entre los móviles de un hogar. Stocky no ofrece un servidor propio: lo instala y gestiona **quien lo configura** (por ejemplo, un miembro de la familia en su equipo), que pasa a ser responsable de los datos que guarda. [REVISAR por un profesional: escenario C de `docs/legal/README.md`.]

- **Qué se envía al activarlo:** el correo y la contraseña de la cuenta (la contraseña solo para iniciar sesión; el servidor guarda únicamente un resumen Argon2id), el nombre del hogar y el contenido del inventario y de las listas de la compra. Los ajustes del móvil (avisos, tema, consentimientos) **no** se envían.
- **Cómo se protege:** con un dominio, la conexión va cifrada (HTTPS). Con una dirección de red local la conexión va sin cifrar dentro de esa red y la app lo avisa. En el servidor, el inventario, las listas, los correos y los nombres se guardan cifrados (AES-256-GCM). La sesión se guarda en el almacén seguro de Android.
- **Quién lo ve:** los miembros del mismo hogar y quien administra el servidor.
- **Verificación en dos pasos (opcional):** el servidor guarda cifrado el secreto que genera los códigos y solo el resumen (hash) de los códigos de recuperación.
- **Desbloqueo con huella (opcional):** lo comprueba Android; Stocky no recibe ni guarda la huella ni ningún dato biométrico.
- **Cómo dejar de usarlo:** Ajustes → Servidor → Desconectar este móvil. Los datos del hogar en el servidor solo los puede borrar su propietario o quien administra el servidor.

## 13. Cambios en esta política

Publicaremos cualquier cambio en [URL DE LA POLÍTICA] e indicaremos la fecha de actualización. Si el cambio afecta a la forma de tratar tus datos, te avisaremos en la app.
