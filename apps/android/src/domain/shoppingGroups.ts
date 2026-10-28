import { CATEGORIES, type Category, type ShoppingItem } from './models';

export interface ItemGroup {
  category: Category;
  items: ShoppingItem[];
}

/**
 * Agrupa los artículos por categoría (en el orden habitual de las tiendas:
 * el de `CATEGORIES`). Los que no están en el catálogo van a «otros».
 */
export function groupByCategory(items: readonly ShoppingItem[], categoryOf: (productId: string) => Category | undefined): ItemGroup[] {
  const groups = new Map<Category, ShoppingItem[]>();
  for (const item of items) {
    const c = (item.productId && categoryOf(item.productId)) || 'other';
    groups.set(c, [...(groups.get(c) ?? []), item]);
  }
  return CATEGORIES.filter((c) => groups.has(c)).map((category) => ({ category, items: groups.get(category)! }));
}

/** Texto de la lista para compartir (WhatsApp, correo…): solo lo pendiente de comprar. */
export function shoppingListText(
  title: string,
  groups: readonly ItemGroup[],
  labels: { category: (c: Category) => string; item: (i: ShoppingItem) => string },
): string {
  const lines = [`🛒 ${title}`];
  for (const g of groups) {
    lines.push('', `${labels.category(g.category)}:`);
    for (const item of g.items) lines.push(`• ${labels.item(item)}`);
  }
  return lines.join('\n');
}
