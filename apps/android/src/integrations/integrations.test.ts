import { AppError } from '../domain/errors';
import { planExpiryNotifications } from '../domain/notificationPlan';
import { t } from '../i18n';
import { formatNotification } from './notifications';
import { guessCategory, lookupProduct, parseOffResponse, parsePack } from './openFoodFacts';

function fakeFetch(status: number, body: unknown): jest.MockedFunction<typeof fetch> {
  return jest.fn(async () => ({
    status,
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  })) as unknown as jest.MockedFunction<typeof fetch>;
}

describe('Open Food Facts', () => {
  const code = '3017624010701';

  it('envía solo el código de barras, sin cookies', async () => {
    const f = fakeFetch(200, { status: 1, product: { product_name: 'Crema de cacao', brands: 'Marca A, Marca B' } });
    const r = await lookupProduct(code, { fetchFn: f, userAgent: 'Stocky/test' });
    expect(r).toMatchObject({ status: 'found', product: { name: 'Crema de cacao', brand: 'Marca A' } });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toMatch(new RegExp(`^https://world\\.openfoodfacts\\.org/api/v2/product/${code}\\.json\\?fields=`));
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit' });
    expect(init?.body).toBeUndefined();
  });

  it('prefiere el nombre en español y limpia el texto externo', () => {
    const r = parseOffResponse(code, 200, {
      status: 1,
      product: {
        product_name: 'Hazelnut spread',
        product_name_es: '  Crema\n de   cacao\u0007 ',
        image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
        categories_tags: ['en:plant-based-foods-and-beverages', 'en:spreads', 'en:sweet-snacks'],
        product_quantity_unit: 'g',
      },
    });
    expect(r).toEqual({
      status: 'found',
      product: {
        barcode: code,
        name: 'Crema de cacao',
        brand: null,
        imageUrl: 'https://images.openfoodfacts.org/x.jpg',
        category: 'snacks',
        suggestedUnit: 'unit',
        packQuantityMilli: null,
        source: 'openfoodfacts',
      },
    });
  });

  it('descarta imágenes que no son HTTPS', () => {
    const r = parseOffResponse(code, 200, {
      status: 1,
      product: { product_name: 'X', image_front_small_url: 'http://inseguro/x.jpg' },
    });
    expect(r.status === 'found' && r.product.imageUrl).toBeNull();
  });

  it('trata 404 y status 0 como «no encontrado»', async () => {
    expect(await lookupProduct(code, { fetchFn: fakeFetch(404, { status: 0 }) })).toEqual({ status: 'not_found' });
    expect(await lookupProduct(code, { fetchFn: fakeFetch(200, { status: 0 }) })).toEqual({ status: 'not_found' });
    expect(await lookupProduct(code, { fetchFn: fakeFetch(404, new SyntaxError('html')) })).toEqual({
      status: 'not_found',
    });
  });

  it('distingue sin conexión, error del servidor y respuesta no válida', async () => {
    const offline = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(lookupProduct(code, { fetchFn: offline })).rejects.toMatchObject({ code: 'network_offline' });
    await expect(lookupProduct(code, { fetchFn: fakeFetch(503, {}) })).rejects.toMatchObject({ code: 'remote_error' });
    await expect(lookupProduct(code, { fetchFn: fakeFetch(200, new SyntaxError('x')) })).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(lookupProduct(code, { fetchFn: fakeFetch(200, 'texto') })).rejects.toBeInstanceOf(AppError);
  });

  it('cancela la petición si supera el tiempo máximo', async () => {
    const slow = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    await expect(lookupProduct(code, { fetchFn: slow, timeoutMs: 20 })).rejects.toMatchObject({
      code: 'network_timeout',
    });
  });

  it('no consulta códigos con formato no válido', async () => {
    const f = fakeFetch(200, {});
    await expect(lookupProduct('../../etc', { fetchFn: f })).rejects.toMatchObject({ code: 'validation' });
    expect(f).not.toHaveBeenCalled();
  });

  it('interpreta el contenido del envase', () => {
    expect(parsePack(500, 'g')).toEqual({ unit: 'g', packQuantityMilli: 500_000 });
    expect(parsePack('33', 'cl')).toEqual({ unit: 'ml', packQuantityMilli: 330_000 });
    expect(parsePack(1.5, 'L')).toEqual({ unit: 'l', packQuantityMilli: 1500 });
    expect(parsePack(6, 'unidades')).toEqual({ unit: 'unit', packQuantityMilli: null });
    expect(parsePack(null, 'g')).toEqual({ unit: 'unit', packQuantityMilli: null });
    expect(parsePack(-1, 'g')).toEqual({ unit: 'unit', packQuantityMilli: null });
  });

  it('asigna categoría por la etiqueta más específica', () => {
    expect(guessCategory(['en:dairies', 'en:frozen-foods'])).toBe('frozen');
    expect(guessCategory(['en:desconocida'])).toBe('other');
    expect(guessCategory(null)).toBe('other');
  });
});

describe('planificación de avisos', () => {
  const now = new Date(2026, 9, 13, 8, 0); // 13/10/2026 08:00 local
  const opts = { warnDays: 2, notifyHour: 9 };

  it('agrupa por día y genera aviso previo y aviso del día', () => {
    const plan = planExpiryNotifications(
      [
        { productName: 'Leche', expiryDate: '2026-10-16', expiryKind: 'use_by' },
        { productName: 'Yogur', expiryDate: '2026-10-16', expiryKind: 'use_by' },
        { productName: 'Arroz', expiryDate: null, expiryKind: 'best_before' },
      ],
      now,
      opts,
    );
    expect(plan.map((p) => [p.id, p.count])).toEqual([
      ['expiry-window-2026-10-14', 2],
      ['expiry-day-2026-10-16', 2],
    ]);
    expect(plan[0]!.fireAt).toEqual(new Date(2026, 9, 14, 9, 0));
  });

  it('omite momentos pasados y respeta el horizonte y el máximo', () => {
    const late = new Date(2026, 9, 13, 10, 0);
    const plan = planExpiryNotifications(
      [
        { productName: 'Hoy', expiryDate: '2026-10-13', expiryKind: 'use_by' },
        { productName: 'Lejos', expiryDate: '2027-06-01', expiryKind: 'use_by' },
        ...Array.from({ length: 40 }, (_, i) => ({
          productName: `P${i}`,
          expiryDate: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
          expiryKind: 'use_by' as const,
        })),
      ],
      late,
      { ...opts, maxNotifications: 10 },
    );
    expect(plan.find((p) => p.id.endsWith('2026-10-13'))).toBeUndefined();
    expect(plan.find((p) => p.id.includes('2027'))).toBeUndefined();
    expect(plan).toHaveLength(10);
  });

  it('no incluye nombres por defecto', () => {
    const n = { id: 'x', fireAt: now, kind: 'window' as const, count: 2, names: ['Leche', 'Yogur'] };
    const hidden = formatNotification(n, false);
    expect(hidden.body).toBe(t('notifications.genericBody', { count: 2 }));
    expect(hidden.body).not.toMatch(/Leche|Yogur/);
    expect(formatNotification(n, true).body).toBe('Leche y Yogur');
    const many = { ...n, count: 5, names: ['A', 'B', 'C', 'D', 'E'] };
    expect(formatNotification(many, true).body).toBe('A, B, C y 2 más');
  });
});
