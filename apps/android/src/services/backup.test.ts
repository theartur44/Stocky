import { DEFAULT_PLACES } from '../domain/places';
import { lot, milk, setupServices } from '../test-utils/fixtures';
import { csvCell, toCsv } from './backupService';

describe('copia de seguridad', () => {
  it('exportar e importar en otro móvil recupera inventario, sitios y listas', async () => {
    const a = await setupServices();
    const garage = await a.places.create({ name: 'Nevera garaje', kind: 'fridge' });
    const { product } = await a.inventory.addStock({ product: { ...milk, barcode: '4006381333931', openDays: 4 } }, lot({ placeId: garage.id, location: 'fridge' }));
    const list = await a.shopping.ensureDefaultList();
    await a.shopping.addItem(list.id, { name: 'Pan', quantityMilli: 1000, unit: 'unit' });
    const text = JSON.stringify(await a.backup.exportData());

    const b = await setupServices();
    const listB = await b.shopping.ensureDefaultList();
    const r = await b.backup.importData(text);
    expect(r.skipped).toBe(0);
    const sums = await b.inventory.listSummaries();
    expect(sums.map((s) => [s.product.id, s.product.openDays, s.lots[0]?.placeId])).toEqual([[product.id, 4, garage.id]]);
    expect((await b.places.list()).map((p) => p.name)).toEqual([...DEFAULT_PLACES.map((p) => p.name), 'Nevera garaje']);
    // La lista inicial de los dos móviles se funde en una.
    expect((await b.shopping.lists()).map((l) => l.id)).toEqual([listB.id]);
    expect((await b.shopping.items(listB.id)).map((i) => i.name)).toEqual(['Pan']);
    // Importar dos veces no duplica nada.
    await b.backup.importData(text);
    expect(await b.inventory.listSummaries()).toHaveLength(1);
  });

  it('rechaza ficheros que no son copias y descarta registros manipulados', async () => {
    const s = await setupServices();
    await expect(s.backup.importData('hola')).rejects.toMatchObject({ code: 'validation' });
    await expect(s.backup.importData(JSON.stringify({ app: 'otra', data: {} }))).rejects.toMatchObject({ code: 'validation' });
    await expect(s.backup.importData(JSON.stringify({ app: 'stocky', format: 99, data: {} }))).rejects.toMatchObject({ code: 'validation' });
    const evil = {
      app: 'stocky',
      format: 1,
      exportedAt: '',
      data: {
        product: [
          { id: 'p1', record: { name: 'x'.repeat(5000), category: 'other', defaultUnit: 'unit', defaultLocation: 'fridge', source: 'manual', createdAt: 'a', updatedAt: 'a' } },
          { id: "'; DROP TABLE products; --", record: {} },
          { id: 'p2', record: { name: 'Bien', category: 'pwned', defaultUnit: 'unit', defaultLocation: 'fridge', source: 'manual', imageUrl: 'https://evil.example/x.gif', createdAt: 'a', updatedAt: 'a' } },
        ],
      },
    };
    const r = await s.backup.importData(JSON.stringify(evil));
    expect(r).toEqual({ imported: 1, skipped: 2 });
    const p = (await s.inventory.getProduct('p2'))!;
    expect([p.category, p.imageUrl]).toEqual(['other', null]);
  });

  it('el CSV escapa comillas y no deja pasar fórmulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('Leche, entera')).toBe('"Leche, entera"');
    expect(csvCell(-5)).toBe('-5');
    expect(toCsv([['a', null]]).startsWith('﻿a,')).toBe(true);
  });
});
