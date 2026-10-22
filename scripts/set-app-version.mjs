// Pone la versión de la app a partir de una etiqueta de release (p. ej. v0.2.0).
//
//   node scripts/set-app-version.mjs v0.2.0
//
// - expo.version = 0.2.0 (lo que muestra Ajustes y compara el aviso de actualización)
// - android.versionCode = mayor·10000 + menor·100 + parche (siempre creciente,
//   necesario para que Android acepte el APK como actualización)
// Lo usa el flujo de publicación; no hace falta cambiarlo a mano.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] ?? '';
const m = /^v?(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(tag.trim());
if (!m) {
  console.error(`Versión no válida: «${tag}». Usa el formato v1.2.3 (cada número de 0 a 99).`);
  process.exit(1);
}
const [major, minor, patch] = m.slice(1).map(Number);
const version = `${major}.${minor}.${patch}`;
const versionCode = major * 10000 + minor * 100 + patch;
if (versionCode < 2) {
  console.error('La primera versión publicada debe ser mayor que 0.0.1.');
  process.exit(1);
}

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'android', 'app.json');
const app = JSON.parse(readFileSync(file, 'utf8'));
app.expo.version = version;
app.expo.android.versionCode = versionCode;
writeFileSync(file, `${JSON.stringify(app, null, 2)}\n`);
console.log(`version=${version}`);
console.log(`versionCode=${versionCode}`);
