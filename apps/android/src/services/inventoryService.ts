import { eventRepo, lotRepo, placeRepo, productRepo, type StockEvent } from '../data/repositories';
import type { SqlExecutor } from '../data/sql';
import { addDays, toLocalDate, type LocalDate } from '../domain/dates';
import { AppError } from '../domain/errors';
import { getExpiryStatus, needsAttention } from '../domain/expiry';
import { planConsumption, summarizeProduct } from '../domain/inventory';
import type { Product, ProductStockSummary, StockLot, StockLotWithProduct } from '../domain/models';
import { normalizeKey } from '../domain/text';
import type { Unit } from '../domain/units';
import {
  assertValidQuantity,
  validateLotInput,
  validateProductInput,
  type LotInput,
  type ProductInput,
} from '../domain/validation';
import { nowIso, type ServiceContext } from './context';

/** Días que se estima que dura algo al congelarlo (se puede corregir en el lote). */
export const FREEZE_DAYS = 90;

export interface ConsumeResult {
  /** Para deshacer la acción desde el aviso o el historial. */
  batchId: string;
  /** Ya no queda nada de ese producto. */
  productEmpty: boolean;
}

export interface Dashboard {
  productsInStock: number;
  lotsCount: number;
  attentionLots: StockLotWithProduct[];
  lowStock: ProductStockSummary[];
}

function isUniqueViolation(e: unknown): boolean {
  // No se usa `instanceof Error`: los errores nativos pueden venir de otro contexto JS.
  const message = (e as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /UNIQUE constraint failed: products\.barcode/i.test(message);
}

export function createInventoryService(ctx: ServiceContext) {
  const { db } = ctx;
  const changed = () => ctx.onChange?.('inventory');

  /** Anota en el historial lo que se gasta o se tira de un lote. */
  async function record(
    tx: SqlExecutor,
    batchId: string,
    kind: StockEvent['kind'],
    lot: StockLot,
    takeMilli: number,
  ): Promise<void> {
    const product = await productRepo.get(tx, lot.productId);
    const now = ctx.clock();
    const status = getExpiryStatus(lot, toLocalDate(now), 0);
    await eventRepo.insert(tx, {
      id: ctx.newId(),
      batchId,
      kind,
      productId: lot.productId,
      productName: product?.name ?? '?',
      category: product?.category ?? 'other',
      quantityMilli: takeMilli,
      unit: lot.unit,
      expired: status === 'expired' || status === 'best_before_passed',
      lot,
      day: toLocalDate(now),
      at: now.toISOString(),
    });
  }

  async function requireLot(tx: SqlExecutor, id: string): Promise<StockLot> {
    const lot = await lotRepo.get(tx, id);
    if (!lot) throw new AppError('not_found', 'Lot not found');
    return lot;
  }

  /** Cambia un lote de sitio; opcionalmente con fecha nueva (p. ej. al congelarlo). */
  async function moveLot(lotId: string, placeId: string, newExpiry?: { date: LocalDate; kind: 'use_by' | 'best_before' } | null): Promise<void> {
    await db.transaction(async (tx) => {
      const lot = await requireLot(tx, lotId);
      const place = (await placeRepo.list(tx)).find((p) => p.id === placeId);
      if (!place) throw new AppError('not_found', 'Place not found');
      const next = {
        ...lot,
        placeId: place.id,
        location: place.kind,
        ...(newExpiry ? { expiryDate: newExpiry.date, expiryKind: newExpiry.kind, expiryEstimated: true } : {}),
      };
      await lotRepo.update(tx, lot.id, validateLotInput(next), nowIso(ctx));
    });
    changed();
  }

  async function consumeFromLot(lotId: string, amountMilli: number, unit: Unit): Promise<ConsumeResult & { remainingMilli: number }> {
    assertValidQuantity(amountMilli);
    const batchId = ctx.newId();
    const result = await db.transaction(async (tx) => {
      const lot = await requireLot(tx, lotId);
      const [step] = planConsumption([lot], amountMilli, unit);
      await record(tx, batchId, 'consumed', lot, step!.takeMilli);
      const remainingMilli = await applyStep(tx, lot.quantityMilli, step!);
      return { remainingMilli, productEmpty: (await lotRepo.listByProduct(tx, lot.productId)).length === 0 };
    });
    changed();
    return { batchId, ...result };
  }

  async function requireProduct(id: string): Promise<Product> {
    const p = await productRepo.get(db, id);
    if (!p) throw new AppError('not_found', 'Product not found');
    return p;
  }

  /** Lee catálogo y lotes en la misma transacción para obtener una vista coherente. */
  async function listSummaries(): Promise<ProductStockSummary[]> {
    const [products, lots] = await db.transaction(async (tx) => [
      await productRepo.list(tx),
      await lotRepo.listAll(tx),
    ] as const);
    const byProduct = new Map<string, StockLot[]>();
    for (const lot of lots) {
      const arr = byProduct.get(lot.productId);
      if (arr) arr.push(lot);
      else byProduct.set(lot.productId, [lot]);
    }
    return products.map((p) => summarizeProduct(p, byProduct.get(p.id) ?? []));
  }

  return {
    getProduct: (id: string) => productRepo.get(db, id),
    getProductByBarcode: (barcode: string) => productRepo.getByBarcode(db, barcode),
    getLot: (id: string) => lotRepo.get(db, id),
    listLots: (productId: string) => lotRepo.listByProduct(db, productId),
    listProducts: () => productRepo.list(db),

    async createProduct(input: ProductInput): Promise<Product> {
      const p = validateProductInput(input);
      try {
        const product = await db.transaction((tx) => productRepo.insert(tx, ctx.newId(), p, nowIso(ctx)));
        changed();
        return product;
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppError('conflict', 'Barcode exists', { barcode: 'errors.barcodeExists' });
        throw e;
      }
    },

    async updateProduct(id: string, input: ProductInput): Promise<Product> {
      const p = validateProductInput(input);
      try {
        const n = await db.transaction((tx) => productRepo.update(tx, id, p, nowIso(ctx)));
        if (n === 0) throw new AppError('not_found', 'Product not found');
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppError('conflict', 'Barcode exists', { barcode: 'errors.barcodeExists' });
        throw e;
      }
      changed();
      return requireProduct(id);
    },

    /** Elimina el producto y todos sus lotes. */
    async deleteProduct(id: string): Promise<void> {
      const n = await db.transaction((tx) => productRepo.delete(tx, id));
      if (n === 0) throw new AppError('not_found', 'Product not found');
      changed();
    },

    /**
     * Añade existencias. Si se pasa un producto nuevo con un código de barras
     * que ya existe en el catálogo, se reutiliza el existente (sin
     * sobrescribirlo). Producto y lote se crean en la misma transacción.
     */
    async addStock(
      target: { productId: string } | { product: ProductInput },
      lotInput: LotInput,
    ): Promise<{ product: Product; lot: StockLot }> {
      const lot = validateLotInput(lotInput);
      const newProduct = 'product' in target ? validateProductInput(target.product) : null;
      const result = await db.transaction(async (tx) => {
        const now = nowIso(ctx);
        let product: Product | null;
        if (newProduct) {
          product = newProduct.barcode ? await productRepo.getByBarcode(tx, newProduct.barcode) : null;
          product ??= await productRepo.insert(tx, ctx.newId(), newProduct, now);
        } else {
          product = await productRepo.get(tx, (target as { productId: string }).productId);
          if (!product) throw new AppError('not_found', 'Product not found');
        }
        const created = await lotRepo.insert(tx, ctx.newId(), product.id, lot, now);
        return { product, lot: created };
      });
      changed();
      return result;
    },

    async updateLot(id: string, input: LotInput): Promise<StockLot> {
      const lot = validateLotInput(input);
      const n = await db.transaction((tx) => lotRepo.update(tx, id, lot, nowIso(ctx)));
      if (n === 0) throw new AppError('not_found', 'Lot not found');
      changed();
      return (await lotRepo.get(db, id))!;
    },

    async deleteLot(id: string): Promise<void> {
      const n = await db.transaction((tx) => lotRepo.delete(tx, id));
      if (n === 0) throw new AppError('not_found', 'Lot not found');
      changed();
    },

    /**
     * Consume una cantidad de un lote concreto. Si se agota, el lote se elimina.
     * Devuelve la cantidad restante en la unidad del lote.
     */
    async consumeLot(lotId: string, amountMilli: number, unit: Unit): Promise<number> {
      return (await consumeFromLot(lotId, amountMilli, unit)).remainingMilli;
    },

    /** Como `consumeLot`, con lo necesario para deshacer y saber si se ha acabado el producto. */
    consumeFromLot,

    /** Consume de los lotes de un producto en orden FEFO. Todo o nada. */
    async consumeProduct(productId: string, amountMilli: number, unit: Unit): Promise<ConsumeResult> {
      const batchId = ctx.newId();
      const productEmpty = await db.transaction(async (tx) => {
        const lots = await lotRepo.listByProduct(tx, productId);
        if (lots.length === 0) throw new AppError('insufficient_quantity', 'No stock');
        const steps = planConsumption(lots, amountMilli, unit);
        for (const step of steps) {
          const lot = lots.find((l) => l.id === step.lotId)!;
          await record(tx, batchId, 'consumed', lot, step.takeMilli);
          await applyStep(tx, lot.quantityMilli, step);
        }
        return (await lotRepo.listByProduct(tx, productId)).length === 0;
      });
      changed();
      return { batchId, productEmpty };
    },

    /** Se ha gastado el lote entero. */
    async finishLot(lotId: string): Promise<ConsumeResult> {
      const batchId = ctx.newId();
      const productEmpty = await db.transaction(async (tx) => {
        const lot = await requireLot(tx, lotId);
        await record(tx, batchId, 'consumed', lot, lot.quantityMilli);
        await lotRepo.delete(tx, lot.id);
        return (await lotRepo.listByProduct(tx, lot.productId)).length === 0;
      });
      changed();
      return { batchId, productEmpty };
    },

    /** Se tira el lote entero (queda en el historial como desperdicio). */
    async discardLot(lotId: string): Promise<ConsumeResult> {
      const batchId = ctx.newId();
      const productEmpty = await db.transaction(async (tx) => {
        const lot = await requireLot(tx, lotId);
        await record(tx, batchId, 'discarded', lot, lot.quantityMilli);
        await lotRepo.delete(tx, lot.id);
        return (await lotRepo.listByProduct(tx, lot.productId)).length === 0;
      });
      changed();
      return { batchId, productEmpty };
    },

    /** Tira todo lo que ya ha caducado («consumir antes de» pasado). Devuelve cuántos lotes. */
    async discardExpired(): Promise<{ batchId: string; count: number }> {
      const batchId = ctx.newId();
      const today = toLocalDate(ctx.clock());
      const count = await db.transaction(async (tx) => {
        const lots = (await lotRepo.listWithExpiryUntil(tx, addDays(today, -1))).filter(
          (l) => getExpiryStatus(l, today, 0) === 'expired',
        );
        for (const lot of lots) {
          await record(tx, batchId, 'discarded', lot, lot.quantityMilli);
          await lotRepo.delete(tx, lot.id);
        }
        return lots.length;
      });
      if (count > 0) changed();
      return { batchId, count };
    },

    /**
     * Marca como abierto. Si el producto dice cuánto dura abierto, la fecha pasa
     * a ser la de apertura más esos días (si es antes que la impresa). De un lote
     * de varias unidades se abre solo una, que queda como lote aparte.
     */
    async openLot(lotId: string): Promise<{ lotId: string; expiryChanged: boolean }> {
      const result = await db.transaction(async (tx) => {
        const lot = await requireLot(tx, lotId);
        if (lot.openedOn) return { lotId, expiryChanged: false };
        const product = await productRepo.get(tx, lot.productId);
        const today = toLocalDate(ctx.clock());
        const now = nowIso(ctx);
        const openExpiry = product?.openDays ? addDays(today, product.openDays) : null;
        const expiryChanged = openExpiry !== null && (lot.expiryDate === null || openExpiry < lot.expiryDate);
        const opened = {
          ...lot,
          openedOn: today,
          ...(expiryChanged ? { expiryDate: openExpiry, expiryKind: 'use_by' as const, expiryEstimated: true } : {}),
        };
        if (lot.unit === 'unit' && lot.quantityMilli > 1000) {
          if ((await lotRepo.setQuantity(tx, lot.id, lot.quantityMilli, lot.quantityMilli - 1000, now)) !== 1) {
            throw new AppError('conflict', 'Lot changed concurrently');
          }
          const id = ctx.newId();
          await lotRepo.insert(tx, id, lot.productId, { ...validateLotInput({ ...opened, quantityMilli: 1000 }) }, now);
          return { lotId: id, expiryChanged };
        }
        await lotRepo.update(tx, lot.id, validateLotInput(opened), now);
        return { lotId, expiryChanged };
      });
      changed();
      return result;
    },

    moveLot,

    /** Al congelador (el primero de la lista), con una fecha estimada de unos meses. */
    async freezeLot(lotId: string): Promise<void> {
      const freezer = (await placeRepo.list(db)).find((p) => p.kind === 'freezer');
      if (!freezer) throw new AppError('validation', 'No freezer', { place: 'places.noFreezer' });
      const today = toLocalDate(ctx.clock());
      await moveLot(lotId, freezer.id, { date: addDays(today, FREEZE_DAYS), kind: 'best_before' });
    },

    listSummaries,

    /** Lotes con fecha hasta `today + horizonDays` (incluye los ya pasados). */
    listExpiring(today: LocalDate, horizonDays: number): Promise<StockLotWithProduct[]> {
      return lotRepo.listWithExpiryUntil(db, addDays(today, horizonDays));
    },

    async getDashboard(warnDays: number): Promise<Dashboard> {
      const today = toLocalDate(ctx.clock());
      const summaries = await listSummaries();
      const expiring = await lotRepo.listWithExpiryUntil(db, addDays(today, warnDays));
      const inStock = summaries.filter((s) => s.lots.length > 0);
      return {
        productsInStock: inStock.length,
        lotsCount: inStock.reduce((n, s) => n + s.lots.length, 0),
        attentionLots: expiring.filter((l) => needsAttention(getExpiryStatus(l, today, warnDays))),
        // Solo productos con umbral configurado: un producto sin existencias y
        // sin umbral no se considera «agotado» a efectos de aviso.
        lowStock: summaries.filter((s) => s.isLowStock && s.product.lowStockThresholdMilli !== null),
      };
    },

    /** Busca en el catálogo por nombre, marca o código de barras. */
    async search(query: string): Promise<ProductStockSummary[]> {
      const q = normalizeKey(query);
      const all = await listSummaries();
      if (!q) return all;
      return all.filter(
        (s) =>
          normalizeKey(s.product.name).includes(q) ||
          (s.product.brand !== null && normalizeKey(s.product.brand).includes(q)) ||
          s.product.barcode === query.trim(),
      );
    },
  };

  async function applyStep(
    tx: Parameters<typeof lotRepo.get>[0],
    expected: number,
    step: { lotId: string; remainingMilli: number },
  ): Promise<number> {
    if (step.remainingMilli <= 0) {
      await lotRepo.delete(tx, step.lotId);
      return 0;
    }
    const n = await lotRepo.setQuantity(tx, step.lotId, expected, step.remainingMilli, nowIso(ctx));
    if (n !== 1) throw new AppError('conflict', 'Lot changed concurrently');
    return step.remainingMilli;
  }
}

export type InventoryService = ReturnType<typeof createInventoryService>;
