import type { SqlExecutor, SqlValue } from '../data/sql';
import { normalizeKey } from '../domain/text';
import { isSafeImageUrl } from '../domain/validation';

/**
 * Correspondencia entre las tablas locales y los registros que guarda el
 * servidor. El servidor no interpreta el contenido (lo guarda cifrado), salvo
 * `quantityMilli` de los lotes para aplicar los ajustes de cantidad.
 */
export type SyncEntity = 'product' | 'shopping_list' | 'stock_lot' | 'shopping_item';

type FieldKind = 'text' | 'text?' | 'int' | 'int?';
type Field = readonly [column: string, key: string, kind: FieldKind];

interface EntitySpec {
  table: string;
  fields: readonly Field[];
  /** La tabla tiene `name_key`, que se recalcula en local a partir de `name`. */
  nameKey: boolean;
}

const STAMPS: readonly Field[] = [
  ['created_at', 'createdAt', 'text'],
  ['updated_at', 'updatedAt', 'text'],
];

export const ENTITIES: Record<SyncEntity, EntitySpec> = {
  product: {
    table: 'products',
    nameKey: true,
    fields: [
      ['name', 'name', 'text'],
      ['brand', 'brand', 'text?'],
      ['barcode', 'barcode', 'text?'],
      ['category', 'category', 'text'],
      ['default_unit', 'defaultUnit', 'text'],
      ['default_location', 'defaultLocation', 'text'],
      ['low_stock_threshold_milli', 'lowStockThresholdMilli', 'int?'],
      ['pack_quantity_milli', 'packQuantityMilli', 'int?'],
      ['image_url', 'imageUrl', 'text?'],
      ['source', 'source', 'text'],
      ['notes', 'notes', 'text?'],
      ...STAMPS,
    ],
  },
  shopping_list: {
    table: 'shopping_lists',
    nameKey: false,
    fields: [['name', 'name', 'text'], ...STAMPS],
  },
  stock_lot: {
    table: 'stock_lots',
    nameKey: false,
    fields: [
      ['product_id', 'productId', 'text'],
      ['quantity_milli', 'quantityMilli', 'int'],
      ['unit', 'unit', 'text'],
      ['location', 'location', 'text'],
      ['added_on', 'addedOn', 'text'],
      ['expiry_date', 'expiryDate', 'text?'],
      ['expiry_kind', 'expiryKind', 'text'],
      ['expiry_estimated', 'expiryEstimated', 'int'],
      ['lot_code', 'lotCode', 'text?'],
      ['notes', 'notes', 'text?'],
      ...STAMPS,
    ],
  },
  shopping_item: {
    table: 'shopping_items',
    nameKey: true,
    fields: [
      ['list_id', 'listId', 'text'],
      ['product_id', 'productId', 'text?'],
      ['name', 'name', 'text'],
      ['quantity_milli', 'quantityMilli', 'int'],
      ['unit', 'unit', 'text'],
      ['checked', 'checked', 'int'],
      ['checked_at', 'checkedAt', 'text?'],
      ['transferred_at', 'transferredAt', 'text?'],
      ['transferred_lot_id', 'transferredLotId', 'text?'],
      ...STAMPS,
    ],
  },
};

/** Orden de inserción (padres antes que hijos); los borrados van al revés. */
export const UPSERT_ORDER: readonly SyncEntity[] = ['product', 'shopping_list', 'stock_lot', 'shopping_item'];

export const isSyncEntity = (v: unknown): v is SyncEntity => typeof v === 'string' && v in ENTITIES;

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
 * hogar) y lo convierte en valores de columna. Devuelve null si no es válido;
 * las restricciones CHECK de SQLite hacen el resto.
 */
export function parseRecord(entity: SyncEntity, data: unknown): Record<string, SqlValue> | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const src = data as Record<string, unknown>;
  const spec = ENTITIES[entity];
  const out: Record<string, SqlValue> = {};
  for (const [column, key, kind] of spec.fields) {
    const v = src[key] ?? null;
    const optional = kind.endsWith('?');
    if (v === null) {
      if (!optional) return null;
      out[column] = null;
    } else if (kind.startsWith('text')) {
      if (typeof v !== 'string' || v.length > 2000) return null;
      out[column] = v;
    } else {
      if (typeof v !== 'number' || !Number.isSafeInteger(v)) return null;
      out[column] = v;
    }
  }
  // Una imagen solo se muestra si su dirección es segura (https de Open Food Facts).
  if (entity === 'product' && out.image_url !== null && !isSafeImageUrl(String(out.image_url))) out.image_url = null;
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
