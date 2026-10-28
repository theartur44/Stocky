import { isStorableBarcode, normalizeBarcode } from './barcode';
import { isValidLocalDate, type LocalDate } from './dates';
import { AppError } from './errors';
import { isExpiryKind, type ExpiryKind } from './expiry';
import { isCategory, isLocation, type Category, type Location } from './models';
import { cleanText } from './text';
import { isUnit, MAX_QUANTITY_MILLI, type Unit } from './units';

export const LIMITS = {
  name: 120,
  brand: 80,
  notes: 500,
  lotCode: 40,
  listName: 60,
} as const;

export interface ProductInput {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  category: Category;
  defaultUnit: Unit;
  defaultLocation: Location;
  /** Sitio concreto; si no se indica, el primero del tipo `defaultLocation`. */
  defaultPlaceId?: string | null;
  lowStockThresholdMilli?: number | null;
  packQuantityMilli?: number | null;
  imageUrl?: string | null;
  source?: 'manual' | 'openfoodfacts';
  notes?: string | null;
}

export interface LotInput {
  quantityMilli: number;
  unit: Unit;
  location: Location;
  /** Sitio concreto; si no se indica, el primero del tipo `location`. */
  placeId?: string | null;
  addedOn: LocalDate;
  expiryDate?: LocalDate | null;
  expiryKind: ExpiryKind;
  expiryEstimated?: boolean;
  lotCode?: string | null;
  notes?: string | null;
}

type Errors = Record<string, string>;

function optionalText(value: string | null | undefined, max: number, field: string, errors: Errors): string | null {
  if (value == null) return null;
  const v = cleanText(value);
  if (!v) return null;
  if (v.length > max) errors[field] = 'errors.tooLong';
  return v;
}

const isPlaceId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

function isValidQuantity(milli: unknown): milli is number {
  return typeof milli === 'number' && Number.isSafeInteger(milli) && milli > 0 && milli <= MAX_QUANTITY_MILLI;
}

/**
 * Solo se muestran imágenes de Open Food Facts por HTTPS. Una dirección de
 * otro sitio (p. ej. puesta por otro móvil del hogar) haría que cada móvil
 * conectara con él al ver el producto: revelaría su IP o haría peticiones a
 * aparatos de la red de casa. Se usa una expresión regular porque la
 * implementación de `URL` de React Native es parcial.
 */
export function isSafeImageUrl(url: string): boolean {
  return url.length <= 500 && /^https:\/\/(images|static)\.openfoodfacts\.org\/[^\s"'<>?#\\]*$/i.test(url) && !url.includes('..');
}

export function validateProductInput(input: ProductInput): Required<ProductInput> {
  const errors: Errors = {};
  const name = cleanText(input.name ?? '');
  if (!name) errors.name = 'errors.required';
  else if (name.length > LIMITS.name) errors.name = 'errors.tooLong';

  const brand = optionalText(input.brand, LIMITS.brand, 'brand', errors);
  const notes = optionalText(input.notes, LIMITS.notes, 'notes', errors);

  let barcode: string | null = null;
  if (input.barcode) {
    barcode = normalizeBarcode(input.barcode);
    if (!isStorableBarcode(barcode)) errors.barcode = 'errors.invalidBarcode';
  }
  if (!isCategory(input.category)) errors.category = 'errors.invalidValue';
  if (!isUnit(input.defaultUnit)) errors.defaultUnit = 'errors.invalidValue';
  if (!isLocation(input.defaultLocation)) errors.defaultLocation = 'errors.invalidValue';

  const threshold = input.lowStockThresholdMilli ?? null;
  if (threshold !== null && !isValidQuantity(threshold)) errors.lowStockThresholdMilli = 'errors.invalidQuantity';

  let pack = input.packQuantityMilli ?? null;
  // El tamaño de envase solo tiene sentido con peso o volumen.
  if (pack !== null && (!isValidQuantity(pack) || input.defaultUnit === 'unit')) pack = null;

  let imageUrl = input.imageUrl ?? null;
  if (imageUrl !== null && !isSafeImageUrl(imageUrl)) imageUrl = null;

  if (Object.keys(errors).length > 0) throw new AppError('validation', 'Invalid product input', errors);

  return {
    name,
    brand,
    barcode,
    category: input.category,
    defaultUnit: input.defaultUnit,
    defaultLocation: input.defaultLocation,
    defaultPlaceId: isPlaceId(input.defaultPlaceId) ? input.defaultPlaceId : null,
    lowStockThresholdMilli: threshold,
    packQuantityMilli: pack,
    imageUrl,
    source: input.source === 'openfoodfacts' ? 'openfoodfacts' : 'manual',
    notes,
  };
}

export function validateLotInput(input: LotInput): Required<LotInput> {
  const errors: Errors = {};
  if (!isValidQuantity(input.quantityMilli)) errors.quantity = 'errors.invalidQuantity';
  if (!isUnit(input.unit)) errors.unit = 'errors.invalidValue';
  if (!isLocation(input.location)) errors.location = 'errors.invalidValue';
  if (!isValidLocalDate(input.addedOn)) errors.addedOn = 'errors.invalidDate';
  const expiryDate = input.expiryDate ?? null;
  if (expiryDate !== null && !isValidLocalDate(expiryDate)) errors.expiryDate = 'errors.invalidDate';
  if (!isExpiryKind(input.expiryKind)) errors.expiryKind = 'errors.invalidValue';
  const lotCode = optionalText(input.lotCode, LIMITS.lotCode, 'lotCode', errors);
  const notes = optionalText(input.notes, LIMITS.notes, 'notes', errors);

  if (Object.keys(errors).length > 0) throw new AppError('validation', 'Invalid lot input', errors);

  return {
    quantityMilli: input.quantityMilli,
    unit: input.unit,
    location: input.location,
    placeId: isPlaceId(input.placeId) ? input.placeId : null,
    addedOn: input.addedOn,
    expiryDate,
    expiryKind: input.expiryKind,
    expiryEstimated: expiryDate !== null && input.expiryEstimated === true,
    lotCode,
    notes,
  };
}

export function validateListName(name: string): string {
  const v = cleanText(name);
  if (!v) throw new AppError('validation', 'Invalid list name', { name: 'errors.required' });
  if (v.length > LIMITS.listName) throw new AppError('validation', 'Invalid list name', { name: 'errors.tooLong' });
  return v;
}

export function validateItemName(name: string): string {
  const v = cleanText(name);
  if (!v) throw new AppError('validation', 'Invalid item name', { name: 'errors.required' });
  if (v.length > LIMITS.name) throw new AppError('validation', 'Invalid item name', { name: 'errors.tooLong' });
  return v;
}

export function assertValidQuantity(milli: number, field = 'quantity'): void {
  if (!isValidQuantity(milli)) throw new AppError('validation', 'Invalid quantity', { [field]: 'errors.invalidQuantity' });
}
