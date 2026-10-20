// Genera los PNG de icono y pantalla de carga a partir del logo vectorial de Stocky
// (casa con lista de la compra, manzana, botella, tarro y verduras; texto «Stocky»
// con una hoja en la «o»). Uso:
//   node assets/brand/render.mjs <ruta-a-chrome>
// Tipografía: Nunito Black (SIL OFL 1.1, ver fonts/OFL.txt).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..');
const chrome = process.argv[2];
const fontUrl = pathToFileURL(join(here, 'fonts', 'Nunito-Black.ttf')).href;

const C = {
  dark: '#17663A',
  green: '#2E9147',
  check: '#2E8B3E',
  cream: '#FBF8EC',
  apple: '#E8472C',
  appleLight: '#F26B4E',
  orange: '#F5A524',
  orangeLight: '#FBC15A',
  leaf: '#4DAA3F',
  leafDark: '#2F8A35',
  bottle: '#E3F1EA',
  bottleEdge: '#C4DFD0',
  spark: '#A8DE74',
};

const DEFS = `<defs>
  <linearGradient id="bg" x1="1" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#63BE5C"/><stop offset="0.55" stop-color="#2F9A4A"/><stop offset="1" stop-color="#16703A"/>
  </linearGradient>
  <clipPath id="houseClip"><path d="M345 455 L630 262 L905 455 L905 712 Q905 765 852 765 L398 765 Q345 765 345 712 Z"/></clipPath>
</defs>`;

/** Casa con su contenido. Coordenadas de diseño en un lienzo de 1254×1254. */
const HOUSE = `
  <!-- chimenea -->
  <rect x="765" y="198" width="95" height="150" rx="16" fill="${C.dark}"/>
  <!-- interior de la casa -->
  <path d="M345 455 L630 262 L905 455 L905 712 Q905 765 852 765 L398 765 Q345 765 345 712 Z" fill="${C.cream}"/>
  <g clip-path="url(#houseClip)">
    <!-- botella -->
    <rect x="372" y="440" width="135" height="320" rx="44" fill="${C.bottle}" stroke="${C.bottleEdge}" stroke-width="6"/>
    <rect x="410" y="398" width="92" height="50" rx="10" fill="${C.green}"/>
    <!-- tarro -->
    <rect x="752" y="492" width="125" height="170" rx="30" fill="${C.orange}"/>
    <rect x="772" y="512" width="22" height="120" rx="11" fill="${C.orangeLight}" opacity="0.8"/>
    <rect x="745" y="470" width="130" height="38" rx="12" fill="${C.dark}"/>
    <!-- verduras -->
    <path d="M745 760 C 760 690, 800 610, 850 600 C 905 595, 915 650, 890 690 C 920 700, 915 760, 870 770 Z" fill="${C.leafDark}"/>
    <path d="M760 765 C 775 700, 800 650, 835 640 C 870 640, 880 690, 850 720 C 860 740, 840 765, 810 770 Z" fill="${C.leaf}"/>
    <path d="M790 760 C 800 720, 815 690, 840 670" stroke="${C.leafDark}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <!-- manzana -->
    <path d="M445 585 C 400 560, 350 590, 352 655 C 354 715, 395 765, 445 752 C 495 765, 536 715, 538 655 C 540 590, 490 560, 445 585 Z" fill="${C.apple}"/>
    <path d="M395 615 C 380 640, 378 670, 388 700" stroke="${C.appleLight}" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M447 590 C 447 570, 455 552, 470 540" stroke="#6B3E1E" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M440 585 C 405 585, 385 560, 385 530 C 415 528, 440 550, 440 585 Z" fill="${C.leaf}"/>
  </g>
  <!-- lista con tres casillas marcadas -->
  <rect x="512" y="428" width="256" height="312" rx="34" fill="${C.dark}"/>
  <rect x="536" y="452" width="208" height="264" rx="20" fill="${C.cream}"/>
  ${[512, 582, 652]
    .map(
      (y) => `<path d="M562 ${y} L582 ${y + 20} L608 ${y - 14}" stroke="${C.check}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="634" y1="${y + 2}" x2="716" y2="${y + 2}" stroke="${C.check}" stroke-width="16" stroke-linecap="round"/>`,
    )
    .join('\n  ')}
  <!-- tejado -->
  <path d="M290 432 L630 205 L968 432" stroke="${C.dark}" stroke-width="78" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

const SPARKS = `<g stroke="${C.spark}" stroke-width="22" stroke-linecap="round">
  <line x1="908" y1="262" x2="952" y2="192"/><line x1="958" y1="306" x2="1030" y2="272"/><line x1="988" y1="368" x2="1044" y2="380"/>
</g>`;

/** Texto «Stocky» ajustado a un ancho, con la hoja colocada dentro de la «o». */
const WORDMARK = `<text id="word" x="640" y="1000" text-anchor="middle" font-family="StockyFont" font-size="330" fill="${C.cream}">Stocky</text>
<g id="leaf"><path d="M-42 38 C -52 -12, -14 -46, 44 -44 C 50 10, 10 46, -42 38 Z" fill="${C.green}"/>
<path d="M-30 28 C -6 4, 12 -14, 32 -32" stroke="${C.cream}" stroke-width="9" fill="none" stroke-linecap="round"/></g>`;

const SCRIPT = `<script>
document.fonts.ready.then(() => {
  const word = document.getElementById('word');
  if (!word) return;
  const target = 860;
  const size = 330 * target / word.getComputedTextLength();
  word.setAttribute('font-size', size.toFixed(1));
  // Centro del hueco de la «o»: mitad de su anchura y media altura de x sobre la línea base.
  const o = word.getExtentOfChar(2);
  const baseline = Number(word.getAttribute('y'));
  const leaf = document.getElementById('leaf');
  const s = (size * 0.3 / 92).toFixed(3);
  leaf.setAttribute('transform', 'translate(' + (o.x + o.width / 2) + ' ' + (baseline - size * 0.255) + ') scale(' + s + ')');
});
</script>`;

/** Centra el contenido (caja cx, cy) a una escala en el lienzo de 1024. */
const place = (body, scale, cx, cy) =>
  `<g transform="translate(${512 - cx * scale} ${512 - cy * scale}) scale(${scale})">${body}</g>`;

const HOUSE_CENTER = [628, 485];
const FULL_CENTER = [627, 627];

const svgs = {
  // Icono clásico y de tienda: fondo a sangre, logo completo con nombre.
  'icon.png': `<rect width="1024" height="1024" fill="url(#bg)"/>${place(SPARKS + HOUSE + WORDMARK, 0.86, ...FULL_CENTER)}`,
  // Icono adaptativo de Android: fondo y primer plano. Solo la casa: Android
  // ya escribe «Stocky» bajo el icono y el texto sería ilegible en el círculo.
  'android-icon-background.png': `<rect width="1024" height="1024" fill="url(#bg)"/>`,
  'android-icon-foreground.png': place(SPARKS + HOUSE, 0.8, ...HOUSE_CENTER),
  // Monocromo (temas de Android 13+): silueta de la casa.
  'android-icon-monochrome.png': place(
    `<path d="M345 455 L630 262 L905 455 L905 712 Q905 765 852 765 L398 765 Q345 765 345 712 Z" fill="#fff"/>
     <rect x="765" y="198" width="95" height="150" rx="16" fill="#fff"/>
     <path d="M290 432 L630 205 L968 432" stroke="#fff" stroke-width="78" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <rect x="536" y="452" width="208" height="264" rx="20" fill="#000"/>
     ${[512, 582, 652].map((y) => `<path d="M562 ${y} L582 ${y + 20} L608 ${y - 14}" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="634" y1="${y + 2}" x2="716" y2="${y + 2}" stroke="#fff" stroke-width="18" stroke-linecap="round"/>`).join('')}`,
    0.8,
    ...HOUSE_CENTER,
  ),
  // Pantalla de carga: insignia circular con la casa y el nombre. Android 12+
  // recorta esta imagen en un círculo (2/3 del lienzo), así que todo cabe dentro.
  'splash-icon.png': `<circle cx="512" cy="512" r="336" fill="url(#bg)"/>${place(SPARKS + HOUSE + WORDMARK, 0.5, 637, 625)}`,
};

const dir = mkdtempSync(join(tmpdir(), 'stocky-icons-'));
for (const [name, body] of Object.entries(svgs)) {
  const html = join(dir, `${name}.html`);
  const mono = name.includes('monochrome');
  writeFileSync(
    html,
    `<!doctype html><html><head><style>
@font-face { font-family: 'StockyFont'; src: url('${fontUrl}'); }
html,body { margin:0; background:transparent; }
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${DEFS}
${mono ? `<defs><mask id="m">${body}</mask></defs><rect width="1024" height="1024" fill="#fff" mask="url(#m)"/>` : body}
</svg>${SCRIPT}</body></html>`,
  );
  execFileSync(
    chrome,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--virtual-time-budget=3000',
      '--default-background-color=00000000',
      '--window-size=1024,1024',
      `--screenshot=${join(out, name)}`,
      `file://${html}`,
    ],
    { stdio: 'ignore' },
  );
  console.log('generado', name);
}
