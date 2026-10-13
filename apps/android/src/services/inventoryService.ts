import { lotRepo, productRepo } from '../data/repositories';
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
      assertValidQuantity(amountMilli);
      const remaining = await db.transaction(async (tx) => {
        const lot = await lotRepo.get(tx, lotId);
        if (!lot) throw new AppError('not_found', 'Lot not found');
        const [step] = planConsumption([lot], amountMilli, unit);
        return applyStep(tx, lot.quantityMilli, step!);
      });
      changed();
      return remaining;
    },

    /** Consume de los lotes de un producto en orden FEFO. Todo o nada. */
    async consumeProduct(productId: string, amountMilli: number, unit: Unit): Promise<void> {
      await db.transaction(async (tx) => {
        const lots = await lotRepo.listByProduct(tx, productId);
        if (lots.length === 0) throw new AppError('insufficient_quantity', 'No stock');
        const steps = planConsumption(lots, amountMilli, unit);
        for (const step of steps) {
          const lot = lots.find((l) => l.id === step.lotId)!;
          await applyStep(tx, lot.quantityMilli, step);
        }
      });
      changed();
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
