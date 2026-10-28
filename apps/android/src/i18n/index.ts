import { en } from './en';
import { es, type Messages } from './es';
import { fr } from './fr';
import { pt } from './pt';

/**
 * i18n mínimo sin dependencias: español, inglés, francés y portugués (Brasil).
 * Cada idioma tiene exactamente las mismas claves que `es` (lo comprueba el tipo
 * `Messages`).
 */
export const LOCALES = { es, en, fr, pt } satisfies Record<string, Messages>;
export type Locale = keyof typeof LOCALES;
export const LOCALE_LIST = Object.keys(LOCALES) as Locale[];

/** Nombre de cada idioma en ese mismo idioma (para elegirlo sin entender el actual). */
export const LOCALE_NAMES: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  pt: 'Português (Brasil)',
};

/** Formato de fechas y orden alfabético de cada idioma. */
const REGION: Record<Locale, string> = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', pt: 'pt-BR' };
const AND: Record<Locale, string> = { es: 'y', en: 'and', fr: 'et', pt: 'e' };

let currentLocale: Locale = 'es';
let current: Messages = LOCALES.es;

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && Object.prototype.hasOwnProperty.call(LOCALES, v);

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  current = LOCALES[locale];
}

export const getLocale = (): Locale => currentLocale;

/** Código regional para `toLocaleDateString`, `localeCompare`, etc. */
export const dateLocale = (): string => REGION[currentLocale];

/** Idioma del móvil, si es uno de los disponibles (español si no). */
export function deviceLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    const base = tag.split(/[-_]/)[0];
    return isLocale(base) ? base : 'es';
  } catch {
    return 'es';
  }
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

/** Forma «una» del plural: en francés también el 0 («0 produit»). */
function isOne(count: number): boolean {
  return currentLocale === 'fr' ? Math.abs(count) < 2 : count === 1;
}

/**
 * Traduce una clave con interpolación. Si `params.count` existe y hay variantes
 * `_one`/`_other`, elige la forma plural. Una clave desconocida se devuelve tal
 * cual para que el fallo sea visible en desarrollo.
 */
export function t(key: string, params?: Params): string {
  if (params && typeof params.count === 'number') {
    const plural = lookup(`${key}_${isOne(params.count) ? 'one' : 'other'}`);
    if (plural) return interpolate(plural, params);
  }
  return interpolate(lookup(key) ?? key, params);
}

/** Lista legible: «a, b y c» (con la conjunción del idioma). */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${AND[currentLocale]} ${names[names.length - 1]}`;
}
