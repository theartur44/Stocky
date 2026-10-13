#!/usr/bin/env node
/**
 * Lista las licencias de las dependencias de producción de la app Android
 * (según package-lock.json y los package.json instalados) y marca las que no
 * estén en la lista de licencias permisivas aceptadas.
 *
 * Uso: node scripts/check-licenses.mjs [--markdown]
 * Requiere haber ejecutado `npm ci` en apps/android.
 * Sale con código 1 si encuentra licencias no revisadas.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'android');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CC-BY-4.0',
  '(MIT OR Apache-2.0)',
  '(MIT OR CC0-1.0)',
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
  'MIT OR Apache-2.0',
]);

/**
 * Excepciones revisadas manualmente (paquete → motivo). Revisar al actualizar.
 * Se aceptan por nombre de paquete y licencia exacta: si cambia la licencia,
 * vuelve a marcarse.
 */
const REVIEWED = {
  '@expo-google-fonts/material-symbols': {
    license: 'MIT AND Apache-2.0',
    reason: 'Fuente incluida en el APK por expo-router. Apache-2.0 exige conservar el aviso de licencia (ver docs/legal/licencias-de-terceros.md).',
  },
  'node-forge': {
    license: '(BSD-3-Clause OR GPL-2.0)',
    reason: 'Licencia dual: se usa bajo BSD-3-Clause. Herramienta de la CLI de Expo; no se incluye en el APK.',
  },
};
const MPL_BUILD_TOOLS = /^lightningcss(-.+)?$/; // MPL-2.0, herramienta de compilación de Metro; no se incluye en el APK.

const rows = [];
for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (!path || info.dev || info.devOptional) continue; // solo producción
  const name = path.replace(/^.*node_modules\//, '');
  let license = info.license;
  const pkgFile = join(root, path, 'package.json');
  if (!license && existsSync(pkgFile)) {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
  }
  rows.push({ name, version: info.version ?? '?', license: license ?? 'DESCONOCIDA' });
}

rows.sort((a, b) => a.name.localeCompare(b.name));
const isReviewed = (r) =>
  REVIEWED[r.name]?.license === r.license || (MPL_BUILD_TOOLS.test(r.name) && r.license === 'MPL-2.0');
const flagged = rows.filter((r) => !ALLOWED.has(r.license) && !isReviewed(r));
const reviewed = rows.filter((r) => !ALLOWED.has(r.license) && isReviewed(r));

if (process.argv.includes('--markdown')) {
  const counts = {};
  for (const r of rows) counts[r.license] = (counts[r.license] ?? 0) + 1;
  console.log('| Licencia | Nº de paquetes |\n|---|---|');
  for (const [l, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`| ${l} | ${n} |`);
  console.log(`\nTotal de paquetes de producción: ${rows.length}`);
} else {
  console.log(`Paquetes de producción: ${rows.length}`);
}

if (reviewed.length) {
  console.log(`\nExcepciones revisadas (${reviewed.length}):`);
  for (const r of reviewed) {
    const reason = REVIEWED[r.name]?.reason ?? 'MPL-2.0, herramienta de compilación; no se incluye en el APK.';
    console.log(`  - ${r.name}@${r.version} (${r.license}): ${reason}`);
  }
}

if (flagged.length) {
  console.log('\nLicencias que requieren revisión:');
  for (const r of flagged) console.log(`  - ${r.name}@${r.version}: ${r.license}`);
  process.exitCode = 1;
} else {
  console.log('No hay licencias pendientes de revisión.');
}
