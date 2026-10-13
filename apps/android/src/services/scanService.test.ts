import { AppError } from '../domain/errors';
import { milk, setupServices } from '../test-utils/fixtures';
import { resolveScan } from './scanService';

const EAN = '3017624010701';

describe('flujo del escáner', () => {
  it('rechaza códigos no válidos sin consultar fuera', async () => {
    const s = await setupServices();
    const lookup = jest.fn();
    expect(await resolveScan('3017624010702', 'ean13', { ...s, lookup })).toEqual({ kind: 'invalid' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('usa el catálogo local antes que la consulta externa', async () => {
    const s = await setupServices();
    await s.inventory.createProduct({ ...milk, barcode: EAN });
    const lookup = jest.fn();
    const r = await resolveScan(EAN, 'ean13', { ...s, lookup });
    expect(r.kind).toBe('known');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('no consulta fuera sin consentimiento o si se ha denegado', async () => {
    const s = await setupServices();
    const lookup = jest.fn();
    expect(await resolveScan(EAN, 'ean13', { ...s, lookup })).toEqual({ kind: 'needs_consent', code: EAN });
    await s.settings.setLookupConsent(false);
    expect(await resolveScan(EAN, 'ean13', { ...s, lookup })).toEqual({ kind: 'lookup_disabled', code: EAN });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('no consulta códigos internos de tienda', async () => {
    const s = await setupServices();
    await s.settings.setLookupConsent(true);
    const lookup = jest.fn();
    expect(await resolveScan('2000000000008', 'ean13', { ...s, lookup })).toEqual({ kind: 'internal' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('devuelve el producto encontrado o «no encontrado»', async () => {
    const s = await setupServices();
    await s.settings.setLookupConsent(true);
    const external = {
      barcode: EAN,
      name: 'Crema',
      brand: null,
      imageUrl: null,
      category: 'snacks' as const,
      suggestedUnit: 'g' as const,
      packQuantityMilli: 400_000,
      source: 'openfoodfacts' as const,
    };
    const found = await resolveScan(EAN, 'ean13', { ...s, lookup: async () => ({ status: 'found', product: external }) });
    expect(found).toEqual({ kind: 'found', code: EAN, external });
    const missing = await resolveScan(EAN, 'ean13', { ...s, lookup: async () => ({ status: 'not_found' }) });
    expect(missing).toEqual({ kind: 'not_found', code: EAN });
  });

  it('sin conexión permite continuar a mano conservando el código', async () => {
    const s = await setupServices();
    await s.settings.setLookupConsent(true);
    const r = await resolveScan(EAN, 'ean13', {
      ...s,
      lookup: async () => {
        throw new AppError('network_offline', 'offline');
      },
    });
    expect(r).toMatchObject({ kind: 'error', code: EAN, error: { code: 'network_offline' } });
  });

  it('expande UPC-E antes de buscar', async () => {
    const s = await setupServices();
    await s.settings.setLookupConsent(true);
    const lookup = jest.fn(async () => ({ status: 'not_found' as const }));
    await resolveScan('04252614', 'upc_e', { ...s, lookup });
    expect(lookup).toHaveBeenCalledWith('042100005264');
  });
});
