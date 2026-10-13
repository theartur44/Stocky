import type { SqlDatabase } from './sql';

/**
 * Migraciones del esquema local, versionadas con `PRAGMA user_version`.
 *
 * Reglas:
 *  - Nunca modificar una migración ya publicada: añadir una nueva.
 *  - Cada migración se ejecuta en una transacción junto con el cambio de versión.
 *  - Las restricciones CHECK protegen la integridad aunque falle la validación de la app.
 */
export interface Migration {
  version: number;
  description: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Esquema inicial: catálogo, lotes, listas de la compra y ajustes',
    statements: [
      `CREATE TABLE products (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        name_key TEXT NOT NULL,
        brand TEXT CHECK (brand IS NULL OR length(brand) <= 80),
        barcode TEXT UNIQUE CHECK (barcode IS NULL OR length(barcode) BETWEEN 4 AND 48),
        category TEXT NOT NULL,
        default_unit TEXT NOT NULL CHECK (default_unit IN ('unit','g','kg','ml','l')),
        default_location TEXT NOT NULL CHECK (default_location IN ('fridge','freezer','pantry','other')),
        low_stock_threshold_milli INTEGER CHECK (low_stock_threshold_milli IS NULL OR low_stock_threshold_milli > 0),
        image_url TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','openfoodfacts')),
        notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_products_name_key ON products(name_key)`,
      `CREATE TABLE stock_lots (
        id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
        unit TEXT NOT NULL CHECK (unit IN ('unit','g','kg','ml','l')),
        location TEXT NOT NULL CHECK (location IN ('fridge','freezer','pantry','other')),
        added_on TEXT NOT NULL,
        expiry_date TEXT,
        expiry_kind TEXT NOT NULL CHECK (expiry_kind IN ('use_by','best_before')),
        expiry_estimated INTEGER NOT NULL DEFAULT 0 CHECK (expiry_estimated IN (0,1)),
        lot_code TEXT CHECK (lot_code IS NULL OR length(lot_code) <= 40),
        notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_stock_lots_product ON stock_lots(product_id)`,
      `CREATE INDEX idx_stock_lots_expiry ON stock_lots(expiry_date)`,
      `CREATE TABLE shopping_lists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE shopping_items (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        name_key TEXT NOT NULL,
        quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
        unit TEXT NOT NULL CHECK (unit IN ('unit','g','kg','ml','l')),
        checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0,1)),
        checked_at TEXT,
        transferred_at TEXT,
        transferred_lot_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (transferred_at IS NULL OR checked = 1)
      )`,
      `CREATE INDEX idx_shopping_items_list ON shopping_items(list_id)`,
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Aplica las migraciones pendientes. Si una falla, se deshace esa migración
 * completa y se propaga el error (la app muestra un error de almacenamiento
 * en lugar de trabajar con un esquema a medias).
 */
export async function migrate(db: SqlDatabase, migrations: Migration[] = MIGRATIONS): Promise<number> {
  const current = await getSchemaVersion(db);
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  if (current > latest) {
    // Base de datos creada por una versión más nueva de la app: no tocarla.
    throw new Error(`Database schema ${current} is newer than supported ${latest}`);
  }
  for (const m of migrations) {
    if (m.version <= current) continue;
    await db.transaction(async (tx) => {
      for (const sql of m.statements) await tx.exec(sql);
      // PRAGMA no admite parámetros; `version` es un entero controlado por el código.
      await tx.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
  }
  return getSchemaVersion(db);
}
