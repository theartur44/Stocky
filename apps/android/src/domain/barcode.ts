/**
 * Validación de códigos GTIN (EAN-8, UPC-A, EAN-13, GTIN-14).
 *
 * Un código de barras de producto identifica el artículo comercial, no la
 * unidad concreta: no contiene la fecha de caducidad, el lote ni la cantidad
 * que queda en casa.
 */
const GTIN_LENGTHS = [8, 12, 13, 14];

export function normalizeBarcode(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

export function hasValidGtinChecksum(code: string): boolean {
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Desde la derecha, los pesos alternan 3, 1, 3, 1…
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += digits[i]! * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Códigos aptos para consultar en una base de datos de productos.
 * Se excluyen los prefijos de uso interno de tienda (20-29 en EAN-13 y 2 en
 * EAN-8), que suelen codificar peso o precio y no identifican un producto.
 */
export function isLookupableBarcode(code: string): boolean {
  if (!hasValidGtinChecksum(code)) return false;
  if (code.length === 13 && code.startsWith('2')) return false;
  if (code.length === 8 && code.startsWith('2')) return false;
  return true;
}

/** Formato aceptado para guardar un código introducido a mano. */
export function isStorableBarcode(code: string): boolean {
  return /^[0-9A-Za-z]{4,48}$/.test(code);
}
