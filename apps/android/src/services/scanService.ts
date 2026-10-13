import { isLookupableBarcode, normalizeBarcode, toCanonicalGtin } from '../domain/barcode';
import { AppError, isAppError } from '../domain/errors';
import type { Product } from '../domain/models';
import type { ExternalProduct, LookupResult } from '../integrations/openFoodFacts';
import type { InventoryService } from './inventoryService';
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
