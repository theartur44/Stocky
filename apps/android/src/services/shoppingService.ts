import { lotRepo, productRepo, shoppingRepo } from '../data/repositories';
import type { SqlExecutor } from '../data/sql';
import { toLocalDate, type LocalDate } from '../domain/dates';
import { AppError } from '../domain/errors';
import type { ExpiryKind } from '../domain/expiry';
import type { Location, Product, ShoppingItem, ShoppingList } from '../domain/models';
import { normalizeKey } from '../domain/text';
import { addQuantities, areCompatible, type Unit } from '../domain/units';
import {
  assertValidQuantity,
  validateItemName,
  validateListName,
  validateLotInput,
  validateProductInput,
} from '../domain/validation';
import { nowIso, type ServiceContext } from './context';

export const DEFAULT_LIST_NAME = 'Lista de la compra';

export interface NewItem {
  name: string;
  productId?: string | null;
  quantityMilli: number;
  unit: Unit;
}

export interface TransferOverride {
  location?: Location;
  expiryDate?: LocalDate | null;
  expiryKind?: ExpiryKind;
  expiryEstimated?: boolean;
}

export interface AddItemResult {
  item: ShoppingItem;
  /** `true` si se ha sumado a un artículo pendiente en vez de crear otro. */
  merged: boolean;
}

/**
 * Añade un artículo dentro de una transacción ya abierta. Si ya hay uno
 * pendiente del mismo producto (o con el mismo nombre) y unidad compatible,
 * suma la cantidad en lugar de duplicarlo.
 */
export async function addItemTx(
  tx: SqlExecutor,
  ctx: ServiceContext,
  listId: string,
  input: NewItem,
): Promise<AddItemResult> {
  const name = validateItemName(input.name);
  assertValidQuantity(input.quantityMilli);
  const productId = input.productId ?? null;
  if (!(await shoppingRepo.getList(tx, listId))) throw new AppError('not_found', 'List not found');
  const now = nowIso(ctx);
  const matches = await shoppingRepo.pendingMatches(tx, listId, productId, normalizeKey(name));
  const target = matches.find((m) => areCompatible(m.unit, input.unit));
  if (target) {
    const total = addQuantities(
      { milli: target.quantityMilli, unit: target.unit },
      { milli: input.quantityMilli, unit: input.unit },
    );
    await shoppingRepo.setItemQuantity(tx, target.id, total, target.unit, now);
    if (productId && !target.productId) await shoppingRepo.setProduct(tx, target.id, productId, now);
    return { item: (await shoppingRepo.getItem(tx, target.id))!, merged: true };
  }
  const id = ctx.newId();
  await shoppingRepo.insertItem(tx, { id, listId, productId, name, quantityMilli: input.quantityMilli, unit: input.unit }, now);
  return { item: (await shoppingRepo.getItem(tx, id))!, merged: false };
}

export function createShoppingService(ctx: ServiceContext) {
  const { db } = ctx;
  const changed = (scope: 'shopping' | 'all' = 'shopping') => ctx.onChange?.(scope);

  return {
    lists: () => shoppingRepo.lists(db),
    getList: (id: string) => shoppingRepo.getList(db, id),
    items: (listId: string) => shoppingRepo.items(db, listId),

    /** Garantiza que exista al menos una lista y devuelve la primera. */
    async ensureDefaultList(): Promise<ShoppingList> {
      const list = await db.transaction(async (tx) => {
        const lists = await shoppingRepo.lists(tx);
        return lists[0] ?? shoppingRepo.insertList(tx, ctx.newId(), DEFAULT_LIST_NAME, nowIso(ctx));
      });
      return list;
    },

    async createList(name: string): Promise<ShoppingList> {
      const n = validateListName(name);
      const list = await db.transaction((tx) => shoppingRepo.insertList(tx, ctx.newId(), n, nowIso(ctx)));
      changed();
      return list;
    },

    async renameList(id: string, name: string): Promise<void> {
      const n = validateListName(name);
      const changes = await db.transaction((tx) => shoppingRepo.renameList(tx, id, n, nowIso(ctx)));
      if (changes === 0) throw new AppError('not_found', 'List not found');
      changed();
    },

    async deleteList(id: string): Promise<void> {
      await db.transaction((tx) => shoppingRepo.deleteList(tx, id));
      changed();
    },

    /**
     * Añade un artículo. Si ya hay uno pendiente del mismo producto (o con el
     * mismo nombre) y unidad compatible, suma la cantidad en lugar de duplicarlo.
     */
    async addItem(listId: string, input: NewItem): Promise<AddItemResult> {
      const result = await db.transaction((tx) => addItemTx(tx, ctx, listId, input));
      changed();
      return result;
    },

    async updateItem(id: string, data: { name: string; quantityMilli: number; unit: Unit }): Promise<void> {
      const name = validateItemName(data.name);
      assertValidQuantity(data.quantityMilli);
      const n = await db.transaction((tx) =>
        shoppingRepo.updateItem(tx, id, { name, quantityMilli: data.quantityMilli, unit: data.unit }, nowIso(ctx)),
      );
      if (n === 0) throw new AppError('already_transferred', 'Item not editable');
      changed();
    },

    async setChecked(id: string, checked: boolean): Promise<void> {
      const n = await db.transaction((tx) => shoppingRepo.setChecked(tx, id, checked, nowIso(ctx)));
      if (n === 0) throw new AppError('already_transferred', 'Item not editable');
      changed();
    },

    async removeItem(id: string): Promise<void> {
      await db.transaction((tx) => shoppingRepo.deleteItem(tx, id));
      changed();
    },

    /** Limpia de la lista los artículos ya incorporados al inventario. */
    async clearTransferred(listId: string): Promise<number> {
      const n = await db.transaction((tx) => shoppingRepo.deleteTransferred(tx, listId));
      changed();
      return n;
    },

    /**
     * Pasa al inventario todos los artículos marcados y aún no incorporados.
     *
     * Todo ocurre en una única transacción: si falla cualquier artículo, no se
     * incorpora ninguno y ninguno queda marcado como incorporado. Repetir la
     * llamada es seguro: los artículos ya incorporados se ignoran.
     */
    async transferChecked(listId: string, overrides: Record<string, TransferOverride> = {}): Promise<number> {
      const count = await db.transaction(async (tx) => {
        const now = nowIso(ctx);
        const today = toLocalDate(ctx.clock());
        const items = (await shoppingRepo.items(tx, listId)).filter((i) => i.checked && !i.transferredAt);
        for (const item of items) {
          const product = await resolveProduct(tx, item, now);
          const o = overrides[item.id] ?? {};
          const lot = validateLotInput({
            quantityMilli: item.quantityMilli,
            unit: item.unit,
            location: o.location ?? product.defaultLocation,
            addedOn: today,
            expiryDate: o.expiryDate ?? null,
            expiryKind: o.expiryKind ?? 'use_by',
            expiryEstimated: o.expiryEstimated ?? false,
          });
          const lotId = ctx.newId();
          await lotRepo.insert(tx, lotId, product.id, lot, now);
          const n = await shoppingRepo.markTransferred(tx, item.id, lotId, now);
          if (n !== 1) throw new AppError('conflict', 'Item changed during transfer');
        }
        return items.length;
      });
      if (count > 0) changed('all');
      return count;
    },
  };

  /** Producto del artículo: el vinculado, uno con el mismo nombre o uno nuevo. */
  async function resolveProduct(
    tx: Parameters<typeof productRepo.get>[0],
    item: ShoppingItem,
    now: string,
  ): Promise<Product> {
    if (item.productId) {
      const p = await productRepo.get(tx, item.productId);
      if (p) return p;
    }
    let product = await productRepo.findByNameKey(tx, normalizeKey(item.name));
    product ??= await productRepo.insert(
      tx,
      ctx.newId(),
      validateProductInput({
        name: item.name,
        category: 'other',
        defaultUnit: item.unit,
        defaultLocation: 'pantry',
      }),
      now,
    );
    await shoppingRepo.setProduct(tx, item.id, product.id, now);
    return product;
  }
}

export type ShoppingService = ReturnType<typeof createShoppingService>;
