import { DEFAULT_PLACES } from '../domain/places';
import { lot, milk, setupServices } from '../test-utils/fixtures';
import { FREEZE_DAYS } from './inventoryService';

const yogurt = { name: 'Yogur', category: 'dairy_eggs' as const, defaultUnit: 'unit' as const, defaultLocation: 'fridge' as const, openDays: 3 };
const FREEZER = DEFAULT_PLACES[1]!.id;

describe('acciones sobre el inventario', () => {
  it('gastar queda en el historial y se puede deshacer', async () => {
    const s = await setupServices();
    const { product, lot: l } = await s.inventory.addStock({ product: milk }, lot({ quantityMilli: 2000 }));
    const r = await s.inventory.consumeProduct(product.id, 2000, 'l');
    expect(r.productEmpty).toBe(true);
    expect(await s.inventory.listLots(product.id)).toEqual([]);
    const [e] = await s.history.list();
    expect(e).toMatchObject({ kind: 'consumed', productName: 'Leche entera', quantityMilli: 2000, expired: false });
    await s.history.undo(r.batchId);
    const back = await s.inventory.listLots(product.id);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: l.id, quantityMilli: 2000, expiryDate: '2026-10-20' });
    expect(await s.history.list()).toEqual([]);
  });

  it('tirar lo caducado cuenta como desperdicio', async () => {
    const s = await setupServices('2026-10-25T10:00:00');
    await s.inventory.addStock({ product: milk }, lot({ expiryDate: '2026-10-20' }));
    await s.inventory.addStock({ product: { ...milk, name: 'Pan' } }, lot({ expiryDate: '2026-10-30' }));
    const { count } = await s.inventory.discardExpired();
    expect(count).toBe(1);
    expect(await s.history.summary()).toMatchObject({ consumed: 0, discarded: 1, expired: 1 });
    expect((await s.inventory.listSummaries()).filter((x) => x.lots.length > 0).map((x) => x.product.name)).toEqual(['Pan']);
  });

  it('abrir un envase de varios lo separa y acorta su fecha según los días que dura abierto', async () => {
    const s = await setupServices();
    const { product, lot: l } = await s.inventory.addStock({ product: yogurt }, lot({ quantityMilli: 4000, unit: 'unit', expiryDate: '2026-11-30' }));
    const r = await s.inventory.openLot(l.id);
    expect(r.expiryChanged).toBe(true);
    const lots = await s.inventory.listLots(product.id);
    const opened = lots.find((x) => x.id === r.lotId)!;
    expect(opened).toMatchObject({ quantityMilli: 1000, openedOn: '2026-10-13', expiryDate: '2026-10-16', expiryEstimated: true });
    expect(lots.find((x) => x.id === l.id)).toMatchObject({ quantityMilli: 3000, openedOn: null, expiryDate: '2026-11-30' });
  });

  it('congelar lo pasa al congelador con una fecha nueva estimada', async () => {
    const s = await setupServices();
    const { lot: l } = await s.inventory.addStock({ product: milk }, lot());
    await s.inventory.freezeLot(l.id);
    const after = await s.inventory.getLot(l.id);
    expect(after).toMatchObject({ placeId: FREEZER, location: 'freezer', expiryKind: 'best_before', expiryEstimated: true });
    expect(after!.expiryDate).toBe(new Date(Date.UTC(2026, 9, 13 + FREEZE_DAYS)).toISOString().slice(0, 10));
  });

  it('editar un producto o un lote conserva los días abierto y la fecha de apertura', async () => {
    const s = await setupServices();
    const { product, lot: l } = await s.inventory.addStock({ product: yogurt }, lot({ unit: 'unit' }));
    await s.inventory.openLot(l.id);
    const p = (await s.inventory.getProduct(product.id))!;
    expect(p.openDays).toBe(3);
    const opened = (await s.inventory.getLot(l.id))!;
    await s.inventory.updateLot(l.id, { ...opened, notes: 'nota' });
    expect((await s.inventory.getLot(l.id))!.openedOn).toBe('2026-10-13');
  });
});
