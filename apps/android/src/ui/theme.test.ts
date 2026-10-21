import { THEME_COLORS } from '../domain/appearance';
import { getPalette } from './theme';

type Rgba = [number, number, number, number];

function parse(c: string): Rgba {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(c);
  if (!m) throw new Error(`color no reconocido: ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** Compone `top` (con su alfa, multiplicado por `alpha`) sobre un fondo opaco. */
function over(top: string, bottom: Rgba, alpha = 1): Rgba {
  const t = parse(top);
  const a = t[3] * alpha;
  return [0, 1, 2].map((i) => t[i]! * a + bottom[i]! * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: string, bg: Rgba): number {
  const a = luminance(over(fg, bg));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('contraste de las paletas (WCAG AA)', () => {
  for (const color of THEME_COLORS) {
    for (const dark of [false, true]) {
      it(`${color} ${dark ? 'oscuro' : 'claro'}`, () => {
        const p = getPalette(color, dark);
        const base = parse(p.background);
        // Peor caso: el centro de cada mancha de color, con y sin cristal encima.
        const grounds = [base, ...p.blobs.map((b) => over(b, base, p.blobOpacity))];
        const withGlass = grounds.flatMap((g) => [g, over(p.surface, g), over(p.surfaceAlt, g)]);
        for (const bg of withGlass) {
          expect(contrast(p.text, bg)).toBeGreaterThanOrEqual(7);
          expect(contrast(p.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p.primary, bg)).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(p.onPrimary, parse(p.primary))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
