/**
 * Cliente mínimo de Open Food Facts (https://world.openfoodfacts.org).
 *
 * Privacidad: solo se envía el código de barras en la URL. No se envían
 * cookies, identificadores de usuario, inventario ni imágenes. El servidor
 * recibe, como en cualquier conexión, la IP del dispositivo y la cabecera
 * User-Agent. Solo debe llamarse tras el consentimiento del usuario.
 *
 * Licencias: la base de datos se publica bajo ODbL y las imágenes bajo
 * CC BY-SA. Ver docs/legal/licencias-de-terceros.md.
 */
import Constants from 'expo-constants';

import { AppError } from '../domain/errors';
import type { Category } from '../domain/models';
import type { Unit } from '../domain/units';
import { isSafeImageUrl, LIMITS } from '../domain/validation';

export const OFF_BASE_URL = 'https://world.openfoodfacts.org';
const FIELDS = [
  'code',
  'product_name',
  'product_name_es',
  'brands',
  'image_front_small_url',
  'categories_tags',
  'product_quantity',
  'product_quantity_unit',
].join(',');

export interface ExternalProduct {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  category: Category;
  suggestedUnit: Unit;
  /** Contenido de un envase en milésimas de `suggestedUnit` (null si no se conoce). */
  packQuantityMilli: number | null;
  source: 'openfoodfacts';
}

export type LookupResult = { status: 'found'; product: ExternalProduct } | { status: 'not_found' };

export interface LookupOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Identificación de la app exigida por Open Food Facts. */
  userAgent?: string;
}

function defaultUserAgent(): string {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  // Open Food Facts pide identificar la app; no se incluye ningún dato del usuario.
  return `Stoky/${version} (Android; app de inventario domestico)`;
}

/** Limpia texto externo: sin caracteres de control, espacios simples, longitud acotada. */
function cleanExternal(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max).trim() : v;
}

const CATEGORY_RULES: [RegExp, Category][] = [
  [/^en:(frozen-foods|frozen)/, 'frozen'],
  [/^en:(dairies|dairy|milks|cheeses|yogurts|eggs|butters)/, 'dairy_eggs'],
  [/^en:(meats|fishes|seafood|poultries|sausages|hams)/, 'meat_fish'],
  [/^en:(fruits|vegetables|fresh-|plant-based-foods-and-beverages$)/, 'fruit_veg'],
  [/^en:(breads|bakery|biscuits-and-cakes|pastries)/, 'bakery'],
  [/^en:(cereals-and-potatoes|pastas|rices|legumes|cereal-grains|flours)/, 'grains_pasta'],
  [/^en:(canned-foods|canned)/, 'canned'],
  [/^en:(beverages|waters|juices|sodas|coffees|teas)/, 'drinks'],
  [/^en:(snacks|sweet-snacks|salty-snacks|chocolates|confectioneries)/, 'snacks'],
  [/^en:(condiments|sauces|fats|vegetable-oils|olive-oils|spices|salts|vinegars)/, 'condiments'],
];

export function guessCategory(tags: unknown): Category {
  if (!Array.isArray(tags)) return 'other';
  // Las etiquetas van de lo general a lo específico: se busca desde la más específica.
  for (const tag of [...tags].reverse()) {
    if (typeof tag !== 'string') continue;
    for (const [re, cat] of CATEGORY_RULES) if (re.test(tag)) return cat;
  }
  return 'other';
}

/**
 * Unidad y contenido del envase a partir de `product_quantity` y
 * `product_quantity_unit`. Si no hay un dato fiable, se cuenta por unidades.
 */
export function parsePack(quantity: unknown, unit: unknown): { unit: Unit; packQuantityMilli: number | null } {
  const q = typeof quantity === 'number' ? quantity : typeof quantity === 'string' ? Number(quantity.replace(',', '.')) : NaN;
  const u = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  const factors: Record<string, [Unit, number]> = { g: ['g', 1], kg: ['kg', 1], ml: ['ml', 1], cl: ['ml', 10], l: ['l', 1] };
  const f = factors[u];
  if (!f || !Number.isFinite(q) || q <= 0 || q > 100_000) return { unit: 'unit', packQuantityMilli: null };
  const milli = Math.round(q * f[1] * 1000);
  return milli > 0 ? { unit: f[0], packQuantityMilli: milli } : { unit: 'unit', packQuantityMilli: null };
}

/** Convierte la respuesta JSON en un producto validado (o `not_found`). */
export function parseOffResponse(barcode: string, httpStatus: number, json: unknown): LookupResult {
  if (!json || typeof json !== 'object') throw new AppError('invalid_response', 'Unexpected payload');
  const body = json as { status?: unknown; product?: unknown };
  if (httpStatus === 404 || body.status === 0 || body.status === 'failure') return { status: 'not_found' };
  if (!body.product || typeof body.product !== 'object') {
    throw new AppError('invalid_response', 'Missing product');
  }
  const p = body.product as Record<string, unknown>;
  const name = cleanExternal(p.product_name_es, LIMITS.name) ?? cleanExternal(p.product_name, LIMITS.name);
  // `brands` puede contener varias marcas separadas por comas: se toma la primera.
  const brand = cleanExternal(typeof p.brands === 'string' ? p.brands.split(',')[0] : null, LIMITS.brand);
  const img = typeof p.image_front_small_url === 'string' ? p.image_front_small_url : null;
  if (!name && !brand) return { status: 'not_found' };
  const pack = parsePack(p.product_quantity, p.product_quantity_unit);
  return {
    status: 'found',
    product: {
      barcode,
      name,
      brand,
      imageUrl: img && isSafeImageUrl(img) ? img : null,
      category: guessCategory(p.categories_tags),
      suggestedUnit: pack.unit,
      packQuantityMilli: pack.packQuantityMilli,
      source: 'openfoodfacts',
    },
  };
}

/**
 * Consulta un código de barras. Lanza `AppError` con código
 * `network_offline`, `network_timeout`, `remote_error` o `invalid_response`.
 * El código debe estar validado antes (ver `isLookupableBarcode`).
 */
export async function lookupProduct(barcode: string, opts: LookupOptions = {}): Promise<LookupResult> {
  if (!/^\d{8,14}$/.test(barcode)) throw new AppError('validation', 'Invalid barcode');
  const fetchFn = opts.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  let res: Response;
  try {
    res = await fetchFn(`${OFF_BASE_URL}/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': opts.userAgent ?? defaultUserAgent() },
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new AppError('network_timeout', 'Lookup timed out');
    // `fetch` rechaza con TypeError cuando no hay red o falla DNS/TLS.
    throw new AppError('network_offline', 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== 200 && res.status !== 404) {
    throw new AppError('remote_error', `HTTP ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (res.status === 404) return { status: 'not_found' };
    throw new AppError('invalid_response', 'Invalid JSON');
  }
  return parseOffResponse(barcode, res.status, json);
}
