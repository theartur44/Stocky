import { cleanText } from './text';
import { parseQuantity, type Unit } from './units';

/**
 * Interpreta una entrada rápida de la lista de la compra:
 *   «leche»            → 1 ud. de leche
 *   «2 leche»          → 2 ud.
 *   «leche 2»          → 2 ud.
 *   «500 g arroz»      → 500 g
 *   «arroz 1,5kg»      → 1,5 kg
 *   «3x yogur»         → 3 ud.
 * Si no reconoce la cantidad, todo el texto es el nombre y la cantidad es 1 ud.
 */
export interface QuickAdd {
  name: string;
  quantityMilli: number;
  unit: Unit;
}

const UNIT_WORDS: Record<string, Unit> = {
  g: 'g',
  gr: 'g',
  gramos: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  ml: 'ml',
  l: 'l',
  litro: 'l',
  litros: 'l',
  ud: 'unit',
  uds: 'unit',
  u: 'unit',
  x: 'unit',
  unidad: 'unit',
  unidades: 'unit',
};

const NUM = '(\\d{1,6}(?:[.,]\\d{1,3})?)';
const UNIT = `(${Object.keys(UNIT_WORDS).sort((a, b) => b.length - a.length).join('|')})?\\.?`;
const LEADING = new RegExp(`^${NUM}\\s*${UNIT}\\s+(.+)$`, 'i');
const TRAILING = new RegExp(`^(.+?)\\s+${NUM}\\s*${UNIT}$`, 'i');

export function parseQuickAdd(input: string): QuickAdd | null {
  const text = cleanText(input);
  if (!text) return null;
  const lead = LEADING.exec(text);
  const trail = lead ? null : TRAILING.exec(text);
  const [num, unitWord, name] = lead ? [lead[1], lead[2], lead[3]] : trail ? [trail[2], trail[3], trail[1]] : [null, null, text];
  if (num && name) {
    const quantityMilli = parseQuantity(num);
    if (quantityMilli !== null) {
      return { name: cleanText(name), quantityMilli, unit: unitWord ? UNIT_WORDS[unitWord.toLowerCase()]! : 'unit' };
    }
  }
  return { name: text, quantityMilli: 1000, unit: 'unit' };
}
