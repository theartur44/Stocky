# Lista de verificación legal y de seguridad antes de publicar

> Marcar cada punto con fecha y responsable. Un punto sin marcar bloquea la publicación pública.

**Versión a publicar:** ______ **Fecha:** ______ **Revisado por:** ______

## A. Identidad y documentos

- [ ] Sustituidos todos los marcadores (`[NOMBRE DEL RESPONSABLE]`, `[CORREO DE CONTACTO]`, `[FECHA DE ACTUALIZACIÓN]`, etc.) — buscar con `grep -rn "\[" docs/legal`.
- [ ] Revisión de todos los documentos por un profesional jurídico o de protección de datos.
- [ ] Decidida la licencia del proyecto (`terminos-de-uso.md §9`, `licencias-de-terceros.md §1`).
- [ ] Política de privacidad publicada en una URL pública y accesible ([URL DE LA POLÍTICA]) y enlazada en Google Play y en la app.
- [ ] Información del art. 10 LSSI publicada si aplica.
- [ ] Decidido el canal y el procedimiento para el ejercicio de derechos.

## B. Comportamiento real frente a lo declarado

- [ ] La política describe exactamente las comunicaciones externas de esta versión (buscar `fetch(` y bibliotecas nuevas con red).
- [ ] Verificado qué datos envía Google ML Kit y declarado en la política y en Google Play.
- [ ] Verificado en el APK final que Firebase no se inicializa y no se registran tokens push.
- [ ] Revisado el AndroidManifest **fusionado** del APK (`aapt dump permissions` o Android Studio): solo permisos necesarios; `allowBackup=false`.
- [ ] La consulta a Open Food Facts no se produce sin consentimiento (prueba manual con proxy o registro de red).
- [ ] No hay logs con datos personales en la compilación de producción.

## C. Google Play

- [ ] Formulario «Seguridad de los datos» coherente con §B (datos recogidos/compartidos, cifrado en tránsito, posibilidad de solicitar eliminación).
- [ ] Declaración de permisos (cámara, notificaciones) con justificación.
- [ ] Público objetivo y contenido (no dirigida a menores) [REVISAR].
- [ ] Sin SDK publicitarios ni identificador de publicidad (`AD_ID` bloqueado).
- [ ] Ficha de la tienda sin afirmaciones de seguridad alimentaria ni consejos de salud.
- [ ] Avisos de licencias de terceros accesibles en la app (requisito Apache-2.0 de Material Symbols).

## D. Licencias

- [ ] `node scripts/check-licenses.mjs` sin licencias pendientes.
- [ ] Dependencias nativas (Gradle) revisadas con `./gradlew app:dependencies`.
- [ ] Atribución de Open Food Facts (ODbL) visible.
- [ ] Iconos y recursos gráficos propios o con licencia verificada.

## E. Seguridad técnica (antes de cada publicación)

- [ ] `bash scripts/check-secrets.sh` sin hallazgos.
- [ ] `npm audit --omit=dev` revisado; hallazgos en código de ejecución corregidos o justificados.
- [ ] `npm test` y `npm run typecheck` en verde.
- [ ] `npx expo-doctor` sin errores (requiere red).
- [ ] Prueba manual en dispositivo real según `docs/pruebas.md §4` (incluido modo avión).
- [ ] APK/AAB firmado con clave guardada fuera del repositorio; copia de seguridad segura de la clave de subida.
- [ ] Compilación de producción sin `__DEV__`, sin herramientas de depuración y sin `usesCleartextTraffic`.
- [ ] Revisión de migraciones: probada la actualización desde la versión anterior publicada.

## F. Contenido

- [ ] Textos de caducidad: no afirman que un alimento sea seguro; distinguen caducidad/consumo preferente.
- [ ] Recetas con aviso de alérgenos y sin consejo sanitario.
- [ ] Textos en español revisados; preparados para catalán e inglés.

## G. Antes de activar el servidor (fase futura)

- [ ] Actualizados todos los documentos legales (escenario C).
- [ ] EIPD valorada y, si procede, realizada.
- [ ] Contratos con proveedores de alojamiento (encargados del tratamiento, art. 28).
- [ ] Ubicación de servidores y transferencias internacionales documentadas.
- [ ] Política de sesiones, revocación de dispositivos y recuperación de cuentas.
- [ ] Pruebas de autorización entre hogares y de limitación de peticiones.
- [ ] Copias de seguridad cifradas y prueba de restauración.
