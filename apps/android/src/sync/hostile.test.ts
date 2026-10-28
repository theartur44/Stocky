/// <reference types="node" />
import { randomUUID } from 'node:crypto';

import { setupServices } from '../test-utils/fixtures';
import { ApiError, type PullPage, type SyncTransport } from './api';
import { createSyncEngine } from './engine';
import { createFakeServer } from './fakeServer';

/**
 * Lo que puede mandar un miembro del hogar malintencionado (o un servidor
 * manipulado): la app no debe cerrarse, bloquearse ni perder la privacidad.
 */
const NOW = '2026-10-20T10:00:00.000Z';
const product = (over: Record<string, unknown> = {}) => ({
  name: 'Leche',
  brand: null,
  barcode: null,
  category: 'dairy_eggs',
  defaultUnit: 'l',
  defaultLocation: 'fridge',
  lowStockThresholdMilli: null,
  packQuantityMilli: null,
  imageUrl: null,
  source: 'manual',
  notes: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

async function device(transport: SyncTransport) {
  const s = await setupServices();
  const engine = createSyncEngine({ db: s.db, transport, newId: randomUUID });
  await engine.enable({ serverUrl: 'https://stocky.test', email: 'a@b.es', householdId: 'h1', householdName: 'Casa', role: 'member' });
  return { ...s, engine };
}

function remote(server: ReturnType<typeof createFakeServer>, entity: string, id: string, data: Record<string, unknown>) {
  const rev = Math.max(0, ...[...server.records.values()].map((r) => r.rev)) + 1;
  server.records.set(`${entity}:${id}`, { entity, id, rev, deleted: false, data });
}

describe('datos hostiles recibidos del hogar', () => {
  it('una categoría o un sitio desconocidos se muestran como «otro» en vez de romper la app', async () => {
    const server = createFakeServer();
    const a = await device(server.transport);
    const id = randomUUID();
    remote(server, 'product', id, product({ category: 'pwned', defaultLocation: 'garaje', lowStockThresholdMilli: 1000 }));
    await a.engine.sync({ initial: true });
    const p = await a.db.get<{ category: string; default_location: string }>('SELECT category, default_location FROM products WHERE id = ?', [id]);
    expect(p).toEqual({ category: 'other', default_location: 'other' });
  });

  it('rechaza unidades, fechas y cantidades fuera de rango', async () => {
    const server = createFakeServer();
    const a = await device(server.transport);
    const pid = randomUUID();
    remote(server, 'product', pid, product());
    const lot = { productId: pid, quantityMilli: 1000, unit: 'l', location: 'fridge', addedOn: '2026-10-20', expiryDate: null, expiryKind: 'use_by', expiryEstimated: 0, lotCode: null, notes: null, createdAt: NOW, updatedAt: NOW };
    remote(server, 'stock_lot', randomUUID(), { ...lot, unit: 'bogus' });
    remote(server, 'stock_lot', randomUUID(), { ...lot, expiryDate: '2026-10-20x' });
    remote(server, 'stock_lot', randomUUID(), { ...lot, quantityMilli: Number.MAX_SAFE_INTEGER });
    const ok = randomUUID();
    remote(server, 'stock_lot', ok, lot);
    await a.engine.sync({ initial: true });
    expect((await a.db.all<{ id: string }>('SELECT id FROM stock_lots')).map((r) => r.id)).toEqual([ok]);
  });

  it('un registro que no cumple las restricciones no bloquea la recepción de los siguientes', async () => {
    const server = createFakeServer();
    const a = await device(server.transport);
    await a.engine.sync({ initial: true });
    const list = (await a.db.get<{ id: string }>('SELECT id FROM shopping_lists'))?.id ?? (await a.shopping.ensureDefaultList()).id;
    await a.engine.sync();
    // Válido campo a campo, pero incumple CHECK (incorporado sin estar marcado).
    remote(server, 'shopping_item', randomUUID(), {
      listId: list, productId: null, name: 'Trampa', quantityMilli: 1000, unit: 'unit', checked: 0,
      checkedAt: null, transferredAt: NOW, transferredLotId: null, createdAt: NOW, updatedAt: NOW,
    });
    await a.engine.sync();
    const later = randomUUID();
    remote(server, 'product', later, product({ name: 'Llega después' }));
    await a.engine.sync();
    expect(await a.db.get('SELECT name FROM products WHERE id = ?', [later])).toEqual({ name: 'Llega después' });
    expect(await a.db.get('SELECT COUNT(*) AS n FROM shopping_items')).toEqual({ n: 0 });
  });

  it('descarta imágenes que no son de Open Food Facts', async () => {
    const server = createFakeServer();
    const a = await device(server.transport);
    const id = randomUUID();
    remote(server, 'product', id, product({ imageUrl: 'https://tracker.example/p.gif?u=victima' }));
    await a.engine.sync({ initial: true });
    expect(await a.db.get('SELECT name, image_url FROM products WHERE id = ?', [id])).toEqual({ name: 'Leche', image_url: null });
  });

  it('un servidor que no avanza no deja la app en un bucle', async () => {
    const server = createFakeServer();
    const transport: SyncTransport = {
      push: server.transport.push,
      pull: async (since): Promise<PullPage> => ({ changes: [], next: since, has_more: true }),
    };
    const a = await device(transport);
    await expect(a.engine.sync({ initial: true })).rejects.toBeInstanceOf(ApiError);
  });

  it('«Borrar todos los datos» no se deshace con una sincronización que estaba en curso', async () => {
    const server = createFakeServer();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let hold = false;
    const transport: SyncTransport = {
      push: server.transport.push,
      pull: async (since, limit) => {
        const page = await server.transport.pull(since, limit);
        if (hold) await gate;
        return page;
      },
    };
    const a = await device(transport);
    await a.engine.sync({ initial: true });
    const id = randomUUID();
    remote(server, 'product', id, product({ name: 'Del hogar' }));
    hold = true;
    const inFlight = a.engine.sync().catch(() => undefined);
    // Lo mismo que hace Ajustes → Borrar todos los datos, mientras la descarga sigue en el aire.
    const deleting = a.engine.disable().then(() => a.privacy.deleteAllData());
    await new Promise((r) => setTimeout(r, 20));
    release();
    await deleting;
    await inFlight;
    expect(await a.db.get('SELECT COUNT(*) AS n FROM products')).toEqual({ n: 0 });
    expect(await a.db.get('SELECT enabled, last_rev FROM sync_state')).toEqual({ enabled: 0, last_rev: 0 });
  });
});
