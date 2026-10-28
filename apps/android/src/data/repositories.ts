/**
 * Repositorios: traducen entre filas SQL y modelos de dominio.
 * Reciben un `SqlExecutor` para poder usarse dentro o fuera de una transacción.
 * No contienen reglas de negocio (están en `services/`).
 */
import type { LocalDate } from '../domain/dates';
import type { ExpiryKind } from '../domain/expiry';
import type {
  Category,
  Location,
  Product,
  ProductSource,
  ShoppingItem,
  ShoppingList,
  StockLot,
  StockLotWithProduct,
} from '../domain/models';
import { DEFAULT_PLACES, type Place } from '../domain/places';
import type { LotInput, ProductInput } from '../domain/validation';
import { normalizeKey } from '../domain/text';
import type { Unit } from '../domain/units';
import type { SqlExecutor } from './sql';

// ---------------------------------------------------------------- sitios

interface PlaceRow {
  id: string;
  name: string;
  kind: string;
  position: number;
  created_at: string;
  updated_at: string;
}

const toPlace = (r: PlaceRow): Place => ({
  id: r.id,
  name: r.name,
  kind: r.kind as Location,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * Sitio y tipo con los que se guarda un lote o un producto. Un sitio que no
 * existe (p. ej. borrado en otro móvil) se sustituye por el primero del tipo;
 * el tipo guardado siempre es el del sitio.
 */
export async function resolvePlace(db: SqlExecutor, placeId: string | null | undefined, kind: Location): Promise<[Location, string | null]> {
  const exact = placeId ? await db.get<PlaceRow>('SELECT * FROM places WHERE id = ?', [placeId]) : null;
  const place =
    exact ??
    (await db.get<PlaceRow>('SELECT * FROM places WHERE kind = ? ORDER BY position, created_at LIMIT 1', [kind])) ??
    (await db.get<PlaceRow>('SELECT * FROM places ORDER BY position, created_at LIMIT 1'));
  return place ? [place.kind as Location, place.id] : [kind, null];
}

export const placeRepo = {
  async list(db: SqlExecutor): Promise<Place[]> {
    return (await db.all<PlaceRow>('SELECT * FROM places ORDER BY position, created_at')).map(toPlace);
  },

  async get(db: SqlExecutor, id: string): Promise<Place | null> {
    const r = await db.get<PlaceRow>('SELECT * FROM places WHERE id = ?', [id]);
    return r ? toPlace(r) : null;
  },

  async insert(db: SqlExecutor, id: string, p: { name: string; kind: Location }, position: number, now: string): Promise<Place> {
    await db.run('INSERT INTO places (id, name, kind, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      p.name,
      p.kind,
      position,
      now,
      now,
    ]);
    return (await placeRepo.get(db, id))!;
  },

  async update(db: SqlExecutor, id: string, p: { name: string; kind: Location }, now: string): Promise<number> {
    return (await db.run('UPDATE places SET name = ?, kind = ?, updated_at = ? WHERE id = ?', [p.name, p.kind, now, id])).changes;
  },

  async setPosition(db: SqlExecutor, id: string, position: number, now: string): Promise<void> {
    await db.run('UPDATE places SET position = ?, updated_at = ? WHERE id = ? AND position <> ?', [position, now, id, position]);
  },

  /** Cuántos lotes hay en cada sitio. */
  async lotCounts(db: SqlExecutor): Promise<Record<string, number>> {
    const rows = await db.all<{ place_id: string; n: number }>(
      'SELECT place_id, COUNT(*) AS n FROM stock_lots WHERE place_id IS NOT NULL GROUP BY place_id',
    );
    return Object.fromEntries(rows.map((r) => [r.place_id, r.n]));
  },

  async delete(db: SqlExecutor, id: string): Promise<number> {
    return (await db.run('DELETE FROM places WHERE id = ?', [id])).changes;
  },
};

// ---------------------------------------------------------------- productos

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  category: string;
  default_unit: string;
  default_location: string;
  default_place_id: string | null;
  low_stock_threshold_milli: number | null;
  pack_quantity_milli: number | null;
  image_url: string | null;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    category: r.category as Category,
    defaultUnit: r.default_unit as Unit,
    defaultLocation: r.default_location as Location,
    defaultPlaceId: r.default_place_id ?? null,
    lowStockThresholdMilli: r.low_stock_threshold_milli,
    packQuantityMilli: r.pack_quantity_milli ?? null,
    imageUrl: r.image_url,
    source: r.source as ProductSource,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const productRepo = {
  async insert(db: SqlExecutor, id: string, p: Required<ProductInput>, now: string): Promise<Product> {
    await db.run(
      `INSERT INTO products (id, name, name_key, brand, barcode, category, default_unit, default_location, default_place_id,
         low_stock_threshold_milli, pack_quantity_milli, image_url, source, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        p.name,
        normalizeKey(p.name),
        p.brand,
        p.barcode,
        p.category,
        p.defaultUnit,
        ...(await resolvePlace(db, p.defaultPlaceId, p.defaultLocation)),
        p.lowStockThresholdMilli,
        p.packQuantityMilli,
        p.imageUrl,
        p.source,
        p.notes,
        now,
        now,
      ],
    );
    return (await productRepo.get(db, id))!;
  },

  async update(db: SqlExecutor, id: string, p: Required<ProductInput>, now: string): Promise<number> {
    const r = await db.run(
      `UPDATE products SET name = ?, name_key = ?, brand = ?, barcode = ?, category = ?, default_unit = ?,
         default_location = ?, default_place_id = ?, low_stock_threshold_milli = ?, pack_quantity_milli = ?, image_url = ?,
         source = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        p.name,
        normalizeKey(p.name),
        p.brand,
        p.barcode,
        p.category,
        p.defaultUnit,
        ...(await resolvePlace(db, p.defaultPlaceId, p.defaultLocation)),
        p.lowStockThresholdMilli,
        p.packQuantityMilli,
        p.imageUrl,
        p.source,
        p.notes,
        now,
        id,
      ],
    );
    return r.changes;
  },

  async get(db: SqlExecutor, id: string): Promise<Product | null> {
    const r = await db.get<ProductRow>('SELECT * FROM products WHERE id = ?', [id]);
    return r ? toProduct(r) : null;
  },

  async getByBarcode(db: SqlExecutor, barcode: string): Promise<Product | null> {
    const r = await db.get<ProductRow>('SELECT * FROM products WHERE barcode = ?', [barcode]);
    return r ? toProduct(r) : null;
  },

  async findByNameKey(db: SqlExecutor, nameKey: string): Promise<Product | null> {
    const r = await db.get<ProductRow>('SELECT * FROM products WHERE name_key = ? ORDER BY created_at LIMIT 1', [
      nameKey,
    ]);
    return r ? toProduct(r) : null;
  },

  async list(db: SqlExecutor): Promise<Product[]> {
    const rows = await db.all<ProductRow>('SELECT * FROM products ORDER BY name_key');
    return rows.map(toProduct);
  },

  async delete(db: SqlExecutor, id: string): Promise<number> {
    return (await db.run('DELETE FROM products WHERE id = ?', [id])).changes;
  },
};

// ---------------------------------------------------------------- lotes

interface LotRow {
  id: string;
  product_id: string;
  quantity_milli: number;
  unit: string;
  location: string;
  place_id: string | null;
  added_on: string;
  expiry_date: string | null;
  expiry_kind: string;
  expiry_estimated: number;
  lot_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LotWithProductRow extends LotRow {
  p_name: string;
  p_brand: string | null;
  p_category: string;
}

function toLot(r: LotRow): StockLot {
  return {
    id: r.id,
    productId: r.product_id,
    quantityMilli: r.quantity_milli,
    unit: r.unit as Unit,
    location: r.location as Location,
    placeId: r.place_id ?? null,
    addedOn: r.added_on as LocalDate,
    expiryDate: r.expiry_date as LocalDate | null,
    expiryKind: r.expiry_kind as ExpiryKind,
    expiryEstimated: r.expiry_estimated === 1,
    lotCode: r.lot_code,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Orden FEFO: primero lo que caduca antes; los lotes sin fecha, al final. */
const LOT_ORDER = 'ORDER BY (l.expiry_date IS NULL), l.expiry_date, l.created_at';

export const lotRepo = {
  async insert(db: SqlExecutor, id: string, productId: string, l: Required<LotInput>, now: string): Promise<StockLot> {
    await db.run(
      `INSERT INTO stock_lots (id, product_id, quantity_milli, unit, location, place_id, added_on, expiry_date, expiry_kind,
         expiry_estimated, lot_code, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        productId,
        l.quantityMilli,
        l.unit,
        ...(await resolvePlace(db, l.placeId, l.location)),
        l.addedOn,
        l.expiryDate,
        l.expiryKind,
        l.expiryEstimated ? 1 : 0,
        l.lotCode,
        l.notes,
        now,
        now,
      ],
    );
    return (await lotRepo.get(db, id))!;
  },

  async update(db: SqlExecutor, id: string, l: Required<LotInput>, now: string): Promise<number> {
    const r = await db.run(
      `UPDATE stock_lots SET quantity_milli = ?, unit = ?, location = ?, place_id = ?, added_on = ?, expiry_date = ?,
         expiry_kind = ?, expiry_estimated = ?, lot_code = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        l.quantityMilli,
        l.unit,
        ...(await resolvePlace(db, l.placeId, l.location)),
        l.addedOn,
        l.expiryDate,
        l.expiryKind,
        l.expiryEstimated ? 1 : 0,
        l.lotCode,
        l.notes,
        now,
        id,
      ],
    );
    return r.changes;
  },

  /**
   * Actualiza la cantidad solo si no ha cambiado desde que se leyó
   * (control optimista). Devuelve las filas afectadas (0 = conflicto).
   */
  async setQuantity(db: SqlExecutor, id: string, expected: number, next: number, now: string): Promise<number> {
    const r = await db.run(
      'UPDATE stock_lots SET quantity_milli = ?, updated_at = ? WHERE id = ? AND quantity_milli = ?',
      [next, now, id, expected],
    );
    return r.changes;
  },

  async get(db: SqlExecutor, id: string): Promise<StockLot | null> {
    const r = await db.get<LotRow>('SELECT * FROM stock_lots WHERE id = ?', [id]);
    return r ? toLot(r) : null;
  },

  async listByProduct(db: SqlExecutor, productId: string): Promise<StockLot[]> {
    const rows = await db.all<LotRow>(`SELECT l.* FROM stock_lots l WHERE l.product_id = ? ${LOT_ORDER}`, [productId]);
    return rows.map(toLot);
  },

  async listAll(db: SqlExecutor): Promise<StockLot[]> {
    const rows = await db.all<LotRow>(`SELECT l.* FROM stock_lots l ${LOT_ORDER}`);
    return rows.map(toLot);
  },

  async listWithExpiryUntil(db: SqlExecutor, until: LocalDate): Promise<StockLotWithProduct[]> {
    const rows = await db.all<LotWithProductRow>(
      `SELECT l.*, p.name AS p_name, p.brand AS p_brand, p.category AS p_category
       FROM stock_lots l JOIN products p ON p.id = l.product_id
       WHERE l.expiry_date IS NOT NULL AND l.expiry_date <= ? ${LOT_ORDER}`,
      [until],
    );
    return rows.map((r) => ({
      ...toLot(r),
      product: { id: r.product_id, name: r.p_name, brand: r.p_brand, category: r.p_category as Category },
    }));
  },

  async delete(db: SqlExecutor, id: string): Promise<number> {
    return (await db.run('DELETE FROM stock_lots WHERE id = ?', [id])).changes;
  },
};

// ---------------------------------------------------------------- compra

interface ListRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  list_id: string;
  product_id: string | null;
  name: string;
  quantity_milli: number;
  unit: string;
  checked: number;
  checked_at: string | null;
  transferred_at: string | null;
  transferred_lot_id: string | null;
  created_at: string;
  updated_at: string;
}

const toList = (r: ListRow): ShoppingList => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function toItem(r: ItemRow): ShoppingItem {
  return {
    id: r.id,
    listId: r.list_id,
    productId: r.product_id,
    name: r.name,
    quantityMilli: r.quantity_milli,
    unit: r.unit as Unit,
    checked: r.checked === 1,
    checkedAt: r.checked_at,
    transferredAt: r.transferred_at,
    transferredLotId: r.transferred_lot_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const shoppingRepo = {
  async insertList(db: SqlExecutor, id: string, name: string, now: string): Promise<ShoppingList> {
    await db.run('INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      id,
      name,
      now,
      now,
    ]);
    return { id, name, createdAt: now, updatedAt: now };
  },

  async renameList(db: SqlExecutor, id: string, name: string, now: string): Promise<number> {
    return (await db.run('UPDATE shopping_lists SET name = ?, updated_at = ? WHERE id = ?', [name, now, id])).changes;
  },

  async getList(db: SqlExecutor, id: string): Promise<ShoppingList | null> {
    const r = await db.get<ListRow>('SELECT * FROM shopping_lists WHERE id = ?', [id]);
    return r ? toList(r) : null;
  },

  async lists(db: SqlExecutor): Promise<ShoppingList[]> {
    return (await db.all<ListRow>('SELECT * FROM shopping_lists ORDER BY created_at')).map(toList);
  },

  async deleteList(db: SqlExecutor, id: string): Promise<number> {
    return (await db.run('DELETE FROM shopping_lists WHERE id = ?', [id])).changes;
  },

  async insertItem(
    db: SqlExecutor,
    item: Pick<ShoppingItem, 'id' | 'listId' | 'productId' | 'name' | 'quantityMilli' | 'unit'>,
    now: string,
  ): Promise<void> {
    await db.run(
      `INSERT INTO shopping_items (id, list_id, product_id, name, name_key, quantity_milli, unit, checked,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [item.id, item.listId, item.productId, item.name, normalizeKey(item.name), item.quantityMilli, item.unit, now, now],
    );
  },

  async getItem(db: SqlExecutor, id: string): Promise<ShoppingItem | null> {
    const r = await db.get<ItemRow>('SELECT * FROM shopping_items WHERE id = ?', [id]);
    return r ? toItem(r) : null;
  },

  async items(db: SqlExecutor, listId: string): Promise<ShoppingItem[]> {
    const rows = await db.all<ItemRow>(
      `SELECT * FROM shopping_items WHERE list_id = ?
       ORDER BY (transferred_at IS NOT NULL), checked, created_at`,
      [listId],
    );
    return rows.map(toItem);
  },

  /** Artículos pendientes (sin marcar ni incorporar) que podrían ser duplicados. */
  async pendingMatches(
    db: SqlExecutor,
    listId: string,
    productId: string | null,
    nameKey: string,
  ): Promise<ShoppingItem[]> {
    const rows = await db.all<ItemRow>(
      `SELECT * FROM shopping_items
       WHERE list_id = ? AND checked = 0 AND transferred_at IS NULL
         AND ((? IS NOT NULL AND product_id = ?) OR name_key = ?)
       ORDER BY created_at`,
      [listId, productId, productId, nameKey],
    );
    return rows.map(toItem);
  },

  async setItemQuantity(db: SqlExecutor, id: string, quantityMilli: number, unit: Unit, now: string): Promise<number> {
    return (
      await db.run(
        'UPDATE shopping_items SET quantity_milli = ?, unit = ?, updated_at = ? WHERE id = ? AND transferred_at IS NULL',
        [quantityMilli, unit, now, id],
      )
    ).changes;
  },

  async updateItem(
    db: SqlExecutor,
    id: string,
    data: { name: string; quantityMilli: number; unit: Unit },
    now: string,
  ): Promise<number> {
    return (
      await db.run(
        `UPDATE shopping_items SET name = ?, name_key = ?, quantity_milli = ?, unit = ?, updated_at = ?
         WHERE id = ? AND transferred_at IS NULL`,
        [data.name, normalizeKey(data.name), data.quantityMilli, data.unit, now, id],
      )
    ).changes;
  },

  async setChecked(db: SqlExecutor, id: string, checked: boolean, now: string): Promise<number> {
    return (
      await db.run(
        `UPDATE shopping_items SET checked = ?, checked_at = ?, updated_at = ?
         WHERE id = ? AND transferred_at IS NULL`,
        [checked ? 1 : 0, checked ? now : null, now, id],
      )
    ).changes;
  },

  async setProduct(db: SqlExecutor, id: string, productId: string, now: string): Promise<number> {
    return (
      await db.run('UPDATE shopping_items SET product_id = ?, updated_at = ? WHERE id = ?', [productId, now, id])
    ).changes;
  },

  /** Marca como incorporado solo si aún no lo estaba (idempotencia). */
  async markTransferred(db: SqlExecutor, id: string, lotId: string, now: string): Promise<number> {
    return (
      await db.run(
        `UPDATE shopping_items SET transferred_at = ?, transferred_lot_id = ?, updated_at = ?
         WHERE id = ? AND checked = 1 AND transferred_at IS NULL`,
        [now, lotId, now, id],
      )
    ).changes;
  },

  async deleteItem(db: SqlExecutor, id: string): Promise<number> {
    return (await db.run('DELETE FROM shopping_items WHERE id = ?', [id])).changes;
  },

  async deleteTransferred(db: SqlExecutor, listId: string): Promise<number> {
    return (await db.run('DELETE FROM shopping_items WHERE list_id = ? AND transferred_at IS NOT NULL', [listId]))
      .changes;
  },
};

// ---------------------------------------------------------------- ajustes

export const settingsRepo = {
  async getAll(db: SqlExecutor): Promise<Record<string, string>> {
    const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  async set(db: SqlExecutor, key: string, value: string): Promise<void> {
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  },
};

/** Borra todos los datos de usuario (no el esquema). */
export async function deleteAllUserData(db: SqlExecutor): Promise<void> {
  // Primero se desconecta la sincronización: borrar los datos de este móvil no
  // debe borrarlos también del hogar compartido en el servidor.
  await db.exec(
    `UPDATE sync_state SET enabled = 0, applying = 0, server_url = NULL, account_email = NULL, household_id = NULL,
       household_name = NULL, role = NULL, last_rev = 0, last_sync_at = NULL, last_error = NULL WHERE id = 1;
     DELETE FROM sync_outbox;
     DELETE FROM sync_pending;
     DELETE FROM shopping_items;
     DELETE FROM shopping_lists;
     DELETE FROM stock_lots;
     DELETE FROM products;
     DELETE FROM places;
     DELETE FROM settings;`,
  );
  // Vuelven los sitios iniciales.
  for (const [i, p] of DEFAULT_PLACES.entries()) {
    await db.run('INSERT INTO places (id, name, kind, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      p.id,
      p.name,
      p.kind,
      i,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
  }
}
