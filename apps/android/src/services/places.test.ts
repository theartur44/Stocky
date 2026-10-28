/// <reference types="node" />
import { migrate, MIGRATIONS } from '../data/migrations';
import { openTestDatabase } from '../data/testing/nodeConnection';
import { DEFAULT_PLACES } from '../domain/places';
import { lot, milk, setupServices } from '../test-utils/fixtures';

const [FRIDGE, FREEZER, PANTRY] = DEFAULT_PLACES.map((p) => p.id);

describe('sitios personalizables', () => {
  it('empieza con los cuatro sitios iniciales y los lotes van al primero de su tipo', async () => {
    const s = await setupServices();
    expect((await s.places.list()).map((p) => p.name)).toEqual(['Nevera', 'Congelador', 'Despensa', 'Otro sitio']);
    const { lot: l, product } = await s.inventory.addStock({ product: milk }, lot({ location: 'fridge' }));
    expect(l.placeId).toBe(FRIDGE);
    expect(product.defaultPlaceId).toBe(FRIDGE);
  });

  it('permite varias neveras y guardar en una concreta', async () => {
    const s = await setupServices();
    const garaje = await s.places.create({ name: '  Nevera   del garaje ', kind: 'fridge' });
    expect(garaje.name).toBe('Nevera del garaje');
    const { lot: l } = await s.inventory.addStock({ product: milk }, lot({ location: 'pantry', placeId: garaje.id }));
    // El tipo guardado es siempre el del sitio elegido.
    expect(l.placeId).toBe(garaje.id);
    expect(l.location).toBe('fridge');
    expect(await s.places.lotCounts()).toEqual({ [garaje.id]: 1 });
  });

  it('un sitio inexistente se sustituye por el primero del tipo', async () => {
    const s = await setupServices();
    const { lot: l } = await s.inventory.addStock({ product: milk }, lot({ location: 'freezer', placeId: 'no-existe' }));
    expect(l.placeId).toBe(FREEZER);
  });

  it('renombrar, cambiar el tipo y reordenar', async () => {
    const s = await setupServices();
    const { lot: l } = await s.inventory.addStock({ product: milk }, lot({ location: 'pantry' }));
    await s.places.update(PANTRY!, { name: 'Armario', kind: 'other' });
    const lots = await s.db.all<{ location: string }>('SELECT location FROM stock_lots WHERE id = ?', [l.id]);
    expect(lots[0]!.location).toBe('other');
    await s.places.move(PANTRY!, -1);
    expect((await s.places.list()).map((p) => p.name)).toEqual(['Nevera', 'Armario', 'Congelador', 'Otro sitio']);
    await expect(s.places.update(PANTRY!, { name: ' ', kind: 'other' })).rejects.toThrow();
    await expect(s.places.update(PANTRY!, { name: 'x'.repeat(41), kind: 'other' })).rejects.toThrow();
  });

  it('al borrar un sitio, lo que había pasa al sitio elegido', async () => {
    const s = await setupServices();
    const trastero = await s.places.create({ name: 'Trastero', kind: 'pantry' });
    const { lot: l } = await s.inventory.addStock({ product: { ...milk, defaultLocation: 'pantry', defaultPlaceId: trastero.id } }, lot({ placeId: trastero.id }));
    await s.places.remove(trastero.id, FRIDGE!);
    const row = await s.db.get<{ place_id: string; location: string }>('SELECT place_id, location FROM stock_lots WHERE id = ?', [l.id]);
    expect(row).toEqual({ place_id: FRIDGE, location: 'fridge' });
    expect((await s.places.list()).some((p) => p.id === trastero.id)).toBe(false);
  });

  it('no deja borrar el último sitio', async () => {
    const s = await setupServices();
    for (const p of DEFAULT_PLACES.slice(1)) await s.places.remove(p.id, FRIDGE!);
    await expect(s.places.remove(FRIDGE!, FRIDGE!)).rejects.toThrow();
    expect(await s.places.list()).toHaveLength(1);
  });

  it('borrar todos los datos deja los cuatro sitios iniciales', async () => {
    const s = await setupServices();
    await s.places.create({ name: 'Trastero', kind: 'pantry' });
    await s.privacy.deleteAllData();
    expect((await s.places.list()).map((p) => p.id)).toEqual(DEFAULT_PLACES.map((p) => p.id));
  });

  it('la migración asigna a los lotes existentes el sitio de su ubicación', async () => {
    const db = openTestDatabase();
    await migrate(db, MIGRATIONS.slice(0, 3));
    await db.run(
      `INSERT INTO products (id, name, name_key, category, default_unit, default_location, source, created_at, updated_at)
       VALUES ('p1', 'Guisantes', 'guisantes', 'frozen', 'g', 'freezer', 'manual', 'x', 'x')`,
    );
    await db.run(
      `INSERT INTO stock_lots (id, product_id, quantity_milli, unit, location, added_on, expiry_kind, created_at, updated_at)
       VALUES ('l1', 'p1', 1000, 'g', 'freezer', '2026-10-01', 'best_before', 'x', 'x')`,
    );
    await migrate(db);
    expect(await db.get('SELECT place_id FROM stock_lots')).toEqual({ place_id: FREEZER });
    expect(await db.get('SELECT default_place_id FROM products')).toEqual({ default_place_id: FREEZER });
  });
});
