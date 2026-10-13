# Seguridad y gestión de incidentes

> **BORRADOR PENDIENTE DE REVISIÓN.** Debe adaptarse a la organización real del responsable (personas, medios y canales).

**Última actualización:** [FECHA DE ACTUALIZACIÓN]
**Contacto de seguridad:** [CORREO DE SEGURIDAD]

## 1. Medidas de seguridad de la v1 (app sin servidor)

| Ámbito | Medida |
|---|---|
| Almacenamiento | Base de datos en el almacenamiento privado de la app; cifrado del sistema de Android; sin cifrado propio (ver `proteccion-de-datos.md §5`) |
| Copias | `allowBackup=false`: sin copias automáticas en la nube |
| Integridad | Transacciones SQLite, restricciones `CHECK` y claves foráneas, validación de entradas en el dominio, control optimista de cantidades |
| Red | Solo HTTPS a un dominio fijo (`world.openfoodfacts.org`); tiempo máximo de 8 s; sin cookies; validación y saneado de la respuesta (longitudes, caracteres de control, solo imágenes `https://`) |
| Inyección | Consultas SQL parametrizadas; ningún dato del usuario se concatena en SQL. El código escaneado se valida (`^\d{8,14}$`) antes de formar la URL |
| Navegación | Las notificaciones solo pueden abrir rutas de una lista cerrada (`/expiring`) |
| Permisos | Solo cámara y notificaciones; micrófono, ubicación, almacenamiento y `AD_ID` bloqueados |
| Registros | Sin datos personales; solo operación y tipo de error, solo en desarrollo |
| Secretos | La app no usa claves ni tokens. `.gitignore` excluye `.env`, claves, almacenes de claves, bases de datos y `google-services.json`. `scripts/check-secrets.sh` antes de publicar |
| Dependencias | Versiones fijadas al SDK de Expo; `npm audit` y `scripts/check-licenses.mjs` antes de publicar |

### Hallazgos conocidos de `npm audit` (2026-10-13)

`npm audit --omit=dev` informa de 41 avisos (15 moderados, 26 altos) en `braces`, `decode-uri-component`, `node-forge`, `sprintf-js` y `uuid`, todos ellos **dependencias de herramientas de compilación** (CLI de Expo, Metro, configuración), no del código que se ejecuta en el dispositivo. No se ha aplicado `npm audit fix --force` porque rompería la compatibilidad con el SDK 57. Revisar en cada actualización del SDK.

## 2. Medidas previstas para el servidor (fase futura)

- HTTPS obligatorio (TLS 1.2+), HSTS; la app rechazará direcciones `http://` en producción salvo `localhost`/redes locales en modo desarrollo.
- PostgreSQL sin exposición a Internet (red interna de Docker).
- Contraseñas con Argon2id (o bcrypt) mediante biblioteca mantenida; nunca en claro.
- Tokens de acceso de vida corta y tokens de refresco rotatorios y revocables por dispositivo; almacenados en el móvil con `expo-secure-store` (Android Keystore).
- Autorización en cada operación: el hogar se deriva del token, nunca de un parámetro; todas las consultas filtran por `household_id`; pruebas automáticas de acceso cruzado entre hogares.
- Limitación de peticiones por IP y por cuenta; respuestas idénticas para «usuario no existe» y «contraseña incorrecta» (anti-enumeración).
- Validación estricta de entradas (Pydantic) y tamaños máximos de petición.
- Secretos en variables de entorno o gestor de secretos; nunca en el repositorio.
- Registros de seguridad sin contenido del inventario.
- Copias de seguridad cifradas con pruebas periódicas de restauración.
- Actualizaciones de seguridad de imágenes base y dependencias.

## 3. Procedimiento de gestión de incidentes

### 3.1. Qué es un incidente

Cualquier evento que comprometa (o pueda comprometer) la confidencialidad, integridad o disponibilidad de los datos o del software: una vulnerabilidad en la app, una dependencia comprometida, la publicación accidental de un secreto, el compromiso de la cuenta de publicación en Google Play o del repositorio, o, en el futuro, un acceso no autorizado al servidor.

Una **brecha de datos personales** (art. 4.12 RGPD) es un incidente que afecta a datos personales tratados **por el responsable**. En la v1 el responsable no almacena datos de usuarios; aun así, una vulnerabilidad de la app puede afectar a datos de los usuarios en sus dispositivos y debe gestionarse con este procedimiento.

### 3.2. Fases

1. **Detección y registro** (inmediato): recibir el aviso (correo [CORREO DE SEGURIDAD], reseñas, GitHub, avisos de dependencias). Registrar fecha y hora, fuente y descripción **sin copiar datos personales innecesarios**.
2. **Evaluación inicial** (≤ 24 h): alcance, datos y personas afectadas, gravedad, si es explotable, si hay datos personales en poder del responsable.
3. **Contención**: revocar secretos expuestos, retirar o pausar la versión afectada en Google Play, desactivar funciones (por ejemplo, la consulta externa), aislar el servidor.
4. **Notificación a la autoridad** (si hay brecha de datos personales tratados por el responsable): a la **AEPD en un máximo de 72 horas** desde que se tenga constancia, salvo que sea improbable que suponga un riesgo para los derechos y libertades (art. 33 RGPD). Si no se dispone de toda la información, notificar por fases.
5. **Comunicación a los afectados** (si el riesgo es alto): sin dilación indebida, en lenguaje claro (art. 34 RGPD). En la v1, mediante actualización de la app, aviso en la ficha de Google Play y en el repositorio.
6. **Erradicación y recuperación**: corregir, publicar la versión corregida, verificar.
7. **Lecciones aprendidas**: análisis de causa, medidas para evitar la repetición, actualización de este documento.

### 3.3. Registro de incidentes (art. 33.5 RGPD)

Documentar **todas** las brechas, se notifiquen o no: hechos, efectos, medidas adoptadas y motivación de la decisión de notificar o no. Plantilla:

| Campo | Contenido |
|---|---|
| Identificador | INC-AAAA-NNN |
| Fecha de detección / de constancia | |
| Descripción | |
| Datos y nº aproximado de personas afectadas | |
| Evaluación del riesgo | |
| ¿Notificado a la AEPD? Fecha / motivo de no notificar | |
| ¿Comunicado a los afectados? | |
| Medidas de contención y corrección | |
| Responsable de la gestión | [NOMBRE] |

### 3.4. Divulgación responsable

Se agradecerán los avisos de vulnerabilidades a [CORREO DE SEGURIDAD]. Pendiente: publicar `SECURITY.md` en el repositorio con este contacto y el plazo de respuesta.

## 4. Reproducción de errores sin datos personales

Ver `docs/pruebas.md §4`: los informes de errores deben describir los pasos con datos inventados y nunca adjuntar la base de datos real de un usuario.
