import { parseQuickAdd } from './quickAdd';

describe('entrada rápida de la lista', () => {
  it.each([
    ['leche', { name: 'leche', quantityMilli: 1000, unit: 'unit' }],
    ['2 leche', { name: 'leche', quantityMilli: 2000, unit: 'unit' }],
    ['leche 2', { name: 'leche', quantityMilli: 2000, unit: 'unit' }],
    ['500 g arroz', { name: 'arroz', quantityMilli: 500_000, unit: 'g' }],
    ['arroz 1,5kg', { name: 'arroz', quantityMilli: 1500, unit: 'kg' }],
    ['3x yogur natural', { name: 'yogur natural', quantityMilli: 3000, unit: 'unit' }],
    ['aceite 1 litro', { name: 'aceite', quantityMilli: 1000, unit: 'l' }],
    ['  Pan   de molde ', { name: 'Pan de molde', quantityMilli: 1000, unit: 'unit' }],
    ['7up', { name: '7up', quantityMilli: 1000, unit: 'unit' }],
  ])('«%s»', (input, expected) => {
    expect(parseQuickAdd(input)).toEqual(expected);
  });

  it('ignora entradas vacías', () => {
    expect(parseQuickAdd('   ')).toBeNull();
  });
});

describe('entrada rápida en otros idiomas', () => {
  it('entiende unidades en inglés, francés y portugués', () => {
    expect(parseQuickAdd('500 grams rice')).toEqual({ name: 'rice', quantityMilli: 500_000, unit: 'g' });
    expect(parseQuickAdd('lait 2 litres')).toEqual({ name: 'lait', quantityMilli: 2000, unit: 'l' });
    expect(parseQuickAdd('3 unidade ovo')).toEqual({ name: 'ovo', quantityMilli: 3000, unit: 'unit' });
  });
});
