import { AppError } from '../domain/errors';
import { lot, milk, setupServices } from '../test-utils/fixtures';

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(code));
}

describe('inventario', () => {
  it('crea producto y lote en una sola operación', async () => {
    const s = await setupServices();
    const { product, lot: created } = await s.inventory.addStock({ product: milk }, lot());
    expect(product.name).toBe('Leche entera');
    expect(created.productId).toBe(product.id);
    expect(s.changes).toContain('inventory');
  });

  it('permite varios lotes con distintas fechas para un mismo producto', async () => {
    const s = await setupServices();
    const { product } = await s.inventory.addStock({ product: milk }, lot({ expiryDate: '2026-10-25' }));
    await s.inventory.addStock({ productId: product.id }, lot({ expiryDate: '2026-10-15' }));
    await s.inventory.addStock({ productId: product.id }, lot({ expiryDate: null }));
    const lots = await s.inventory.listLots(product.id);
    expect(lots.map((l) => l.expiryDate)).toEqual(['2026-10-15', '2026-10-25', null]);
    const [summary] = await s.inventory.listSummaries();
    expect(summary!.totalMilli).toBe(3000);
    expect(summary!.nearestExpiry).toBe('2026-10-15');
  });

  it('reutiliza el producto si se escanea de nuevo el mismo código', async () => {
    const s = await setupServices();
    const withCode = { ...milk, barcode: '3017624010701' };
    const a = await s.inventory.addStock({ product: withCode }, lot());
    const b = await s.inventory.addStock({ product: { ...withCode, name: 'Otro nombre' } }, lot());
    expect(b.product.id).toBe(a.product.id);
    expect(b.product.name).toBe('Leche entera'); // no se sobrescribe
    expect(await s.inventory.listProducts()).toHaveLength(1);
  });

  it('rechaza crear dos productos con el mismo código de barras', async () => {
    const s = await setupServices();
    await s.inventory.createProduct({ ...milk, barcode: '3017624010701' });
    await expectCode(s.inventory.createProduct({ ...milk, barcode: '3017624010701' }), 'conflict');
  });

  it('consume en orden FEFO entre lotes y elimina los agotados', async () => {
    const s = await setupServices();
    const { product } = await s.inventory.addStock({ product: milk }, lot({ expiryDate: '2026-10-30' }));
    await s.inventory.addStock({ productId: product.id }, lot({ expiryDate: '2026-10-14' }));
    await s.inventory.consumeProduct(product.id, 1500, 'l');
    const lots = await s.inventory.listLots(product.id);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.expiryDate).toBe('2026-10-30');
    expect(lots[0]!.quantityMilli).toBe(500);
  });

  it('convierte unidades al consumir (500 ml de un lote en litros)', async () => {
    const s = await setupServices();
    const { lot: l } = await s.inventory.addStock({ product: milk }, lot());
    expect(await s.inventory.consumeLot(l.id, 500_000, 'ml')).toBe(500);
  });

  it('no consume nada si no hay cantidad suficiente', async () => {
    const s = await setupServices();
    const { product } = await s.inventory.addStock({ product: milk }, lot());
    await expectCode(s.inventory.consumeProduct(product.id, 5000, 'l'), 'insufficient_quantity');
    expect((await s.inventory.listLots(product.id))[0]!.quantityMilli).toBe(1000);
  });

  it('rechaza consumir con unidades incompatibles', async () => {
    const s = await setupServices();
    const { lot: l } = await s.inventory.addStock({ product: milk }, lot());
    await expectCode(s.inventory.consumeLot(l.id, 100, 'g'), 'incompatible_units');
  });

  it('consumos repetidos hasta agotar dejan el inventario coherente', async () => {
    const s = await setupServices();
    const { product, lot: l } = await s.inventory.addStock({ product: milk }, lot({ quantityMilli: 3000 }));
    for (let i = 0; i < 3; i++) await s.inventory.consumeLot(l.id, 1000, 'l');
    expect(await s.inventory.listLots(product.id)).toHaveLength(0);
    await expectCode(s.inventory.consumeLot(l.id, 1000, 'l'), 'not_found');
  });

  it('consumos concurrentes no restan más de lo disponible', async () => {
    const s = await setupServices();
    const { lot: l } = await s.inventory.addStock({ product: milk }, lot({ quantityMilli: 2000 }));
    const results = await Promise.allSettled([1, 2, 3].map(() => s.inventory.consumeLot(l.id, 1000, 'l')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('eliminar un producto elimina sus lotes', async () => {
    const s = await setupServices();
    const { product, lot: l } = await s.inventory.addStock({ product: milk }, lot());
    await s.inventory.deleteProduct(product.id);
    expect(await s.inventory.getLot(l.id)).toBeNull();
  });

  it('el panel muestra caducidades próximas y productos con pocas existencias', async () => {
    const s = await setupServices();
    await s.inventory.addStock({ product: milk }, lot({ expiryDate: '2026-10-14' }));
    await s.inventory.addStock(
      { product: { name: 'Arroz', category: 'grains_pasta', defaultUnit: 'kg', defaultLocation: 'pantry', lowStockThresholdMilli: 1000 } },
      lot({ unit: 'g', quantityMilli: 500_000, expiryDate: '2027-06-01', location: 'pantry' }),
    );
    const d = await s.inventory.getDashboard(2);
    expect(d.productsInStock).toBe(2);
    expect(d.attentionLots.map((l) => l.product.name)).toEqual(['Leche entera']);
    expect(d.lowStock.map((x) => x.product.name)).toEqual(['Arroz']);
  });

  it('busca por nombre sin distinguir tildes ni mayúsculas', async () => {
    const s = await setupServices();
    await s.inventory.addStock({ product: { ...milk, name: 'Plátanos' } }, lot());
    expect(await s.inventory.search('PLATANO')).toHaveLength(1);
    expect(await s.inventory.search('kiwi')).toHaveLength(0);
  });
});

describe('lista de la compra', () => {
  it('suma cantidades en lugar de duplicar artículos', async () => {
    const s = await setupServices();
    const list = await s.shopping.ensureDefaultList();
    await s.shopping.addItem(list.id, { name: 'Tomates', quantityMilli: 1000, unit: 'kg' });
    const r = await s.shopping.addItem(list.id, { name: ' tomates ', quantityMilli: 500_000, unit: 'g' });
    expect(r.merged).toBe(true);
    const items = await s.shopping.items(list.id);
    expect(items).toHaveLength(1);
    expect(items[0]!.quantityMilli).toBe(1500);
    expect(items[0]!.unit).toBe('kg');
  });

  it('no mezcla unidades incompatibles', async () => {
    const s = await setupServices();
    const list = await s.shopping.ensureDefaultList();
    await s.shopping.addItem(list.id, { name: 'Huevos', quantityMilli: 12000, unit: 'unit' });
    const r = await s.shopping.addItem(list.id, { name: 'Huevos', quantityMilli: 500_000, unit: 'g' });
    expect(r.merged).toBe(false);
    expect(await s.shopping.items(list.id)).toHaveLength(2);
  });

  it('ensureDefaultList no crea listas repetidas', async () => {
    const s = await setupServices();
    const a = await s.shopping.ensureDefaultList();
    const b = await s.shopping.ensureDefaultList();
    expect(b.id).toBe(a.id);
    expect(await s.shopping.lists()).toHaveLength(1);
  });

  it('pasa al inventario solo lo marcado y una única vez', async () => {
    const s = await setupServices();
    const list = await s.shopping.ensureDefaultList();
    const { item: bread } = await s.shopping.addItem(list.id, { name: 'Pan', quantityMilli: 1000, unit: 'unit' });
    await s.shopping.addItem(list.id, { name: 'Café', quantityMilli: 250_000, unit: 'g' });
    await s.shopping.setChecked(bread.id, true);

    expect(await s.shopping.transferChecked(list.id, { [bread.id]: { expiryDate: '2026-10-15' } })).toBe(1);
    // Repetir la operación no duplica existencias.
    expect(await s.shopping.transferChecked(list.id)).toBe(0);

    const summaries = await s.inventory.listSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.product.name).toBe('Pan');
    expect(summaries[0]!.lots[0]!.expiryDate).toBe('2026-10-15');
    const items = await s.shopping.items(list.id);
    expect(items.find((i) => i.id === bread.id)!.transferredAt).not.toBeNull();
    expect(items.find((i) => i.name === 'Café')!.transferredAt).toBeNull();
  });

  it('usa el producto existente con el mismo nombre', async () => {
    const s = await setupServices();
    const { product } = await s.inventory.addStock({ product: milk }, lot());
    const list = await s.shopping.ensureDefaultList();
    const { item } = await s.shopping.addItem(list.id, { name: 'leche ENTERA', quantityMilli: 2000, unit: 'l' });
    await s.shopping.setChecked(item.id, true);
    await s.shopping.transferChecked(list.id);
    expect(await s.inventory.listLots(product.id)).toHaveLength(2);
    expect(await s.inventory.listProducts()).toHaveLength(1);
  });

  it('si un artículo falla, no se incorpora ninguno', async () => {
    const s = await setupServices();
    const list = await s.shopping.ensureDefaultList();
    const { item: a } = await s.shopping.addItem(list.id, { name: 'Pan', quantityMilli: 1000, unit: 'unit' });
    const { item: b } = await s.shopping.addItem(list.id, { name: 'Queso', quantityMilli: 1000, unit: 'unit' });
    await s.shopping.setChecked(a.id, true);
    await s.shopping.setChecked(b.id, true);
    await expect(
      s.shopping.transferChecked(list.id, { [b.id]: { expiryDate: '2026-02-31' } }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await s.inventory.listProducts()).toHaveLength(0);
    const items = await s.shopping.items(list.id);
    expect(items.every((i) => i.transferredAt === null)).toBe(true);
  });

  it('no permite editar ni desmarcar artículos ya incorporados', async () => {
    const s = await setupServices();
    const list = await s.shopping.ensureDefaultList();
    const { item } = await s.shopping.addItem(list.id, { name: 'Pan', quantityMilli: 1000, unit: 'unit' });
    await s.shopping.setChecked(item.id, true);
    await s.shopping.transferChecked(list.id);
    await expectCode(s.shopping.setChecked(item.id, false), 'already_transferred');
    expect(await s.shopping.clearTransferred(list.id)).toBe(1);
    expect(await s.shopping.items(list.id)).toHaveLength(0);
  });

  it('valida nombres y cantidades', async () => {
    const s = await setupServices();
    const list = await s.shopping.ensureDefaultList();
    await expectCode(s.shopping.addItem(list.id, { name: '   ', quantityMilli: 1000, unit: 'unit' }), 'validation');
    await expectCode(s.shopping.addItem(list.id, { name: 'Pan', quantityMilli: -1, unit: 'unit' }), 'validation');
    await expectCode(s.shopping.addItem('no-existe', { name: 'Pan', quantityMilli: 1000, unit: 'unit' }), 'not_found');
  });
});

describe('ajustes y privacidad', () => {
  it('usa valores por defecto respetuosos con la privacidad', async () => {
    const s = await setupServices();
    const st = await s.settings.get();
    expect(st.notificationsEnabled).toBe(false);
    expect(st.notificationShowNames).toBe(false);
    expect(st.productLookupConsent).toBe('unknown');
  });

  it('valida y guarda ajustes', async () => {
    const s = await setupServices();
    expect((await s.settings.update({ warnDays: 5 })).warnDays).toBe(5);
    await expect(s.settings.update({ warnDays: 99 })).rejects.toThrow();
    const st = await s.settings.setLookupConsent(true);
    expect(st.productLookupConsent).toBe('granted');
    expect(st.productLookupConsentAt).toBe(new Date('2026-10-13T10:00:00').toISOString());
  });

  it('ignora valores corruptos', async () => {
    const s = await setupServices();
    await s.db.run("INSERT INTO settings (key, value) VALUES ('warnDays', '{roto')");
    expect((await s.settings.get()).warnDays).toBe(2);
  });

  it('elimina todos los datos locales', async () => {
    const s = await setupServices();
    await s.inventory.addStock({ product: milk }, lot());
    const list = await s.shopping.ensureDefaultList();
    await s.shopping.addItem(list.id, { name: 'Pan', quantityMilli: 1000, unit: 'unit' });
    await s.settings.update({ warnDays: 7 });
    await s.privacy.deleteAllData();
    for (const table of ['products', 'stock_lots', 'shopping_lists', 'shopping_items', 'settings']) {
      expect(await s.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)).toEqual({ n: 0 });
    }
  });
});
