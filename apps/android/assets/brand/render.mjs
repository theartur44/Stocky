// Genera los PNG de icono y pantalla de carga a partir de la marca vectorial.
// Uso: node assets/brand/render.mjs <ruta-a-chrome>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..');
const chrome = process.argv[2];
const part = readFileSync(join(here, 'mark.svg.part'), 'utf8');

const BG = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#3FBF73"/><stop offset="1" stop-color="#14592F"/></linearGradient></defs>`;

const colored = (p) =>
  p.replaceAll('"LEAF"', '"#FFD166"').replaceAll('"LEAFVEIN"', '"#E0A526"').replaceAll('"JAR"', '"#FFFFFF"')
   .replaceAll('"BAR1"', '"#3FBF73"').replaceAll('"BAR2"', '"#3FBF73"').replaceAll('"BAR3"', '"#F4A340"');
const mono = (p) =>
  p.replaceAll('"LEAF"', '"#FFFFFF"').replaceAll('"LEAFVEIN"', '"#000000"').replaceAll('"JAR"', '"#FFFFFF"')
   .replaceAll(/"BAR\d"/g, '"#000000"');

/** Coloca la marca a una escala dada, con su caja (x 292-812, y 96-800) centrada en un lienzo de 1024. */
const CX = 552;
const CY = 448;
const placed = (body, scale) =>
  `<g transform="translate(${512 - CX * scale} ${512 - CY * scale}) scale(${scale})">${body}</g>`;

const svgs = {
  // Icono clásico: fondo degradado a sangre (el lanzador aplica su máscara).
  'icon.png': `${BG}<rect width="1024" height="1024" fill="url(#bg)"/>${placed(colored(part), 1.0)}`,
  // Icono adaptativo: fondo y primer plano por separado (zona segura ≈ 66 %).
  'android-icon-background.png': `${BG}<rect width="1024" height="1024" fill="url(#bg)"/>`,
  'android-icon-foreground.png': placed(colored(part), 0.78),
  // Monocromo (Android 13+ temas): silueta blanca, los niveles se recortan.
  'android-icon-monochrome.png': `<defs><mask id="m">${placed(mono(part), 0.78)}</mask></defs>
    <rect width="1024" height="1024" fill="#FFFFFF" mask="url(#m)"/>`,
  // Pantalla de carga: el icono en forma de «squircle».
  'splash-icon.png': `${BG}<rect x="112" y="112" width="800" height="800" rx="230" fill="url(#bg)"/>${placed(colored(part), 0.7)}`,
};

const dir = mkdtempSync(join(tmpdir(), 'stoky-icons-'));
for (const [name, body] of Object.entries(svgs)) {
  const html = join(dir, `${name}.html`);
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg></body></html>`);
  execFileSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--default-background-color=00000000', '--window-size=1024,1024', `--screenshot=${join(out, name)}`, `file://${html}`],
    { stdio: 'ignore' });
  console.log('generado', name);
}
