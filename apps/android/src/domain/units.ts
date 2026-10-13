import { AppError } from './errors';

/**
 * Las cantidades se guardan como enteros en milésimas de la unidad
 * (`quantity_milli`): 1,5 kg → 1500 con unidad `kg`. Así se evitan los
 * errores de coma flotante al sumar y restar existencias.
 */
export const UNITS = ['unit', 'g', 'kg', 'ml', 'l'] as const;
export type Unit = (typeof UNITS)[number];

export type Dimension = 'count' | 'mass' | 'volume';

const UNIT_INFO: Record<Unit, { dimension: Dimension; factorToBase: number }> = {
  unit: { dimension: 'count', factorToBase: 1 },
  g: { dimension: 'mass', factorToBase: 1 },
  kg: { dimension: 'mass', factorToBase: 1000 },
  ml: { dimension: 'volume', factorToBase: 1 },
  l: { dimension: 'volume', factorToBase: 1000 },
};

/** Límite superior razonable para una cantidad doméstica (en milésimas). */
export const MAX_QUANTITY_MILLI = 1_000_000_000; // 1 000 000 de unidades

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

export function dimensionOf(unit: Unit): Dimension {
  return UNIT_INFO[unit].dimension;
}

export function areCompatible(a: Unit, b: Unit): boolean {
  return dimensionOf(a) === dimensionOf(b);
}

/**
 * Convierte una cantidad entre unidades de la misma dimensión.
 * Redondea al entero más próximo de milésimas.
 */
export function convertMilli(milli: number, from: Unit, to: Unit): number {
  if (!areCompatible(from, to)) {
    throw new AppError('incompatible_units', `Cannot convert ${from} to ${to}`);
  }
  if (from === to) return milli;
  return Math.round((milli * UNIT_INFO[from].factorToBase) / UNIT_INFO[to].factorToBase);
}

/**
 * Interpreta una cantidad escrita por el usuario. Acepta coma o punto
 * decimal y hasta tres decimales. Devuelve milésimas o `null` si no es válida.
 */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(trimmed)) return null;
  const [intPart, decPart = ''] = trimmed.split('.');
  const milli = Number(intPart) * 1000 + Number(decPart.padEnd(3, '0'));
  if (!Number.isSafeInteger(milli) || milli <= 0 || milli > MAX_QUANTITY_MILLI) return null;
  return milli;
}

/** Formatea milésimas como número legible en español (coma decimal). */
export function formatMilli(milli: number): string {
  const negative = milli < 0;
  const abs = Math.abs(Math.round(milli));
  const intPart = Math.floor(abs / 1000);
  const dec = String(abs % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${intPart}${dec ? `,${dec}` : ''}`;
}

export const UNIT_SYMBOL: Record<Unit, string> = {
  unit: 'ud.',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
};

export function formatQuantity(milli: number, unit: Unit): string {
  return `${formatMilli(milli)} ${UNIT_SYMBOL[unit]}`;
}

/** Suma dos cantidades expresándolas en la unidad `target`. */
export function addQuantities(
  a: { milli: number; unit: Unit },
  b: { milli: number; unit: Unit },
  target: Unit = a.unit,
): number {
  const sum = convertMilli(a.milli, a.unit, target) + convertMilli(b.milli, b.unit, target);
  if (sum > MAX_QUANTITY_MILLI) {
    throw new AppError('validation', 'Quantity exceeds maximum', { quantity: 'errors.quantityTooLarge' });
  }
  return sum;
}
