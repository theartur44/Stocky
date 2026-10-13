# Evaluación de riesgos para los derechos y libertades

> **BORRADOR PENDIENTE DE REVISIÓN.** Evaluación inicial y cualitativa. No sustituye a una evaluación de impacto (EIPD, art. 35 RGPD), que deberá valorarse antes de implementar el servidor o de tratar datos de salud.

**Última actualización:** [FECHA DE ACTUALIZACIÓN]

Escala: probabilidad e impacto Bajo / Medio / Alto. Riesgo residual tras las medidas.

## 1. Versión actual (local, sin servidor)

| # | Riesgo | Prob. | Impacto | Medidas | Residual |
|---|---|---|---|---|---|
| R1 | Acceso de terceros al inventario en un dispositivo perdido o compartido | Media | Bajo-Medio (revela hábitos) | Almacenamiento privado, cifrado del sistema, recomendación de bloqueo de pantalla | Bajo |
| R2 | Exposición de nombres de productos en la pantalla de bloqueo | Media | Bajo | Avisos sin nombres por defecto; canal con visibilidad privada | Bajo |
| R3 | Copia del inventario en la nube sin conocimiento del usuario | Media | Medio | `allowBackup=false` | Bajo |
| R4 | Envío de datos a terceros sin informar | Baja | Medio | Consentimiento previo; solo código de barras; sin cookies; documentado | Bajo |
| R5 | Métricas de ML Kit no declaradas | Media | Bajo-Medio | Pendiente de verificar y declarar | **Medio hasta verificar** |
| R6 | Usuario confía en la fecha como garantía de seguridad alimentaria | Media | Alto (salud) | Textos sin afirmaciones de seguridad, distinción caducidad/preferente, fechas estimadas marcadas, aviso permanente | Medio-Bajo |
| R7 | Pérdida de datos (desinstalación, fallo del dispositivo) | Media | Bajo | Información clara en Ajustes; exportación prevista | Bajo-Medio |
| R8 | Corrupción del inventario (doble incorporación de la compra, cantidades negativas) | Baja | Bajo | Transacciones, idempotencia, `CHECK`, pruebas automatizadas | Bajo |
| R9 | Datos de salud introducidos en notas de texto libre | Baja | Medio | Recomendación en la política; sin envío fuera; borrado disponible | Bajo |
| R10 | Información errónea de Open Food Facts | Alta | Bajo | Presentada como sugerencia editable | Bajo |
| R11 | Dependencia comprometida en la cadena de suministro | Baja | Alto | `package-lock.json`, revisión de dependencias, mínimas dependencias | Medio-Bajo |
| R12 | Publicación accidental de secretos | Baja | Medio | La app no tiene secretos; `.gitignore`; `check-secrets.sh` | Bajo |

## 2. Fase futura (servidor de sincronización)

| # | Riesgo | Medidas previstas |
|---|---|---|
| F1 | Acceso a datos de otro hogar (IDOR / dispositivo manipulado) | Hogar derivado del token; filtros por `household_id` en todas las consultas; pruebas de acceso cruzado; IDs aleatorios |
| F2 | Robo de credenciales / fuerza bruta | Argon2id, limitación de intentos, anti-enumeración, MFA opcional |
| F3 | Robo de tokens en el dispositivo | `expo-secure-store` (Keystore), tokens de vida corta, revocación por dispositivo |
| F4 | Exposición de la base de datos | PostgreSQL sin acceso público; red interna; credenciales en secretos; cifrado de copias |
| F5 | Conflictos de sincronización que pierden datos | Deltas para cantidades, versionado, pruebas de conflictos |
| F6 | Registros con datos personales | Registros estructurados sin contenido del inventario |
| F7 | Conexión a servidores maliciosos configurados por el usuario | Validación de URL; solo HTTPS en producción; aviso claro al cambiar de servidor |
| F8 | Miembro expulsado conserva acceso | Revocación inmediata de sesiones y permisos |

## 3. Necesidad de EIPD

Con la información actual, la v1 no parece cumplir los criterios que hacen obligatoria una EIPD (tratamiento a gran escala de categorías especiales, observación sistemática, etc.; ver lista de la AEPD de tratamientos que requieren EIPD). **Reevaluar** si se añade: servidor con datos de muchos hogares, alergias o datos de salud, perfiles de consumo, o IA con datos del inventario.
