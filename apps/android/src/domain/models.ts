import type { LocalDate } from './dates';
import type { ExpiryKind } from './expiry';
import type { Unit } from './units';

export const LOCATIONS = ['fridge', 'freezer', 'pantry', 'other'] as const;
export type Location = (typeof LOCATIONS)[number];

export const CATEGORIES = [
  'fruit_veg',
  'meat_fish',
  'dairy_eggs',
  'bakery',
  'grains_pasta',
  'canned',
  'frozen',
  'drinks',
  'snacks',
  'condiments',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ProductSource = 'manual' | 'openfoodfacts';

/** Entrada del catálogo: qué es el producto. */
export interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  category: Category;
  defaultUnit: Unit;
  defaultLocation: Location;
  /** Sitio concreto donde se suele guardar (de entre los del usuario). */
  defaultPlaceId: string | null;
  /** Umbral de «pocas existencias» en milésimas de `defaultUnit`. */
  lowStockThresholdMilli: number | null;
  /** Contenido de un envase en milésimas de `defaultUnit` (null si se cuenta por unidades o no se sabe). */
  packQuantityMilli: number | null;
  imageUrl: string | null;
  source: ProductSource;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lote de existencias: cuánto hay, dónde y hasta cuándo. */
export interface StockLot {
  id: string;
  productId: string;
  quantityMilli: number;
  unit: Unit;
  /** Tipo de sitio (nevera, congelador…); coincide con el del sitio `placeId`. */
  location: Location;
  /** Sitio concreto («Nevera cocina», «Trastero»…). */
  placeId: string | null;
  addedOn: LocalDate;
  expiryDate: LocalDate | null;
  expiryKind: ExpiryKind;
  /** La fecha es una estimación del usuario, no la impresa en el envase. */
  expiryEstimated: boolean;
  /** Código de lote del fabricante, si el usuario lo anota. */
  lotCode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockLotWithProduct extends StockLot {
  product: Pick<Product, 'id' | 'name' | 'brand' | 'category'>;
}

export interface ProductStockSummary {
  product: Product;
  lots: StockLot[];
  /** Total en `product.defaultUnit`, sumando solo lotes de unidad compatible. */
  totalMilli: number;
  /** Lotes con unidad incompatible con la unidad por defecto (no sumados). */
  incompatibleLots: number;
  nearestExpiry: LocalDate | null;
  isLowStock: boolean;
}

export interface ShoppingList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  productId: string | null;
  name: string;
  quantityMilli: number;
  unit: Unit;
  checked: boolean;
  checkedAt: string | null;
  /** Se rellena solo cuando el artículo se ha incorporado al inventario. */
  transferredAt: string | null;
  transferredLotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isLocation(v: unknown): v is Location {
  return typeof v === 'string' && (LOCATIONS as readonly string[]).includes(v);
}

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}
