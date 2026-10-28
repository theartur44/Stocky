import type { ShoppingItem } from './models';
import { groupByCategory, shoppingListText } from './shoppingGroups';

const item = (name: string, productId: string | null = null): ShoppingItem =>
  ({ id: name, listId: 'l', productId, name, quantityMilli: 1000, unit: 'unit', checked: false, checkedAt: null, transferredAt: null, transferredLotId: null, createdAt: '', updatedAt: '' }) as ShoppingItem;

describe('lista de la compra agrupada', () => {
  it('agrupa por categoría en orden de tienda y comparte como texto', () => {
    const cats: Record<string, 'dairy_eggs' | 'fruit_veg'> = { p1: 'dairy_eggs', p2: 'fruit_veg' };
    const groups = groupByCategory([item('Leche', 'p1'), item('Pilas'), item('Tomates', 'p2')], (id) => cats[id]);
    expect(groups.map((g) => [g.category, g.items.map((i) => i.name)])).toEqual([
      ['fruit_veg', ['Tomates']],
      ['dairy_eggs', ['Leche']],
      ['other', ['Pilas']],
    ]);
    const text = shoppingListText('Lista', groups, { category: (c) => c.toUpperCase(), item: (i) => i.name });
    expect(text.split('\n')[0]).toBe('🛒 Lista');
    expect(text).toContain('• Tomates');
  });
});
