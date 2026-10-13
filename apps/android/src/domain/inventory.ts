import { AppError } from './errors';
import type { Product, ProductStockSummary, StockLot } from './models';
import { areCompatible, convertMilli, type Unit } from './units';

/** Resumen de existencias de un producto (lógica pura, sin E/S). */
export function summarizeProduct(product: Product, lots: StockLot[]): ProductStockSummary {
  let totalMilli = 0;
  let incompatibleLots = 0;
  let nearestExpiry: string | null = null;
  for (const lot of lots) {
    if (areCompatible(lot.unit, product.defaultUnit)) {
      totalMilli += convertMilli(lot.quantityMilli, lot.unit, product.defaultUnit);
    } else {
      incompatibleLots++;
    }
    if (lot.expiryDate && (nearestExpiry === null || lot.expiryDate < nearestExpiry)) nearestExpiry = lot.expiryDate;
  }
  const threshold = product.lowStockThresholdMilli;
  const isLowStock = lots.length === 0 || (threshold !== null && incompatibleLots === 0 && totalMilli <= threshold);
  return { product, lots, totalMilli, incompatibleLots, nearestExpiry, isLowStock };
}

export interface ConsumptionStep {
  lotId: string;
  /** Cantidad que se resta del lote, en la unidad del lote. */
  takeMilli: number;
  /** Cantidad restante del lote (0 → el lote se elimina). */
  remainingMilli: number;
}

/**
 * Planifica el consumo de `amountMilli` (en `unit`) repartiéndolo entre los
 * lotes en orden FEFO (primero el que caduca antes). Los lotes deben venir ya
 * ordenados. Lanza `insufficient_quantity` si no hay suficiente cantidad en
 * lotes de unidad compatible; en ese caso no se consume nada.
 */
export function planConsumption(lots: StockLot[], amountMilli: number, unit: Unit): ConsumptionStep[] {
  if (!Number.isSafeInteger(amountMilli) || amountMilli <= 0) {
    throw new AppError('validation', 'Invalid amount', { quantity: 'errors.invalidQuantity' });
  }
  const compatible = lots.filter((l) => areCompatible(l.unit, unit));
  if (compatible.length === 0 && lots.length > 0) {
    throw new AppError('incompatible_units', 'No lots with compatible unit');
  }
  let pending = amountMilli; // en `unit`
  const steps: ConsumptionStep[] = [];
  for (const lot of compatible) {
    if (pending <= 0) break;
    const availableInUnit = convertMilli(lot.quantityMilli, lot.unit, unit);
    if (availableInUnit <= pending) {
      steps.push({ lotId: lot.id, takeMilli: lot.quantityMilli, remainingMilli: 0 });
      pending -= availableInUnit;
    } else {
      const take = convertMilli(pending, unit, lot.unit);
      const remaining = lot.quantityMilli - take;
      steps.push({ lotId: lot.id, takeMilli: take, remainingMilli: Math.max(0, remaining) });
      pending = 0;
    }
  }
  if (pending > 0) throw new AppError('insufficient_quantity', 'Not enough stock');
  return steps;
}
