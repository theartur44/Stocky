import { DEFAULT_PLACES } from '../domain/places';
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

type TriggerTables = readonly (readonly [table: string, entity: string])[];

const V3_TABLES: TriggerTables = [
  ['products', 'product'],
  ['shopping_lists', 'shopping_list'],
  ['shopping_items', 'shopping_item'],
  ['stock_lots', 'stock_lot'],
];
const V3_LOT_COLUMNS = ['product_id', 'unit', 'location', 'added_on', 'expiry_date', 'expiry_kind', 'expiry_estimated', 'lot_code', 'notes'];
const SYNC_TRIGGER_NAMES = (tables: TriggerTables) => [
  ...tables.flatMap(([table]) => [`sync_${table}_insert`, `sync_${table}_delete`, `sync_${table}_update`]),
  'sync_stock_lots_adjust',
];

const V4_TABLES: TriggerTables = [['places', 'place'], ...V3_TABLES];
const V4_LOT_COLUMNS = [...V3_LOT_COLUMNS, 'place_id'];

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
  {
    version: 2,
    description: 'Tamaño del envase en el catálogo (p. ej. 500 g, 1 l) para el escaneo rápido',
    statements: [
      `ALTER TABLE products ADD COLUMN pack_quantity_milli INTEGER
         CHECK (pack_quantity_milli IS NULL OR pack_quantity_milli > 0)`,
    ],
  },
  {
    version: 3,
    description: 'Sincronización opcional con un servidor: estado, cola de cambios y triggers',
    statements: [
      `CREATE TABLE sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
        applying INTEGER NOT NULL DEFAULT 0 CHECK (applying IN (0,1)),
        server_url TEXT,
        account_email TEXT,
        household_id TEXT,
        household_name TEXT,
        role TEXT,
        last_rev INTEGER NOT NULL DEFAULT 0 CHECK (last_rev >= 0),
        last_sync_at TEXT,
        last_error TEXT
      )`,
      `INSERT INTO sync_state (id) VALUES (1)`,
      // Cambios locales pendientes de enviar. La rellenan los triggers, así
      // ningún servicio tiene que acordarse de registrar sus cambios.
      `CREATE TABLE sync_outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL CHECK (entity IN ('product','stock_lot','shopping_list','shopping_item')),
        entity_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('upsert','delete','adjust')),
        delta_milli INTEGER
      )`,
      `CREATE INDEX idx_sync_outbox_entity ON sync_outbox(entity, entity_id)`,
      // Lote preparado para enviar, con su op_id fijo: si se corta la red se
      // reenvía idéntico y el servidor lo reconoce como duplicado.
      `CREATE TABLE sync_pending (
        op_id TEXT PRIMARY KEY NOT NULL,
        seq INTEGER NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('upsert','delete','adjust_quantity')),
        data TEXT,
        delta_milli INTEGER
      )`,
      ...syncTriggers(),
    ],
  },
  {
    version: 4,
    description: 'Sitios personalizables (varias neveras, trastero…) en lugar de cuatro ubicaciones fijas',
    statements: [
      // Los triggers de sincronización se rehacen para incluir los sitios.
      ...SYNC_TRIGGER_NAMES(V3_TABLES).map((name) => `DROP TRIGGER IF EXISTS ${name}`),
      // La cola admite la entidad nueva (SQLite no permite cambiar un CHECK: se rehace la tabla).
      `CREATE TABLE sync_outbox_v4 (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL CHECK (entity IN ('place','product','stock_lot','shopping_list','shopping_item')),
        entity_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('upsert','delete','adjust')),
        delta_milli INTEGER
      )`,
      `INSERT INTO sync_outbox_v4 (seq, entity, entity_id, kind, delta_milli) SELECT seq, entity, entity_id, kind, delta_milli FROM sync_outbox`,
      `DROP TABLE sync_outbox`,
      `ALTER TABLE sync_outbox_v4 RENAME TO sync_outbox`,
      `CREATE INDEX idx_sync_outbox_entity ON sync_outbox(entity, entity_id)`,
      `CREATE TABLE places (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
        kind TEXT NOT NULL CHECK (kind IN ('fridge','freezer','pantry','other')),
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `ALTER TABLE stock_lots ADD COLUMN place_id TEXT REFERENCES places(id) ON DELETE SET NULL`,
      `ALTER TABLE products ADD COLUMN default_place_id TEXT REFERENCES places(id) ON DELETE SET NULL`,
      `CREATE INDEX idx_stock_lots_place ON stock_lots(place_id)`,
      ...syncTriggers(V4_TABLES, V4_LOT_COLUMNS),
      // Se crean después de los triggers: si el móvil está conectado a un hogar, el cambio se comparte.
      ...DEFAULT_PLACES.map(
        (p, i) =>
          `INSERT INTO places (id, name, kind, position, created_at, updated_at)
           VALUES ('${p.id}', '${p.name}', '${p.kind}', ${i}, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      ),
      `UPDATE stock_lots SET place_id = (SELECT id FROM places WHERE places.kind = stock_lots.location ORDER BY position LIMIT 1)`,
      `UPDATE products SET default_place_id = (SELECT id FROM places WHERE places.kind = products.default_location ORDER BY position LIMIT 1)`,
    ],
  },
  {
    version: 5,
    description: 'Fecha de apertura de los lotes, días que dura abierto un producto e historial de consumos',
    statements: [
      `ALTER TABLE stock_lots ADD COLUMN opened_on TEXT CHECK (opened_on IS NULL OR length(opened_on) = 10)`,
      `ALTER TABLE products ADD COLUMN open_days INTEGER CHECK (open_days IS NULL OR open_days BETWEEN 1 AND 365)`,
      // Abrir un lote cambia sus datos (no solo la cantidad): se envía completo.
      'DROP TRIGGER IF EXISTS sync_stock_lots_adjust',
      'DROP TRIGGER IF EXISTS sync_stock_lots_update',
      ...lotTriggers([...V4_LOT_COLUMNS, 'opened_on']),
      // Historial de este móvil (no se sincroniza). Guarda una copia del nombre y del lote para
      // seguir mostrándolo, y poder deshacer, aunque el producto o el lote ya no existan.
      `CREATE TABLE stock_events (
        id TEXT PRIMARY KEY NOT NULL,
        batch_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('consumed','discarded')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
        unit TEXT NOT NULL CHECK (unit IN ('unit','g','kg','ml','l')),
        expired INTEGER NOT NULL DEFAULT 0 CHECK (expired IN (0,1)),
        lot_json TEXT NOT NULL,
        day TEXT NOT NULL,
        at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_stock_events_at ON stock_events(at)`,
      `CREATE INDEX idx_stock_events_batch ON stock_events(batch_id)`,
    ],
  },
];

/** Triggers que anotan en `sync_outbox` cada cambio local (solo con la sincronización activada). */
function syncTriggers(tables: TriggerTables = V3_TABLES, lotColumns: readonly string[] = V3_LOT_COLUMNS): string[] {
  const active = `(SELECT enabled = 1 AND applying = 0 FROM sync_state WHERE id = 1)`;
  const out: string[] = [];
  for (const [table, entity] of tables) {
    out.push(
      `CREATE TRIGGER sync_${table}_insert AFTER INSERT ON ${table} WHEN ${active}
       BEGIN INSERT INTO sync_outbox (entity, entity_id, kind) VALUES ('${entity}', NEW.id, 'upsert'); END`,
      `CREATE TRIGGER sync_${table}_delete AFTER DELETE ON ${table} WHEN ${active}
       BEGIN INSERT INTO sync_outbox (entity, entity_id, kind) VALUES ('${entity}', OLD.id, 'delete'); END`,
    );
  }
  for (const [table, entity] of tables.filter(([table]) => table !== 'stock_lots')) {
    out.push(
      `CREATE TRIGGER sync_${table}_update AFTER UPDATE ON ${table} WHEN ${active}
       BEGIN INSERT INTO sync_outbox (entity, entity_id, kind) VALUES ('${entity}', NEW.id, 'upsert'); END`,
    );
  }
  out.push(...lotTriggers(lotColumns));
  return out;
}

/**
 * Lotes: si solo cambia la cantidad se envía la diferencia (delta), que se
 * suma en el servidor sin pisar lo que haya consumido otro móvil a la vez.
 */
function lotTriggers(lotColumns: readonly string[]): string[] {
  const active = `(SELECT enabled = 1 AND applying = 0 FROM sync_state WHERE id = 1)`;
  const sameLot = lotColumns
    .map((c) => `NEW.${c} IS OLD.${c}`)
    .join(' AND ');
  return [
    `CREATE TRIGGER sync_stock_lots_adjust AFTER UPDATE ON stock_lots
       WHEN ${active} AND NEW.quantity_milli <> OLD.quantity_milli AND ${sameLot}
     BEGIN INSERT INTO sync_outbox (entity, entity_id, kind, delta_milli)
       VALUES ('stock_lot', NEW.id, 'adjust', NEW.quantity_milli - OLD.quantity_milli); END`,
    `CREATE TRIGGER sync_stock_lots_update AFTER UPDATE ON stock_lots
       WHEN ${active} AND NOT (${sameLot})
     BEGIN INSERT INTO sync_outbox (entity, entity_id, kind) VALUES ('stock_lot', NEW.id, 'upsert'); END`,
  ];
}

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
