# Protección de datos: análisis inicial

> **BORRADOR PENDIENTE DE REVISIÓN POR UN PROFESIONAL DE PROTECCIÓN DE DATOS.** Este documento no declara que Stoky cumpla el RGPD; describe el diseño técnico y las cuestiones abiertas.

**Última actualización:** [FECHA DE ACTUALIZACIÓN]

## 1. Normativa considerada

- Reglamento (UE) 2016/679 (RGPD).
- Ley Orgánica 3/2018 (LOPDGDD).
- Ley 34/2002 (LSSI), en particular el art. 22.2 sobre almacenamiento y acceso a información en equipos terminales.
- Real Decreto Legislativo 1/2007 (consumidores y usuarios), para los términos de uso.
- Reglamento (UE) n.º 1169/2011 (información alimentaria), para la distinción entre fecha de caducidad y de consumo preferente.
- Políticas de Google Play (datos de usuario, permisos, sección de seguridad de los datos, público objetivo).

No todas aplican del mismo modo en cada escenario de distribución (ver `README.md`).

## 2. Roles

| Tratamiento | Quién decide fines y medios | Rol propuesto | Pendiente |
|---|---|---|---|
| Inventario, listas y ajustes guardados en el dispositivo | El usuario, en su ámbito doméstico. El desarrollador diseña el software pero no accede a los datos | Probable exención doméstica para el usuario (art. 2.2.c y considerando 18 RGPD). El desarrollador no es responsable de datos que no trata, aunque sí está obligado a aplicar privacidad desde el diseño en la medida en que el considerando 78 orienta a los productores | Confirmar |
| Consulta del código de barras a Open Food Facts | El desarrollador decide integrar la consulta; Open Food Facts trata la petición en sus servidores | A analizar: posible corresponsabilidad limitada a la transmisión (doctrina del TJUE en el asunto C-40/17, *Fashion ID*), o ausencia de tratamiento por el desarrollador al no intervenir en el flujo | **Revisión jurídica obligatoria** |
| Métricas de Google ML Kit | Google, según sus condiciones | A analizar | **Verificar qué datos envía y en qué condiciones** |
| Servidor de sincronización (futuro) | Operador del servidor | Responsable (o encargado si opera por cuenta de otro) | Contrato de encargo, RAT, EIPD si procede |

## 3. Bases jurídicas

| Tratamiento | Base propuesta |
|---|---|
| Funciones locales | No llegan al responsable (ver §2) |
| Consulta a Open Food Facts | Consentimiento (art. 6.1.a): información previa clara, acción afirmativa («Permitir consultas»), registro local de la decisión con fecha, revocación tan sencilla como la concesión (interruptor en Ajustes) |
| Servidor futuro: cuenta y sincronización | Ejecución de un contrato (art. 6.1.b) para la prestación del servicio solicitado; interés legítimo (art. 6.1.f) para registros de seguridad mínimos, con evaluación de ponderación |

## 4. Privacidad desde el diseño y por defecto (art. 25 RGPD)

Medidas implementadas en la v1 (comprobables en el código):

| Medida | Implementación |
|---|---|
| Sin cuenta ni registro | No existe autenticación en la v1 |
| Almacenamiento local por defecto | SQLite en el almacenamiento privado de la app (`src/data/expoConnection.ts`) |
| Sin telemetría, analítica ni publicidad | No hay SDK de este tipo entre las dependencias (`apps/android/package.json`); permiso `AD_ID` bloqueado en `app.json` |
| Consulta externa con consentimiento previo | `src/services/scanService.ts` no llama a la red si el consentimiento no es `granted`; probado en `scanService.test.ts` |
| Minimización en la consulta | Solo el código en la URL, sin cookies (`credentials: 'omit'`), sin cuerpo; probado en `integrations.test.ts` |
| Catálogo local primero | Si el producto ya existe en el dispositivo, no se consulta fuera |
| Notificaciones sin nombres por defecto | `notificationShowNames: false` y canal con visibilidad `PRIVATE` (`src/integrations/notifications.ts`) |
| Sin copias automáticas en la nube | `android.allowBackup: false` (verificado en el AndroidManifest generado con `expo prebuild`) |
| Permisos mínimos | Solo cámara y notificaciones; micrófono, ubicación y almacenamiento bloqueados en `app.json` |
| Cámara sin captura | Solo se leen códigos; no se toman fotos |
| Logs sin datos personales | `src/state/errors.ts` registra solo la operación y el tipo de error, y solo en desarrollo |
| Borrado completo | Ajustes → Eliminar todos mis datos: borra tablas, ejecuta `VACUUM` y vacía el WAL; cancela avisos |
| Borrado seguro de registros | `PRAGMA secure_delete = ON` |
| Recetas locales | El inventario no se envía a servicios de IA ni a terceros |

## 5. Cifrado local

- SQLite **no cifra** los datos por sí mismo.
- La protección actual es la del sistema: aislamiento de aplicaciones y cifrado de almacenamiento de Android.
- Alternativa evaluada: SQLCipher (admitido por `expo-sqlite` mediante la opción `useSQLCipher`) con clave aleatoria guardada en Android Keystore (`expo-secure-store`). Limitaciones: pérdida irreversible de datos si se pierde la clave, protección nula frente a código que se ejecute dentro de la propia app, mayor tamaño.
- Decisión v1: no cifrar, por la sensibilidad baja-media de los datos y la ausencia de copias en la nube. Reevaluar antes de guardar credenciales, datos de salud o habilitar exportaciones. **No se implementarán mecanismos criptográficos propios.**

## 6. Cookies y tecnologías similares

- La app nativa no usa cookies, identificadores publicitarios, píxeles ni SDK de seguimiento.
- La base de datos local almacena información en el equipo terminal, pero es **estrictamente necesaria** para prestar el servicio expresamente solicitado por el usuario, supuesto exceptuado del consentimiento por el art. 22.2 LSSI.
- La petición a Open Food Facts se realiza con `credentials: 'omit'`, por lo que no se envían ni se aceptan cookies en ella.
- Conclusión: **no se requiere política de cookies ni banner** para la app. [CONFIRMAR en la revisión jurídica.] Si se crea una web (por ejemplo, para alojar la política de privacidad), deberá analizarse por separado.

## 7. Derechos de los interesados

| Derecho | Datos locales | Servidor futuro |
|---|---|---|
| Acceso | El usuario ve todos sus datos en la app | Exportación desde la cuenta + solicitud por correo |
| Rectificación | Edición en la app | Edición en la app; solicitud por correo |
| Supresión | Borrado individual o total en la app; desinstalación | Borrado de cuenta y hogar con plazo definido |
| Portabilidad | No implementada en v1 (pendiente: exportación en formato abierto, protegida si contiene datos personales) | Exportación en JSON |
| Oposición / retirada del consentimiento | Interruptor de consulta externa en Ajustes | Ajustes de la cuenta |

Canal: [CORREO DE CONTACTO]. Plazo: un mes (art. 12.3 RGPD). Verificar la identidad de quien solicita sin recabar más datos de los necesarios.

## 8. Datos potencialmente sensibles

El inventario no es por sí mismo una categoría especial de datos (art. 9 RGPD), pero puede revelar hábitos, número de personas del hogar, dietas o circunstancias económicas. Si en el futuro se añaden **alergias, intolerancias o dietas vinculadas a personas**:

1. Recoger solo si es necesario para una función que el usuario pida.
2. Determinar la base jurídica y la excepción del art. 9.2 (previsiblemente consentimiento explícito, art. 9.2.a).
3. Mantenerlos solo en local por defecto; no incluirlos en logs, notificaciones ni telemetría.
4. Evitar asociarlos a perfiles personales identificables si basta con preferencias del hogar.
5. Realizar una evaluación de impacto (EIPD) si se sincronizan con un servidor.
6. No ofrecer diagnósticos ni recomendaciones presentadas como consejo sanitario.

## 9. Transferencias internacionales

- v1: posibles transferencias derivadas de Open Food Facts y Google ML Kit. [VERIFICAR ubicaciones y garantías.]
- Servidor futuro: alojar preferentemente en el EEE; si no, aplicar decisiones de adecuación o cláusulas contractuales tipo.

## 10. Registro de actividades de tratamiento (art. 30)

Ver `inventario-de-datos-y-tratamientos.md`. Valorar si es obligatorio llevarlo (art. 30.5) en función del escenario; se recomienda mantenerlo en cualquier caso.

## 11. Aspectos que requieren revisión profesional

1. Rol del desarrollador respecto a la consulta a Open Food Facts y a las métricas de ML Kit.
2. Necesidad y contenido de la información del art. 10 LSSI.
3. Redacción de la limitación de responsabilidad frente a consumidores.
4. Edad mínima y configuración de público objetivo en Google Play.
5. Respuestas del formulario «Seguridad de los datos» de Google Play.
6. Todo el diseño del servidor futuro (EIPD, contratos de encargo, política de sesiones y recuperación de cuentas).
