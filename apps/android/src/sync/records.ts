import type { SqlExecutor, SqlValue } from '../data/sql';
import { isStorableBarcode } from '../domain/barcode';
import { isValidLocalDate } from '../domain/dates';
import { isExpiryKind } from '../domain/expiry';
import { isCategory, isLocation } from '../domain/models';
import { PLACE_NAME_MAX } from '../domain/places';
import { normalizeKey } from '../domain/text';
import { isUnit, MAX_QUANTITY_MILLI } from '../domain/units';
import { isSafeImageUrl, LIMITS } from '../domain/validation';

/**
 * Correspondencia entre las tablas locales y los registros que guarda el
 * servidor. El servidor no interpreta el contenido (lo guarda cifrado), salvo
 * `quantityMilli` de los lotes para aplicar los ajustes de cantidad.
 */
export type SyncEntity = 'place' | 'product' | 'shopping_list' | 'stock_lot' | 'shopping_item';

type FieldKind = 'text' | 'text?' | 'int' | 'int?';
/**
 * Comprueba un valor no nulo recibido de otro móvil. Devuelve el valor que se
 * guarda (puede corregirlo) o `undefined` si el registro no es válido.
 */
type Rule = (v: string | number) => SqlValue | undefined;
type Field = readonly [column: string, key: string, kind: FieldKind, rule: Rule];

const text =
  (min: number, max: number): Rule =>
  (v) =>
    typeof v === 'string' && v.length >= min && v.length <= max ? v : undefined;
const int =
  (min: number, max: number): Rule =>
  (v) =>
    typeof v === 'number' && v >= min && v <= max ? v : undefined;
const when =
  (ok: (v: unknown) => boolean): Rule =>
  (v) =>
    ok(v) ? v : undefined;
/** Identificadores generados por la app (UUID). */
const id = when((v) => typeof v === 'string' && /^[0-9A-Za-z-]{1,64}$/.test(v));
const stamp = text(1, 40);
const quantity = int(1, MAX_QUANTITY_MILLI);
const flag = int(0, 1);
/** Una categoría o un tipo de sitio que esta versión no conoce (de una versión más nueva) se muestra como «otro». */
const category: Rule = (v) => (typeof v !== 'string' ? undefined : isCategory(v) ? v : 'other');
const location: Rule = (v) => (typeof v !== 'string' ? undefined : isLocation(v) ? v : 'other');
const unit = when(isUnit);
const date = when(isValidLocalDate);

interface EntitySpec {
  table: string;
  fields: readonly Field[];
  /** La tabla tiene `name_key`, que se recalcula en local a partir de `name`. */
  nameKey: boolean;
}

const STAMPS: readonly Field[] = [
  ['created_at', 'createdAt', 'text', stamp],
  ['updated_at', 'updatedAt', 'text', stamp],
];

export const ENTITIES: Record<SyncEntity, EntitySpec> = {
  place: {
    table: 'places',
    nameKey: false,
    fields: [
      ['name', 'name', 'text', text(1, PLACE_NAME_MAX)],
      ['kind', 'kind', 'text', location],
      ['position', 'position', 'int', int(0, 100_000)],
      ...STAMPS,
    ],
  },
  product: {
    table: 'products',
    nameKey: true,
    fields: [
      ['name', 'name', 'text', text(1, LIMITS.name)],
      ['brand', 'brand', 'text?', text(0, LIMITS.brand)],
      ['barcode', 'barcode', 'text?', when((v) => typeof v === 'string' && isStorableBarcode(v))],
      ['category', 'category', 'text', category],
      ['default_unit', 'defaultUnit', 'text', unit],
      ['default_location', 'defaultLocation', 'text', location],
      ['default_place_id', 'defaultPlaceId', 'text?', id],
      ['low_stock_threshold_milli', 'lowStockThresholdMilli', 'int?', quantity],
      ['pack_quantity_milli', 'packQuantityMilli', 'int?', quantity],
      ['open_days', 'openDays', 'int?', int(1, 365)],
      // Una imagen solo se muestra si su dirección es segura; si no, se descarta (el resto vale).
      ['image_url', 'imageUrl', 'text?', (v) => (typeof v === 'string' && isSafeImageUrl(v) ? v : null)],
      ['source', 'source', 'text', (v) => (v === 'openfoodfacts' ? v : 'manual')],
      ['notes', 'notes', 'text?', text(0, LIMITS.notes)],
      ...STAMPS,
    ],
  },
  shopping_list: {
    table: 'shopping_lists',
    nameKey: false,
    fields: [['name', 'name', 'text', text(1, LIMITS.listName)], ...STAMPS],
  },
  stock_lot: {
    table: 'stock_lots',
    nameKey: false,
    fields: [
      ['product_id', 'productId', 'text', id],
      ['quantity_milli', 'quantityMilli', 'int', quantity],
      ['unit', 'unit', 'text', unit],
      ['location', 'location', 'text', location],
      ['place_id', 'placeId', 'text?', id],
      ['added_on', 'addedOn', 'text', date],
      ['expiry_date', 'expiryDate', 'text?', date],
      ['expiry_kind', 'expiryKind', 'text', when(isExpiryKind)],
      ['expiry_estimated', 'expiryEstimated', 'int', flag],
      ['lot_code', 'lotCode', 'text?', text(0, LIMITS.lotCode)],
      ['notes', 'notes', 'text?', text(0, LIMITS.notes)],
      ['opened_on', 'openedOn', 'text?', date],
      ...STAMPS,
    ],
  },
  shopping_item: {
    table: 'shopping_items',
    nameKey: true,
    fields: [
      ['list_id', 'listId', 'text', id],
      ['product_id', 'productId', 'text?', id],
      ['name', 'name', 'text', text(1, LIMITS.name)],
      ['quantity_milli', 'quantityMilli', 'int', quantity],
      ['unit', 'unit', 'text', unit],
      ['checked', 'checked', 'int', flag],
      ['checked_at', 'checkedAt', 'text?', stamp],
      ['transferred_at', 'transferredAt', 'text?', stamp],
      ['transferred_lot_id', 'transferredLotId', 'text?', id],
      ...STAMPS,
    ],
  },
};

/** Orden de inserción (padres antes que hijos); los borrados van al revés. */
export const UPSERT_ORDER: readonly SyncEntity[] = ['place', 'product', 'shopping_list', 'stock_lot', 'shopping_item'];

/** Entidades que entiende un servidor antiguo (anterior a los sitios personalizables). */
export const BASE_ENTITIES: readonly SyncEntity[] = ['product', 'shopping_list', 'stock_lot', 'shopping_item'];

export const isSyncEntity = (v: unknown): v is SyncEntity => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ENTITIES, v);

/** Lee una fila local y la convierte en el registro que se envía al servidor. */
export async function readRecord(db: SqlExecutor, entity: SyncEntity, id: string): Promise<Record<string, unknown> | null> {
  const spec = ENTITIES[entity];
  const row = await db.get<Record<string, SqlValue>>(
    `SELECT ${spec.fields.map((f) => f[0]).join(', ')} FROM ${spec.table} WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [column, key] of spec.fields) out[key] = row[column] ?? null;
  return out;
}

/**
 * Valida un registro recibido del servidor (lo escribió otro dispositivo del
 * hogar, que puede tener una versión distinta de la app o estar manipulado) y
 * lo convierte en valores de columna. Devuelve null si no es válido. Cumple las
 * mismas reglas que las restricciones CHECK de SQLite, para que escribirlo no
 * falle, y además garantiza que la interfaz puede mostrarlo.
 */
export function parseRecord(entity: SyncEntity, data: unknown): Record<string, SqlValue> | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const src = data as Record<string, unknown>;
  const spec = ENTITIES[entity];
  const out: Record<string, SqlValue> = {};
  for (const [column, key, kind, rule] of spec.fields) {
    const optional = kind.endsWith('?');
    // Un campo opcional que no viene (registro de una versión anterior de la app)
    // no se toca: así un móvil sin actualizar no borra, p. ej., el sitio de un lote.
    if (optional && !(key in src)) continue;
    const v = src[key] ?? null;
    if (v === null) {
      if (!optional) return null;
      out[column] = null;
    } else {
      const typed = kind.startsWith('text') ? typeof v === 'string' : typeof v === 'number' && Number.isSafeInteger(v);
      const value = typed ? rule(v as string | number) : undefined;
      if (value === undefined) return null;
      out[column] = value;
    }
  }
  if (spec.nameKey) out.name_key = normalizeKey(String(out.name));
  return out;
}

/** Inserta o actualiza una fila con los valores ya validados. */
export async function writeRow(db: SqlExecutor, entity: SyncEntity, id: string, values: Record<string, SqlValue>): Promise<void> {
  const table = ENTITIES[entity].table;
  const columns = Object.keys(values);
  await db.run(
    `INSERT INTO ${table} (id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`,
    [id, ...columns.map((c) => values[c] ?? null)],
  );
}
