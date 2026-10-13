/**
 * Sesión de escaneo rápido (lógica pura).
 *
 * Pensada para dar de alta muchos productos seguidos: cada lectura añade una
 * línea al instante y la identificación del producto se resuelve en segundo
 * plano. Escanear de nuevo el mismo código suma una unidad. Nada se guarda en
 * el inventario hasta que el usuario confirma la sesión.
 */
import { addDays, type LocalDate } from './dates';
import type { ExpiryKind } from './expiry';
import type { Category, Location } from './models';
import { cleanText } from './text';
import type { Unit } from './units';

export type LineStatus =
  /** Buscando datos del producto. */
  | 'loading'
  /** Identificado (catálogo local o Open Food Facts). */
  | 'ready'
  /** No encontrado: necesita un nombre (se propone uno provisional). */
  | 'unknown'
  /** Error de red: se puede reintentar o escribir el nombre. */
  | 'error'
  /** Consulta externa no permitida: se escribe el nombre a mano. */
  | 'manual';

export interface ScanLine {
  /** Clave de la línea: el código de barras normalizado. */
  code: string;
  status: LineStatus;
  /** Producto ya existente en el catálogo local. */
  productId: string | null;
  name: string;
  /** El nombre lo ha escrito o confirmado el usuario. */
  nameEdited: boolean;
  brand: string | null;
  category: Category;
  unit: Unit;
  /** Contenido de un envase en milésimas de `unit` (null = se cuenta por unidades). */
  packQuantityMilli: number | null;
  imageUrl: string | null;
  source: 'manual' | 'openfoodfacts';
  /** Número de envases (cada lectura suma uno). */
  count: number;
  location: Location;
  expiryDate: LocalDate | null;
  expiryKind: ExpiryKind;
  expiryEstimated: boolean;
  /** Orden de llegada (las más recientes primero en la interfaz). */
  seq: number;
  errorCode?: string;
}

export interface ScanSession {
  lines: ScanLine[];
  seq: number;
}

export const emptySession: ScanSession = { lines: [], seq: 0 };

/** Ubicación habitual sugerida por categoría (el usuario puede cambiarla). */
export function suggestLocation(category: Category): Location {
  switch (category) {
    case 'dairy_eggs':
    case 'meat_fish':
    case 'fruit_veg':
      return 'fridge';
    case 'frozen':
      return 'freezer';
    default:
      return 'pantry';
  }
}

export function placeholderName(code: string): string {
  return `Producto …${code.slice(-4)}`;
}

export interface ResolvedInfo {
  productId?: string | null;
  name: string | null;
  brand: string | null;
  category: Category;
  unit: Unit;
  packQuantityMilli?: number | null;
  imageUrl?: string | null;
  source: 'manual' | 'openfoodfacts';
  /** Ubicación habitual del producto, si ya está en el catálogo. */
  location?: Location;
}

export type SessionAction =
  | { type: 'scanned'; code: string }
  | { type: 'resolved'; code: string; info: ResolvedInfo }
  | { type: 'failed'; code: string; status: 'unknown' | 'error' | 'manual'; errorCode?: string }
  | { type: 'retry'; code: string }
  | { type: 'setCount'; code: string; count: number }
  | { type: 'setName'; code: string; name: string }
  | { type: 'setLocation'; code: string; location: Location }
  | { type: 'setExpiry'; code: string; expiryDate: LocalDate | null; estimated?: boolean }
  | { type: 'setExpiryKind'; code: string; kind: ExpiryKind }
  | { type: 'remove'; code: string }
  | { type: 'clear' };

export const MAX_COUNT = 99;

function update(s: ScanSession, code: string, fn: (l: ScanLine) => ScanLine): ScanSession {
  return { ...s, lines: s.lines.map((l) => (l.code === code ? fn(l) : l)) };
}

export function sessionReducer(s: ScanSession, a: SessionAction): ScanSession {
  switch (a.type) {
    case 'scanned': {
      const existing = s.lines.find((l) => l.code === a.code);
      if (existing) {
        // Mismo código otra vez: un envase más, y pasa al principio de la lista.
        const seq = s.seq + 1;
        return update({ ...s, seq }, a.code, (l) => ({ ...l, count: Math.min(MAX_COUNT, l.count + 1), seq }));
      }
      const seq = s.seq + 1;
      const line: ScanLine = {
        code: a.code,
        status: 'loading',
        productId: null,
        name: placeholderName(a.code),
        nameEdited: false,
        brand: null,
        category: 'other',
        unit: 'unit',
        packQuantityMilli: null,
        imageUrl: null,
        source: 'manual',
        count: 1,
        location: 'pantry',
        expiryDate: null,
        expiryKind: 'use_by',
        expiryEstimated: false,
        seq,
      };
      return { lines: [...s.lines, line], seq };
    }
    case 'resolved':
      return update(s, a.code, (l) => ({
        ...l,
        status: 'ready',
        productId: a.info.productId ?? null,
        // No se pisa un nombre que el usuario ya haya escrito.
        name: l.nameEdited ? l.name : (a.info.name ?? a.info.brand ?? l.name),
        brand: a.info.brand,
        category: a.info.category,
        unit: a.info.unit,
        packQuantityMilli: a.info.unit === 'unit' ? null : (a.info.packQuantityMilli ?? null),
        imageUrl: a.info.imageUrl ?? null,
        source: a.info.source,
        location: a.info.location ?? suggestLocation(a.info.category),
        errorCode: undefined,
      }));
    case 'failed':
      return update(s, a.code, (l) => ({ ...l, status: a.status, errorCode: a.errorCode }));
    case 'retry':
      return update(s, a.code, (l) => ({ ...l, status: 'loading', errorCode: undefined }));
    case 'setCount':
      if (a.count <= 0) return { ...s, lines: s.lines.filter((l) => l.code !== a.code) };
      return update(s, a.code, (l) => ({ ...l, count: Math.min(MAX_COUNT, Math.floor(a.count)) }));
    case 'setName': {
      const name = cleanText(a.name).slice(0, 120);
      return update(s, a.code, (l) => ({ ...l, name, nameEdited: name.length > 0 }));
    }
    case 'setLocation':
      return update(s, a.code, (l) => ({ ...l, location: a.location }));
    case 'setExpiry':
      return update(s, a.code, (l) => ({
        ...l,
        expiryDate: a.expiryDate,
        expiryEstimated: a.expiryDate !== null && a.estimated === true,
      }));
    case 'setExpiryKind':
      return update(s, a.code, (l) => ({ ...l, expiryKind: a.kind }));
    case 'remove':
      return { ...s, lines: s.lines.filter((l) => l.code !== a.code) };
    case 'clear':
      return emptySession;
  }
}

/**
 * Cantidad total de una línea: envases × contenido si se conoce el envase
 * (6 × 1 l = 6 l); si no, número de unidades.
 */
export function lineQuantity(l: Pick<ScanLine, 'count' | 'unit' | 'packQuantityMilli'>): { quantityMilli: number; unit: Unit } {
  if (l.unit !== 'unit' && l.packQuantityMilli) return { quantityMilli: l.count * l.packQuantityMilli, unit: l.unit };
  return { quantityMilli: l.count * 1000, unit: 'unit' };
}

/** Líneas en orden de visualización: la última escaneada arriba. */
export function visibleLines(s: ScanSession): ScanLine[] {
  return [...s.lines].sort((a, b) => b.seq - a.seq);
}

export function sessionSummary(s: ScanSession) {
  return {
    products: s.lines.length,
    units: s.lines.reduce((n, l) => n + l.count, 0),
    loading: s.lines.filter((l) => l.status === 'loading').length,
    needsName: s.lines.filter((l) => l.status !== 'ready' && l.status !== 'loading' && !l.nameEdited).length,
  };
}

/** Atajos de fecha (días desde hoy). */
export const EXPIRY_SHORTCUTS = [
  { key: 'd3', days: 3 },
  { key: 'w1', days: 7 },
  { key: 'm1', days: 30 },
  { key: 'm3', days: 90 },
  { key: 'm6', days: 182 },
  { key: 'y1', days: 365 },
] as const;

export function shortcutDate(today: LocalDate, days: number): LocalDate {
  return addDays(today, days);
}
