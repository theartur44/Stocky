import { emptySession, lineQuantity, sessionReducer, sessionSummary, visibleLines, type ScanSession } from '../domain/scanSession';
import { milk, setupServices } from '../test-utils/fixtures';
import { createScanService } from './scanService';

const A = '3017624010701';
const B = '8410000000002';

function run(...actions: Parameters<typeof sessionReducer>[1][]): ScanSession {
  return actions.reduce(sessionReducer, emptySession);
}

describe('sesión de escaneo rápido', () => {
  it('añade una línea por código y suma al repetir', () => {
    const s = run({ type: 'scanned', code: A }, { type: 'scanned', code: B }, { type: 'scanned', code: A });
    expect(s.lines).toHaveLength(2);
    expect(s.lines.find((l) => l.code === A)!.count).toBe(2);
    // El último escaneado aparece primero.
    expect(visibleLines(s).map((l) => l.code)).toEqual([A, B]);
  });

  it('completa los datos al resolver sin pisar un nombre escrito', () => {
    const info = { name: 'Leche entera', brand: 'Marca', category: 'dairy_eggs' as const, unit: 'l' as const, packQuantityMilli: 1000, source: 'openfoodfacts' as const };
    let s = run({ type: 'scanned', code: A }, { type: 'resolved', code: A, info });
    const l = s.lines[0]!;
    expect(l).toMatchObject({ status: 'ready', name: 'Leche entera', location: 'fridge', unit: 'l', packQuantityMilli: 1000 });
    s = run({ type: 'scanned', code: B }, { type: 'setName', code: B, name: '  Mi  producto ' }, { type: 'resolved', code: B, info });
    expect(s.lines[0]!.name).toBe('Mi producto');
  });

  it('calcula la cantidad con el contenido del envase', () => {
    expect(lineQuantity({ count: 6, unit: 'l', packQuantityMilli: 1000 })).toEqual({ quantityMilli: 6000, unit: 'l' });
    expect(lineQuantity({ count: 3, unit: 'g', packQuantityMilli: null })).toEqual({ quantityMilli: 3000, unit: 'unit' });
    expect(lineQuantity({ count: 2, unit: 'unit', packQuantityMilli: null })).toEqual({ quantityMilli: 2000, unit: 'unit' });
  });

  it('elimina la línea al bajar a cero y resume la sesión', () => {
    let s = run({ type: 'scanned', code: A }, { type: 'scanned', code: B }, { type: 'failed', code: B, status: 'unknown' });
    expect(sessionSummary(s)).toEqual({ products: 2, units: 2, loading: 1, needsName: 1 });
    s = sessionReducer(s, { type: 'setCount', code: A, count: 0 });
    expect(s.lines.map((l) => l.code)).toEqual([B]);
  });

  it('marca como estimada solo una fecha existente', () => {
    let s = run({ type: 'scanned', code: A }, { type: 'setExpiry', code: A, expiryDate: '2026-11-01', estimated: true });
    expect(s.lines[0]).toMatchObject({ expiryDate: '2026-11-01', expiryEstimated: true });
    s = sessionReducer(s, { type: 'setExpiry', code: A, expiryDate: null, estimated: true });
    expect(s.lines[0]).toMatchObject({ expiryDate: null, expiryEstimated: false });
  });
});

describe('guardado de la sesión', () => {
  async function setup() {
    const s = await setupServices();
    const ctx = { db: s.db, newId: () => crypto.randomUUID(), clock: s.clock.now };
    return { ...s, scan: createScanService(ctx) };
  }

  it('crea productos con su envase y un lote por línea', async () => {
    const s = await setup();
    const session = run(
      { type: 'scanned', code: A },
      { type: 'resolved', code: A, info: { name: 'Leche', brand: null, category: 'dairy_eggs', unit: 'l', packQuantityMilli: 1000, source: 'openfoodfacts' } },
      { type: 'setCount', code: A, count: 6 },
      { type: 'setExpiry', code: A, expiryDate: '2026-10-25' },
      { type: 'scanned', code: B },
      { type: 'failed', code: B, status: 'unknown' },
    );
    expect(await s.scan.saveToInventory(session.lines)).toBe(2);
    const sums = await s.inventory.listSummaries();
    const leche = sums.find((x) => x.product.barcode === A)!;
    expect(leche.product.packQuantityMilli).toBe(1000);
    expect(leche.totalMilli).toBe(6000);
    expect(leche.lots[0]).toMatchObject({ location: 'fridge', expiryDate: '2026-10-25' });
    expect(sums.find((x) => x.product.barcode === B)!.product.name).toBe('Producto …0002');
  });

  it('reutiliza productos existentes del catálogo', async () => {
    const s = await setup();
    const p = await s.inventory.createProduct({ ...milk, barcode: A });
    const session = run({ type: 'scanned', code: A }, { type: 'scanned', code: A });
    await s.scan.saveToInventory(session.lines);
    expect(await s.inventory.listProducts()).toHaveLength(1);
    expect((await s.inventory.listLots(p.id))[0]!.quantityMilli).toBe(2000);
  });

  it('no guarda nada si una línea no es válida', async () => {
    const s = await setup();
    const session = run(
      { type: 'scanned', code: A },
      { type: 'scanned', code: B },
      { type: 'setExpiry', code: B, expiryDate: '2026-02-30' },
    );
    await expect(s.scan.saveToInventory(session.lines)).rejects.toBeTruthy();
    expect(await s.inventory.listProducts()).toHaveLength(0);
  });

  it('añade a la lista de la compra uniendo duplicados', async () => {
    const s = await setup();
    const list = await s.shopping.ensureDefaultList();
    const session = run({ type: 'scanned', code: A }, { type: 'scanned', code: A });
    await s.scan.saveToShoppingList(list.id, session.lines);
    await s.scan.saveToShoppingList(list.id, session.lines);
    const items = await s.shopping.items(list.id);
    expect(items).toHaveLength(1);
    expect(items[0]!.quantityMilli).toBe(4000);
  });
});
