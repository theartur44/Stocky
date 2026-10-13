import { lotRepo, productRepo } from '../data/repositories';
import type { SqlExecutor } from '../data/sql';
import { isLookupableBarcode, normalizeBarcode, toCanonicalGtin } from '../domain/barcode';
import { toLocalDate } from '../domain/dates';
import { AppError, isAppError } from '../domain/errors';
import type { Product } from '../domain/models';
import { lineQuantity, placeholderName, type ScanLine } from '../domain/scanSession';
import { validateLotInput, validateProductInput } from '../domain/validation';
import type { ExternalProduct, LookupResult } from '../integrations/openFoodFacts';
import { nowIso, type ServiceContext } from './context';
import type { InventoryService } from './inventoryService';
import { addItemTx } from './shoppingService';
import type { SettingsService } from './settingsService';

export type ScanOutcome =
  | { kind: 'invalid' }
  /** Código interno de tienda (peso/precio): no identifica un producto. */
  | { kind: 'internal' }
  /** Ya está en el catálogo local: no se consulta nada fuera. */
  | { kind: 'known'; code: string; product: Product }
  /** Falta la decisión del usuario sobre la consulta externa. */
  | { kind: 'needs_consent'; code: string }
  | { kind: 'lookup_disabled'; code: string }
  | { kind: 'found'; code: string; external: ExternalProduct }
  | { kind: 'not_found'; code: string }
  | { kind: 'error'; code: string; error: AppError };

export interface ScanDeps {
  inventory: Pick<InventoryService, 'getProductByBarcode'>;
  settings: Pick<SettingsService, 'get'>;
  lookup: (code: string) => Promise<LookupResult>;
}

/**
 * Decide qué hacer con un código escaneado. Orden: validar → catálogo local →
 * consentimiento → consulta externa. La consulta externa solo ocurre si el
 * producto no está en el dispositivo y el usuario la ha permitido.
 */
export async function resolveScan(raw: string, scannedType: string | undefined, deps: ScanDeps): Promise<ScanOutcome> {
  const code = toCanonicalGtin(raw, scannedType);
  if (!code) {
    // Códigos no GTIN (p. ej. Code 128 de tienda): se permite buscarlos en local.
    const plain = normalizeBarcode(raw);
    if (/^[0-9A-Za-z]{4,48}$/.test(plain)) {
      const local = await deps.inventory.getProductByBarcode(plain);
      if (local) return { kind: 'known', code: plain, product: local };
    }
    return { kind: 'invalid' };
  }

  const local = await deps.inventory.getProductByBarcode(code);
  if (local) return { kind: 'known', code, product: local };
  if (!isLookupableBarcode(code)) return { kind: 'internal' };

  const settings = await deps.settings.get();
  if (settings.productLookupConsent === 'unknown') return { kind: 'needs_consent', code };
  if (settings.productLookupConsent === 'denied') return { kind: 'lookup_disabled', code };

  try {
    const result = await deps.lookup(code);
    return result.status === 'found' ? { kind: 'found', code, external: result.product } : { kind: 'not_found', code };
  } catch (e) {
    return { kind: 'error', code, error: isAppError(e) ? e : new AppError('remote_error', 'Lookup failed') };
  }
}

// ------------------------------------------------------------------ guardado de la sesión

/**
 * Producto del catálogo para una línea escaneada: el ya vinculado, uno con el
 * mismo código o uno nuevo con los datos de la línea.
 */
async function ensureProduct(tx: SqlExecutor, ctx: ServiceContext, line: ScanLine, now: string): Promise<Product> {
  if (line.productId) {
    const p = await productRepo.get(tx, line.productId);
    if (p) return p;
  }
  const byCode = await productRepo.getByBarcode(tx, line.code);
  if (byCode) return byCode;
  const q = lineQuantity(line);
  const input = validateProductInput({
    name: line.name || placeholderName(line.code),
    brand: line.brand,
    barcode: line.code,
    category: line.category,
    defaultUnit: q.unit,
    defaultLocation: line.location,
    packQuantityMilli: q.unit === 'unit' ? null : line.packQuantityMilli,
    imageUrl: line.imageUrl,
    source: line.source,
  });
  return productRepo.insert(tx, ctx.newId(), input, now);
}

export function createScanService(ctx: ServiceContext) {
  return {
    /**
     * Guarda la sesión en el inventario: un lote por línea. Todo o nada: si
     * una línea falla, no se guarda ninguna y la sesión sigue intacta.
     */
    async saveToInventory(lines: ScanLine[]): Promise<number> {
      if (lines.length === 0) return 0;
      const today = toLocalDate(ctx.clock());
      const n = await ctx.db.transaction(async (tx) => {
        const now = nowIso(ctx);
        for (const line of lines) {
          const product = await ensureProduct(tx, ctx, line, now);
          const q = lineQuantity(line);
          const lot = validateLotInput({
            quantityMilli: q.quantityMilli,
            unit: q.unit,
            location: line.location,
            addedOn: today,
            expiryDate: line.expiryDate,
            expiryKind: line.expiryKind,
            expiryEstimated: line.expiryEstimated,
          });
          await lotRepo.insert(tx, ctx.newId(), product.id, lot, now);
        }
        return lines.length;
      });
      ctx.onChange?.('inventory');
      return n;
    },

    /** Añade la sesión a una lista de la compra (uniendo duplicados). */
    async saveToShoppingList(listId: string, lines: ScanLine[]): Promise<number> {
      if (lines.length === 0) return 0;
      const n = await ctx.db.transaction(async (tx) => {
        const now = nowIso(ctx);
        for (const line of lines) {
          const product = await ensureProduct(tx, ctx, line, now);
          await addItemTx(tx, ctx, listId, {
            name: product.name,
            productId: product.id,
            quantityMilli: line.count * 1000,
            unit: 'unit',
          });
        }
        return lines.length;
      });
      ctx.onChange?.('all');
      return n;
    },
  };
}

export type ScanService = ReturnType<typeof createScanService>;
