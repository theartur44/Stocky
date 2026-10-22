/**
 * Firma de las versiones publicadas.
 *
 * Si al compilar existen las variables de entorno STOCKY_KEYSTORE (ruta al
 * fichero), STOCKY_KEYSTORE_PASSWORD, STOCKY_KEY_ALIAS y STOCKY_KEY_PASSWORD,
 * el APK «release» se firma con esa clave propia. Si no, se usa la clave de
 * pruebas de la plantilla (como en los APK de pruebas).
 *
 * Las contraseñas nunca se escriben en el proyecto: se leen del entorno (en
 * GitHub Actions, de los «secrets» del repositorio).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'stockyRelease';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARKER)) return cfg;

    const withConfig = gradle.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${MARKER} {
            if (System.getenv('STOCKY_KEYSTORE')) {
                storeFile file(System.getenv('STOCKY_KEYSTORE'))
                storePassword System.getenv('STOCKY_KEYSTORE_PASSWORD')
                keyAlias System.getenv('STOCKY_KEY_ALIAS')
                keyPassword System.getenv('STOCKY_KEY_PASSWORD')
            }
        }`,
    );
    const withRelease = withConfig.replace(
      /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig System.getenv('STOCKY_KEYSTORE') ? signingConfigs.${MARKER} : signingConfigs.debug`,
    );
    if (withConfig === gradle || withRelease === withConfig) {
      throw new Error('withReleaseSigning: no se ha encontrado la configuración de firma esperada en app/build.gradle');
    }
    cfg.modResults.contents = withRelease;
    return cfg;
  });
};
