import { expandUpcE, hasValidGtinChecksum, isLookupableBarcode, normalizeBarcode, toCanonicalGtin } from './barcode';
import { addDays, atLocalTime, daysBetween, formatLocalDate, isValidLocalDate, parseUserDate, toLocalDate } from './dates';
import { AppError } from './errors';
import { compareByExpiry, getExpiryStatus } from './expiry';
import { normalizeKey, tokens } from './text';
import {
  addQuantities,
  areCompatible,
  convertMilli,
  formatMilli,
  formatQuantity,
  parseQuantity,
} from './units';
import { isSafeImageUrl, validateLotInput, validateProductInput } from './validation';

describe('unidades y cantidades', () => {
  it('interpreta cantidades con coma o punto', () => {
    expect(parseQuantity('1,5')).toBe(1500);
    expect(parseQuantity('1.5')).toBe(1500);
    expect(parseQuantity(' 2 ')).toBe(2000);
    expect(parseQuantity('0,125')).toBe(125);
  });

  it('rechaza cantidades no válidas', () => {
    for (const bad of ['', '0', '-1', 'abc', '1,2345', '1e3', '1,5,2', '9999999999']) {
      expect(parseQuantity(bad)).toBeNull();
    }
  });

  it('convierte solo entre unidades compatibles', () => {
    expect(convertMilli(1500, 'kg', 'g')).toBe(1_500_000);
    expect(convertMilli(250_000, 'ml', 'l')).toBe(250);
    expect(areCompatible('g', 'ml')).toBe(false);
    expect(() => convertMilli(1000, 'unit', 'g')).toThrow(AppError);
  });

  it('suma sin errores de coma flotante', () => {
    // 0,1 + 0,2 en flotantes da 0,30000000000000004; en milésimas es exacto.
    expect(addQuantities({ milli: 100, unit: 'l' }, { milli: 200, unit: 'l' })).toBe(300);
    expect(addQuantities({ milli: 1000, unit: 'kg' }, { milli: 500_000, unit: 'g' })).toBe(1500);
  });

  it('formatea en español', () => {
    expect(formatMilli(1500)).toBe('1,5');
    expect(formatMilli(2000)).toBe('2');
    expect(formatMilli(125)).toBe('0,125');
    expect(formatQuantity(3000, 'unit')).toBe('3 ud.');
  });
});

describe('fechas', () => {
  it('valida fechas de calendario reales', () => {
    expect(isValidLocalDate('2024-02-29')).toBe(true);
    expect(isValidLocalDate('2023-02-29')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('2026-1-01')).toBe(false);
  });

  it('calcula días atravesando cambios de hora y de año', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // cambio de hora en España
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-10-13', '2026-10-10')).toBe(-3);
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('interpreta fechas escritas por el usuario', () => {
    expect(parseUserDate('13/10/2026')).toBe('2026-10-13');
    expect(parseUserDate('1-2-26')).toBe('2026-02-01');
    expect(parseUserDate('2026-10-13')).toBe('2026-10-13');
    expect(parseUserDate('31/02/2026')).toBeNull();
    expect(parseUserDate('mañana')).toBeNull();
    expect(formatLocalDate('2026-10-13')).toBe('13/10/2026');
  });

  it('convierte entre instante y fecha local', () => {
    const d = atLocalTime('2026-10-13', 9, 30);
    expect(d.getHours()).toBe(9);
    expect(toLocalDate(d)).toBe('2026-10-13');
  });
});

describe('caducidades', () => {
  const today = '2026-10-13';
  it('distingue caducidad y consumo preferente', () => {
    expect(getExpiryStatus({ expiryDate: '2026-10-12', expiryKind: 'use_by' }, today, 2)).toBe('expired');
    expect(getExpiryStatus({ expiryDate: '2026-10-12', expiryKind: 'best_before' }, today, 2)).toBe(
      'best_before_passed',
    );
  });

  it('respeta el margen de aviso', () => {
    expect(getExpiryStatus({ expiryDate: today, expiryKind: 'use_by' }, today, 2)).toBe('today');
    expect(getExpiryStatus({ expiryDate: '2026-10-15', expiryKind: 'use_by' }, today, 2)).toBe('soon');
    expect(getExpiryStatus({ expiryDate: '2026-10-16', expiryKind: 'use_by' }, today, 2)).toBe('ok');
    expect(getExpiryStatus({ expiryDate: null, expiryKind: 'use_by' }, today, 2)).toBe('none');
  });

  it('ordena por proximidad dejando al final los que no tienen fecha', () => {
    const items = [
      { expiryDate: null, expiryKind: 'use_by' as const },
      { expiryDate: '2026-11-01', expiryKind: 'use_by' as const },
      { expiryDate: '2026-10-01', expiryKind: 'best_before' as const },
    ];
    expect(items.sort(compareByExpiry).map((i) => i.expiryDate)).toEqual(['2026-10-01', '2026-11-01', null]);
  });
});

describe('códigos de barras', () => {
  it('comprueba el dígito de control GTIN', () => {
    expect(hasValidGtinChecksum('3017624010701')).toBe(true); // EAN-13
    expect(hasValidGtinChecksum('3017624010702')).toBe(false);
    expect(hasValidGtinChecksum('96385074')).toBe(true); // EAN-8
    expect(hasValidGtinChecksum('036000291452')).toBe(true); // UPC-A
    expect(hasValidGtinChecksum('12345')).toBe(false);
  });

  it('no consulta códigos internos de tienda (peso/precio)', () => {
    expect(isLookupableBarcode('2000000000008')).toBe(false);
    expect(isLookupableBarcode('3017624010701')).toBe(true);
    expect(normalizeBarcode(' 301 7624-010701 ')).toBe('3017624010701');
  });

  it('expande UPC-E a UPC-A', () => {
    expect(expandUpcE('04252614')).toBe('042100005264');
    expect(expandUpcE('01234565')).toBe('012345000065');
    expect(expandUpcE('04252615')).toBeNull(); // dígito de control incorrecto
    expect(toCanonicalGtin('04252614')).toBe('042100005264');
    expect(toCanonicalGtin('3017624010701')).toBe('3017624010701');
    expect(toCanonicalGtin('abc')).toBeNull();
  });
});

describe('texto', () => {
  it('normaliza nombres para comparar', () => {
    expect(normalizeKey('  Tomates   Cherry ')).toBe('tomates cherry');
    expect(normalizeKey('Plátano de Canarias')).toBe('platano de canarias');
    expect(tokens('Tomates con Limones')).toEqual(['tomate', 'limon']);
  });
});

describe('validación', () => {
  it('normaliza y valida un producto', () => {
    const p = validateProductInput({
      name: '  Leche   entera ',
      brand: '',
      barcode: '301 7624010701',
      category: 'dairy_eggs',
      defaultUnit: 'l',
      defaultLocation: 'fridge',
      imageUrl: 'http://inseguro.example/x.jpg',
    });
    expect(p.name).toBe('Leche entera');
    expect(p.brand).toBeNull();
    expect(p.barcode).toBe('3017624010701');
    expect(p.imageUrl).toBeNull(); // solo HTTPS
  });

  it('acumula errores por campo', () => {
    try {
      validateProductInput({
        name: ' ',
        category: 'x' as never,
        defaultUnit: 'kg',
        defaultLocation: 'fridge',
      });
      throw new Error('debería fallar');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).fields).toEqual({ name: 'errors.required', category: 'errors.invalidValue' });
    }
  });

  it('rechaza lotes con cantidad o fecha incorrecta', () => {
    expect(() =>
      validateLotInput({
        quantityMilli: 0,
        unit: 'g',
        location: 'pantry',
        addedOn: '2026-10-13',
        expiryDate: '2026-02-30',
        expiryKind: 'use_by',
      }),
    ).toThrow(AppError);
  });

  it('solo marca como estimada una fecha existente', () => {
    const lot = validateLotInput({
      quantityMilli: 1000,
      unit: 'unit',
      location: 'pantry',
      addedOn: '2026-10-13',
      expiryDate: null,
      expiryKind: 'best_before',
      expiryEstimated: true,
    });
    expect(lot.expiryEstimated).toBe(false);
  });

  it('acepta solo URLs de imagen HTTPS bien formadas', () => {
    expect(isSafeImageUrl('https://images.openfoodfacts.org/images/products/301/762/401/0701/front_es.jpg')).toBe(true);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('https://x.org/a b')).toBe(false);
    // Solo Open Food Facts: nada de rastreadores ni aparatos de la red local.
    expect(isSafeImageUrl('https://tracker.example/p.gif?u=1')).toBe(false);
    expect(isSafeImageUrl('https://192.168.1.1/cgi-bin/x')).toBe(false);
    expect(isSafeImageUrl('https://images.openfoodfacts.org.evil.example/x.jpg')).toBe(false);
    expect(isSafeImageUrl('https://images.openfoodfacts.org:8443/x.jpg')).toBe(false);
  });
});

describe('enlaces externos', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { externalPath } = require('../app/+native-intent') as typeof import('../app/+native-intent');
  it('solo abren Inicio o «Caduca pronto», sin parámetros', () => {
    expect(externalPath('stocky://expiring')).toBe('/expiring');
    expect(externalPath('stocky:///expiring?x=%E0%A4%A')).toBe('/expiring');
    expect(externalPath('stocky://product/new?name=Hola&imageUrl=https://evil.example/x.gif')).toBe('/');
    expect(externalPath('stocky://scan')).toBe('/');
    expect(externalPath('stocky://')).toBe('/');
    expect(externalPath('/expiring#a')).toBe('/expiring');
  });
});
