import { es, type Messages } from './es';

/**
 * i18n mínimo sin dependencias. Hoy solo existe español; la estructura permite
 * añadir `ca` y `en` registrándolos en `LOCALES` con el mismo tipo `Messages`.
 */
export const LOCALES = { es } satisfies Record<string, Messages>;
export type Locale = keyof typeof LOCALES;

let current: Messages = LOCALES.es;

export function setLocale(locale: Locale): void {
  current = LOCALES[locale];
}

type Params = Record<string, string | number>;

function lookup(path: string): string | undefined {
  let node: unknown = current;
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/**
 * Traduce una clave con interpolación. Si `params.count` existe y hay variantes
 * `_one`/`_other`, elige la forma plural. Una clave desconocida se devuelve tal
 * cual para que el fallo sea visible en desarrollo.
 */
export function t(key: string, params?: Params): string {
  if (params && typeof params.count === 'number') {
    const plural = lookup(`${key}_${params.count === 1 ? 'one' : 'other'}`);
    if (plural) return interpolate(plural, params);
  }
  return interpolate(lookup(key) ?? key, params);
}

/** Lista legible: «a, b y c». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
