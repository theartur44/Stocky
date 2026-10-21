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
import { createHmac, randomUUID } from 'node:crypto';
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
    const body = typeof init.body === 'string' ? init.body : null;
    const headers = { ...(init.headers as Record<string, string>), ...(body !== null ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) };
    const req = request(url, { method: init.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        const resHeaders = { get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null };
        resolve({ ok: status >= 200 && status < 300, status, headers: resHeaders, json: async () => JSON.parse(text) as unknown } as unknown as Response);
      });
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
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

/** TOTP (RFC 6238) para simular la app autenticadora. */
function totp(secretB32: string, offsetSteps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secretB32.replace(/=+$/, '')) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const step = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

maybe('sincronización con el servidor real', () => {
  it('verificación en dos pasos: activar, entrar con código y con código de recuperación', async () => {
    const a = await phone();
    const password = 'otra-contraseña-larga-9'; // secret-scan: ignore
    const email = `mfa-${randomUUID().slice(0, 8)}@stocky.test`;
    await a.api.register(email, password, CODE);
    const { secret, uri } = await a.api.mfaSetup();
    expect(uri).toContain('otpauth://totp/');
    const recovery = await a.api.mfaEnable(totp(secret));
    expect(recovery).toHaveLength(10);
    expect((await a.api.me()).mfaEnabled).toBe(true);

    const b = await phone();
    const challenge = await b.api.login(email, password);
    expect(challenge).not.toBeNull();
    await expect(b.api.loginMfa(challenge!.mfaToken, '000000')).rejects.toMatchObject({ code: 'invalid_mfa_code' });
    // Un código ya usado al activar no sirve: se usa el siguiente paso.
    await b.api.loginMfa(challenge!.mfaToken, totp(secret, 1));
    expect((await b.api.me()).email).toBe(email);

    const c = await phone();
    const again = await c.api.login(email, password);
    await c.api.loginMfa(again!.mfaToken, recovery[0]!);
    const devices = await c.api.devices();
    expect(devices.filter((d) => d.current)).toHaveLength(1);

    await expect(c.api.changePassword('mal', 'nueva-contraseña-larga-7')).rejects.toMatchObject({ code: 'invalid_credentials' });
    await c.api.mfaDisable(password, recovery[1]!);
    await c.api.deleteAccount(password, null);
  }, 30_000);

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
