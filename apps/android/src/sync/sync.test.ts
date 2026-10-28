/// <reference types="node" />
import { randomUUID } from 'node:crypto';

import { lot, milk, setupServices } from '../test-utils/fixtures';
import { createSyncEngine } from './engine';
import { createFakeServer } from './fakeServer';
import { BASE_ENTITIES } from './records';

type Server = ReturnType<typeof createFakeServer>;

async function device(server: Server) {
  const s = await setupServices();
  const engine = createSyncEngine({ db: s.db, transport: server.transport, newId: randomUUID });
  const join = async () => {
    await engine.enable({ serverUrl: 'https://stocky.test', email: 'a@b.es', householdId: 'h1', householdName: 'Casa', role: 'owner' });
    return engine.sync({ initial: true });
  };
  return { ...s, engine, join };
}

async function snapshot(d: Awaited<ReturnType<typeof device>>) {
  const products = await d.db.all<{ id: string; name: string; barcode: string | null }>('SELECT id, name, barcode FROM products ORDER BY id');
  const lots = await d.db.all<{ id: string; product_id: string; quantity_milli: number }>(
    'SELECT id, product_id, quantity_milli FROM stock_lots ORDER BY id',
  );
  const lists = await d.db.all<{ id: string; name: string }>('SELECT id, name FROM shopping_lists ORDER BY id');
  const items = await d.db.all<{ id: string; list_id: string; name: string }>('SELECT id, list_id, name FROM shopping_items ORDER BY id');
  return { products, lots, lists, items };
}

const EAN = '4006381333931';

describe('sincronización entre dos móviles del mismo hogar', () => {
  it('sin activarla no se anota nada en la cola', async () => {
    const server = createFakeServer();
    const a = await device(server);
    await a.inventory.addStock({ product: milk }, lot());
    expect(await a.engine.pendingCount()).toBe(0);
  });

  it('comparte el inventario y fusiona la lista de la compra por defecto', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    const listA = await a.shopping.ensureDefaultList();
    await a.shopping.addItem(listA.id, { name: 'Pan', quantityMilli: 1000, unit: 'unit' });
    await a.inventory.addStock({ product: milk }, lot({ quantityMilli: 2000 }));
    const listB = await b.shopping.ensureDefaultList();
    await b.shopping.addItem(listB.id, { name: 'Huevos', quantityMilli: 12000, unit: 'unit' });

    await a.join();
    await b.join();
    await a.engine.sync();
    await b.engine.sync();

    const sa = await snapshot(a);
    const sb = await snapshot(b);
    expect(sa).toEqual(sb);
    expect(sa.products.map((p) => p.name)).toEqual(['Leche entera']);
    expect(sa.lots[0]!.quantity_milli).toBe(2000);
    // Una sola lista con los artículos de los dos móviles.
    expect(sa.lists).toHaveLength(1);
    expect(sa.items.map((i) => i.name).sort()).toEqual(['Huevos', 'Pan']);
  });

  it('no pierde consumos hechos a la vez en dos móviles (se envían como diferencias)', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    const { product } = await a.inventory.addStock({ product: milk }, lot({ quantityMilli: 1000 }));
    await a.join();
    await b.join();

    await a.inventory.consumeProduct(product.id, 200, 'l');
    await b.inventory.consumeProduct(product.id, 300, 'l');
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();

    expect((await snapshot(a)).lots[0]!.quantity_milli).toBe(500);
    expect((await snapshot(b)).lots[0]!.quantity_milli).toBe(500);
  });

  it('propaga borrados y un lote gastado del todo desaparece en los dos', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    const { product } = await a.inventory.addStock({ product: milk }, lot({ quantityMilli: 1000 }));
    await a.join();
    await b.join();

    await b.inventory.consumeProduct(product.id, 1000, 'l');
    await b.engine.sync();
    await a.engine.sync();
    expect((await snapshot(a)).lots).toEqual([]);

    await a.inventory.deleteProduct(product.id);
    await a.engine.sync();
    await b.engine.sync();
    expect((await snapshot(b)).products).toEqual([]);
  });

  it('si se pierde la respuesta del servidor, reenviar no duplica el consumo', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const { product } = await a.inventory.addStock({ product: milk }, lot({ quantityMilli: 1000 }));
    await a.join();

    await a.inventory.consumeProduct(product.id, 100, 'l');
    server.dropNextResponse();
    await expect(a.engine.sync()).rejects.toThrow();
    await a.inventory.consumeProduct(product.id, 100, 'l');
    await a.engine.sync();

    const remote = [...server.records.values()].find((r) => r.entity === 'stock_lot')!;
    expect(remote.data!.quantityMilli).toBe(800);
    expect((await snapshot(a)).lots[0]!.quantity_milli).toBe(800);
  });

  it('el mismo producto escaneado en dos móviles se fusiona sin perder lotes', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    await a.inventory.addStock({ product: { ...milk, barcode: EAN } }, lot({ quantityMilli: 1000 }));
    await b.inventory.addStock({ product: { ...milk, barcode: EAN } }, lot({ quantityMilli: 2000 }));
    await a.join();
    await b.join();
    await a.engine.sync();
    await b.engine.sync();
    // Cada móvil puede necesitar una pasada más para recibir la fusión del otro.
    await a.engine.sync();

    const sa = await snapshot(a);
    expect(sa).toEqual(await snapshot(b));
    expect(sa.products).toHaveLength(1);
    expect(sa.products[0]!.barcode).toBe(EAN);
    expect(sa.lots.map((l) => l.quantity_milli).sort()).toEqual([1000, 2000]);
    expect(sa.lots.every((l) => l.product_id === sa.products[0]!.id)).toBe(true);
  });

  it('un cambio local sin enviar no se pisa con lo que llega del servidor', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    const { product } = await a.inventory.addStock({ product: milk }, lot());
    await a.join();
    await b.join();

    await b.inventory.updateProduct(product.id, { ...milk, name: 'Leche de B' });
    await b.engine.sync();
    await a.inventory.updateProduct(product.id, { ...milk, name: 'Leche de A' });
    await a.engine.sync();
    await b.engine.sync();

    expect((await snapshot(a)).products[0]!.name).toBe('Leche de A');
    expect((await snapshot(b)).products[0]!.name).toBe('Leche de A');
  });

  it('borrar los datos del móvil no borra los del hogar', async () => {
    const server = createFakeServer();
    const a = await device(server);
    await a.inventory.addStock({ product: milk }, lot());
    await a.join();
    await a.privacy.deleteAllData();
    expect(await a.engine.pendingCount()).toBe(0);
    expect([...server.records.values()].filter((r) => !r.deleted && r.entity !== 'place')).toHaveLength(2);
  });

  it('comparte los sitios personalizados y en qué sitio está cada lote', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    await a.join();
    await b.join();
    const garaje = await a.places.create({ name: 'Nevera garaje', kind: 'fridge' });
    await a.inventory.addStock({ product: milk }, lot({ placeId: garaje.id }));
    await a.engine.sync();
    await b.engine.sync();
    expect((await b.places.list()).map((p) => p.name)).toContain('Nevera garaje');
    expect(await b.db.get('SELECT place_id FROM stock_lots')).toEqual({ place_id: garaje.id });
  });

  it('un móvil con la versión anterior no borra el sitio de un lote al editarlo', async () => {
    const server = createFakeServer();
    const a = await device(server);
    await a.join();
    const garaje = await a.places.create({ name: 'Nevera garaje', kind: 'fridge' });
    const { lot: l } = await a.inventory.addStock({ product: milk }, lot({ placeId: garaje.id }));
    await a.engine.sync();
    // Simula una edición hecha desde la app 0.1 (no conoce placeId).
    const rec = [...server.records.values()].find((r) => r.entity === 'stock_lot')!;
    const { placeId: _omit, ...oldStyle } = rec.data!;
    await server.transport.push([{ op_id: crypto.randomUUID(), entity: 'stock_lot', entity_id: l.id, kind: 'upsert', data: { ...oldStyle, notes: 'editado' } }]);
    await a.engine.sync();
    expect(await a.db.get('SELECT place_id, notes FROM stock_lots')).toEqual({ place_id: garaje.id, notes: 'editado' });
  });

  it('con un servidor sin sitios, los sitios esperan en la cola sin bloquear lo demás', async () => {
    const server = createFakeServer();
    const s = await setupServices();
    const engine = createSyncEngine({ db: s.db, transport: server.transport, newId: randomUUID, entities: BASE_ENTITIES });
    await engine.enable({ serverUrl: 'https://x', email: 'a@b.es', householdId: 'h', householdName: 'Casa', role: 'owner' });
    await s.inventory.addStock({ product: milk }, lot());
    await engine.sync({ initial: true });
    expect([...server.records.values()].some((r) => r.entity === 'place')).toBe(false);
    expect([...server.records.values()].some((r) => r.entity === 'stock_lot')).toBe(true);
    expect(await engine.pendingCount()).toBe(4);
  });

  it('desconectarse deja los datos en el móvil y deja de enviar cambios', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const { product } = await a.inventory.addStock({ product: milk }, lot());
    await a.join();
    await a.engine.disable();
    await a.inventory.deleteProduct(product.id);
    expect(await a.engine.pendingCount()).toBe(0);
    expect([...server.records.values()].some((r) => r.entity === 'product' && !r.deleted)).toBe(true);
  });

  it('sin conexión los cambios esperan en la cola y se envían al volver', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    await a.join();
    await b.join();
    server.setOffline(true);
    await a.inventory.addStock({ product: milk }, lot());
    await expect(a.engine.sync()).rejects.toThrow();
    expect(await a.engine.pendingCount()).toBeGreaterThan(0);
    server.setOffline(false);
    await a.engine.sync();
    await b.engine.sync();
    expect((await snapshot(b)).products).toHaveLength(1);
  });

  it('tras una purga de lápidas hace una resincronización completa', async () => {
    const server = createFakeServer();
    const a = await device(server);
    const b = await device(server);
    const { product } = await a.inventory.addStock({ product: milk }, lot());
    await a.join();
    await b.join();
    await a.inventory.deleteProduct(product.id);
    await a.engine.sync();
    server.purgeTombstones();
    await b.engine.sync();
    expect((await snapshot(b)).products).toEqual([]);
  });

  it('ignora registros inválidos que lleguen del servidor', async () => {
    const server = createFakeServer();
    const a = await device(server);
    await a.join();
    server.records.set('product:x', { entity: 'product', id: randomUUID(), rev: 999, deleted: false, data: { name: 42 } });
    await a.engine.sync();
    expect((await snapshot(a)).products).toEqual([]);
  });
});
