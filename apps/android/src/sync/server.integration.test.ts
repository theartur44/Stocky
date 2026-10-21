/**
 * @jest-environment node
 */
/// <reference types="node" />
/**
 * Prueba contra el servidor REAL (services/api). Solo se ejecuta si se indica
 * su dirección; si no, se omite:
 *
 *   STOCKY_TEST_SERVER=http://127.0.0.1:8765 STOCKY_TEST_REGISTRATION_CODE=… npx jest server.integration
 */
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';

import { lot, milk, setupServices } from '../test-utils/fixtures';
import { createApiClient, type Tokens, type TokenStore } from './api';
import { createSyncEngine } from './engine';

const SERVER = process.env.STOCKY_TEST_SERVER;
const CODE = process.env.STOCKY_TEST_REGISTRATION_CODE ?? null;
const maybe = SERVER ? describe : describe.skip;

/** `fetch` mínimo sobre node:http (Jest sustituye el `fetch` global por uno simulado). */
function nodeFetch(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET', headers: init.headers as Record<string, string> }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) as unknown } as Response);
      });
    });
    req.on('error', reject);
    if (typeof init.body === 'string') req.write(init.body);
    req.end();
  });
}

function memoryTokens(): TokenStore {
  let value: Tokens | null = null;
  return {
    get: async () => value,
    set: async (t) => {
      value = t;
    },
    clear: async () => {
      value = null;
    },
  };
}

async function phone() {
  const s = await setupServices();
  const api = createApiClient({ baseUrl: SERVER!, tokens: memoryTokens(), fetch: nodeFetch });
  const engine = createSyncEngine({ db: s.db, transport: api, newId: randomUUID });
  return { ...s, api, engine };
}

maybe('sincronización con el servidor real', () => {
  it('dos móviles comparten inventario y lista a través del servidor', async () => {
    const a = await phone();
    const b = await phone();
    const password = 'una-contraseña-larga'; // secret-scan: ignore
    const emailA = `a-${randomUUID().slice(0, 8)}@stocky.test`;
    const emailB = `b-${randomUUID().slice(0, 8)}@stocky.test`;

    await a.api.health();
    await a.api.register(emailA, password, CODE);
    const house = await a.api.createHousehold('Casa de prueba');
    const { product } = await a.inventory.addStock({ product: { ...milk, barcode: '4006381333931' } }, lot({ quantityMilli: 2000 }));
    const listA = await a.shopping.ensureDefaultList();
    await a.shopping.addItem(listA.id, { name: 'Pan', quantityMilli: 1000, unit: 'unit' });
    await a.engine.enable({ serverUrl: SERVER!, email: emailA, householdId: house.id, householdName: house.name, role: house.role });
    await a.engine.sync({ initial: true });

    const { code } = await a.api.invite();
    await b.api.register(emailB, password, CODE);
    const joined = await b.api.joinHousehold(code);
    expect(joined.id).toBe(house.id);
    const listB = await b.shopping.ensureDefaultList();
    await b.shopping.addItem(listB.id, { name: 'Huevos', quantityMilli: 12000, unit: 'unit' });
    await b.engine.enable({ serverUrl: SERVER!, email: emailB, householdId: joined.id, householdName: joined.name, role: joined.role });
    await b.engine.sync({ initial: true });
    await a.engine.sync();

    // Consumos a la vez en los dos móviles.
    await a.inventory.consumeProduct(product.id, 500, 'l');
    await b.inventory.consumeProduct(product.id, 250, 'l');
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();

    for (const d of [a, b]) {
      const lots = await d.db.all<{ quantity_milli: number }>('SELECT quantity_milli FROM stock_lots');
      expect(lots.map((l) => l.quantity_milli)).toEqual([1250]);
      const items = await d.db.all<{ name: string }>('SELECT name FROM shopping_items ORDER BY name');
      expect(items.map((i) => i.name)).toEqual(['Huevos', 'Pan']);
      expect(await d.db.all('SELECT id FROM shopping_lists')).toHaveLength(1);
    }

    await a.api.logout();
    await expect(a.api.me()).rejects.toMatchObject({ code: 'unauthorized' });
  }, 30_000);
});
