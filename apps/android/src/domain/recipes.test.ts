import { LOCAL_RECIPES } from '../data/recipes/localRecipes';
import { evaluateRecipe, ingredientMatches, suggestRecipes, type PantryItem } from './recipes';
import { tokens } from './text';

const item = (name: string, totalMilli: number, unit: PantryItem['unit'], expiringSoon = false): PantryItem => ({
  name,
  totalMilli,
  unit,
  expiringSoon,
});

describe('motor de recetas', () => {
  it('relaciona ingredientes con productos por palabras clave', () => {
    const egg = { name: 'Huevos', match: ['huevo'] };
    expect(ingredientMatches(egg, 'Huevos camperos L')).toBe(true);
    expect(ingredientMatches(egg, 'Hueso de jamón')).toBe(false);
    const mince = { name: 'Carne', match: ['carne picada'] };
    expect(ingredientMatches(mince, 'Carne picada de ternera')).toBe(true);
    expect(ingredientMatches(mince, 'Carne de cerdo')).toBe(false);
  });

  it('calcula lo que falta e ignora los básicos', () => {
    const tortilla = LOCAL_RECIPES.find((r) => r.id === 'tortilla-patatas')!;
    const s = evaluateRecipe(tortilla, [item('Huevos', 6000, 'unit')]);
    expect(s.missing.map((m) => m.name)).toEqual(['Patatas (600 g)']);
    expect(s.requiredCount).toBe(2);
  });

  it('compara cantidades aproximadas cuando las unidades son compatibles', () => {
    const tortilla = LOCAL_RECIPES.find((r) => r.id === 'tortilla-patatas')!;
    const s = evaluateRecipe(tortilla, [item('Huevos', 3000, 'unit'), item('Patatas', 1000, 'kg')]);
    expect(s.have.find((h) => h.ingredient.match.includes('huevo'))!.amount).toBe('maybe_low');
    expect(s.have.find((h) => h.ingredient.match.includes('patata'))!.amount).toBe('enough');
  });

  it('prioriza recetas que aprovechan productos próximos a vencer', () => {
    const pantry = [item('Calabacín', 2000, 'unit', true), item('Cebolla', 1000, 'unit'), item('Huevos', 6000, 'unit')];
    const [first] = suggestRecipes(LOCAL_RECIPES, pantry, { vegetarian: false, maxMinutes: 0 });
    expect(first!.usesExpiring).toEqual(['Calabacín']);
  });

  it('aplica preferencias vegetarianas y de tiempo', () => {
    const pantry = [item('Pechuga de pollo', 500, 'kg'), item('Calabacín', 2000, 'unit'), item('Huevos', 6000, 'unit')];
    const veg = suggestRecipes(LOCAL_RECIPES, pantry, { vegetarian: true, maxMinutes: 0 });
    expect(veg.every((s) => s.recipe.vegetarian)).toBe(true);
    const quick = suggestRecipes(LOCAL_RECIPES, pantry, { vegetarian: false, maxMinutes: 20 });
    expect(quick.every((s) => s.recipe.minutes <= 20)).toBe(true);
  });

  it('no sugiere nada con el inventario vacío', () => {
    expect(suggestRecipes(LOCAL_RECIPES, [], { vegetarian: false, maxMinutes: 0 })).toEqual([]);
  });

  it('la base de recetas es coherente', () => {
    const ids = new Set<string>();
    for (const r of LOCAL_RECIPES) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.steps.length).toBeGreaterThan(0);
      expect(r.ingredients.some((i) => !i.staple && !i.optional)).toBe(true);
      for (const i of r.ingredients) for (const m of i.match) expect(tokens(m).length).toBeGreaterThan(0);
    }
  });
});

describe('recetas en varios idiomas', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { recipesIn } = require('../data/recipes/localRecipes') as typeof import('../data/recipes/localRecipes');
  it('muestra los textos del idioma y reconoce productos con nombre en cualquier idioma', () => {
    const fr = recipesIn('fr').find((r) => r.id === 'tortilla-patatas')!;
    expect(fr.title).not.toBe('Tortilla de patatas');
    const egg = fr.ingredients[0]!;
    expect(ingredientMatches(egg, 'Huevos camperos')).toBe(true);
    expect(ingredientMatches(egg, 'Oeufs frais')).toBe(true);
    expect(ingredientMatches(egg, 'Free range eggs')).toBe(true);
    for (const l of ['en', 'fr', 'pt'] as const) {
      for (const r of recipesIn(l)) expect(r.steps.length).toBeGreaterThan(0);
    }
  });
});
