import { getSchemaVersion, LATEST_SCHEMA_VERSION, migrate, MIGRATIONS, type Migration } from './migrations';
import { openTestDatabase } from './testing/nodeConnection';

describe('migraciones de SQLite', () => {
  it('crea el esquema desde cero', async () => {
    const db = openTestDatabase();
    expect(await getSchemaVersion(db)).toBe(0);
    expect(await migrate(db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual(['products', 'settings', 'shopping_items', 'shopping_lists', 'stock_lots']);
  });

  it('es idempotente al ejecutarse varias veces', async () => {
    const db = openTestDatabase();
    await migrate(db);
    await migrate(db);
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
  });

  it('aplica solo las migraciones pendientes y conserva los datos', async () => {
    const db = openTestDatabase();
    await migrate(db);
    await db.run("INSERT INTO settings (key, value) VALUES ('warnDays', '3')");
    const next: Migration[] = [
      ...MIGRATIONS,
      { version: LATEST_SCHEMA_VERSION + 1, description: 'prueba', statements: ['ALTER TABLE settings ADD COLUMN x TEXT'] },
    ];
    expect(await migrate(db, next)).toBe(LATEST_SCHEMA_VERSION + 1);
    expect(await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'warnDays'")).toEqual({ value: '3' });
  });

  it('migra de la versión 1 a la 2 conservando los productos', async () => {
    const db = openTestDatabase();
    await migrate(db, MIGRATIONS.slice(0, 1));
    await db.run(
      `INSERT INTO products (id, name, name_key, category, default_unit, default_location, created_at, updated_at)
       VALUES ('p1', 'Arroz', 'arroz', 'grains_pasta', 'kg', 'pantry', 'x', 'x')`,
    );
    expect(await migrate(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(await db.get('SELECT name, pack_quantity_milli FROM products')).toEqual({ name: 'Arroz', pack_quantity_milli: null });
    await expect(db.run("UPDATE products SET pack_quantity_milli = 0 WHERE id = 'p1'")).rejects.toThrow(/CHECK/);
  });

  it('deshace por completo una migración que falla', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const broken: Migration[] = [
      ...MIGRATIONS,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        description: 'rota',
        statements: ['CREATE TABLE temporal (id TEXT)', 'ESTO NO ES SQL'],
      },
    ];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(await db.get("SELECT name FROM sqlite_master WHERE name = 'temporal'")).toBeNull();
  });

  it('se niega a usar una base de datos de una versión más nueva', async () => {
    const db = openTestDatabase();
    await db.exec('PRAGMA user_version = 999');
    await expect(migrate(db)).rejects.toThrow(/newer/);
  });

  it('activa claves foráneas y restricciones CHECK', async () => {
    const db = openTestDatabase();
    await migrate(db);
    expect(await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    await expect(
      db.run(
        `INSERT INTO stock_lots (id, product_id, quantity_milli, unit, location, added_on, expiry_kind, created_at, updated_at)
         VALUES ('l1', 'no-existe', 1000, 'g', 'pantry', '2026-10-13', 'use_by', 'x', 'x')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      db.run(
        `INSERT INTO products (id, name, name_key, category, default_unit, default_location, created_at, updated_at)
         VALUES ('p1', 'X', 'x', 'other', 'toneladas', 'pantry', 'x', 'x')`,
      ),
    ).rejects.toThrow(/CHECK/);
  });
});

describe('transacciones serializadas', () => {
  it('revierte todo si la función falla', async () => {
    const db = openTestDatabase();
    await migrate(db);
    await expect(
      db.transaction(async (tx) => {
        await tx.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
        throw new Error('fallo');
      }),
    ).rejects.toThrow('fallo');
    expect(await db.get("SELECT * FROM settings WHERE key = 'a'")).toBeNull();
  });

  it('no intercala consultas externas dentro de una transacción', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const order: string[] = [];
    const t = db.transaction(async (tx) => {
      order.push('tx-start');
      await tx.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
      await new Promise((r) => setTimeout(r, 10));
      order.push('tx-end');
    });
    const read = db.get('SELECT 1').then(() => order.push('read'));
    await Promise.all([t, read]);
    expect(order).toEqual(['tx-start', 'tx-end', 'read']);
  });

  it('la cola sigue funcionando tras un error', async () => {
    const db = openTestDatabase();
    await expect(db.exec('NO ES SQL')).rejects.toThrow();
    expect(await db.get<{ v: number }>('SELECT 1 AS v')).toEqual({ v: 1 });
  });
});
