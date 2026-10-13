/**
 * Motor local de sugerencia de recetas.
 *
 * Funciona íntegramente en el dispositivo: no envía el inventario a ningún
 * servicio. La interfaz `RecipeProvider` permite añadir en el futuro otras
 * fuentes (p. ej. un modelo de IA) previa evaluación de privacidad y con
 * consentimiento explícito del usuario.
 */
import { areCompatible, convertMilli, type Unit } from './units';
import { tokens } from './text';

export interface RecipeIngredient {
  name: string;
  /** Palabras clave (en singular) que identifican el ingrediente en el inventario. */
  match: string[];
  /** Cantidad orientativa, si tiene sentido compararla con las existencias. */
  amount?: { milli: number; unit: Unit };
  optional?: boolean;
  /** Básicos que casi todas las casas tienen (sal, agua): no cuentan como faltantes. */
  staple?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  minutes: number;
  servings: number;
  vegetarian: boolean;
  ingredients: RecipeIngredient[];
  steps: string[];
}

export interface RecipeProvider {
  /** Identificador de la fuente; `local` = base de recetas incluida en la app. */
  readonly id: string;
  getRecipes(): Promise<Recipe[]>;
}

export interface PantryItem {
  name: string;
  /** Total disponible y su unidad (en la unidad por defecto del producto). */
  totalMilli: number;
  unit: Unit;
  /** El producto tiene algún lote próximo a vencer o vencido. */
  expiringSoon: boolean;
}

export interface RecipePreferences {
  vegetarian: boolean;
  /** 0 = sin límite. */
  maxMinutes: number;
}

export type AmountCheck = 'enough' | 'maybe_low' | 'unknown';

export interface IngredientMatch {
  ingredient: RecipeIngredient;
  item: PantryItem;
  amount: AmountCheck;
}

export interface RecipeSuggestion {
  recipe: Recipe;
  have: IngredientMatch[];
  missing: RecipeIngredient[];
  /** Nombres de productos próximos a vencer que usa la receta. */
  usesExpiring: string[];
  requiredCount: number;
  score: number;
}

/** `true` si todas las palabras de alguna clave aparecen en el nombre del producto. */
export function ingredientMatches(ingredient: RecipeIngredient, productName: string): boolean {
  const productTokens = new Set(tokens(productName));
  return ingredient.match.some((keyword) => {
    const kw = tokens(keyword);
    return kw.length > 0 && kw.every((w) => productTokens.has(w));
  });
}

function checkAmount(ingredient: RecipeIngredient, item: PantryItem): AmountCheck {
  if (!ingredient.amount || !areCompatible(ingredient.amount.unit, item.unit)) return 'unknown';
  const available = convertMilli(item.totalMilli, item.unit, ingredient.amount.unit);
  return available >= ingredient.amount.milli ? 'enough' : 'maybe_low';
}

export function evaluateRecipe(recipe: Recipe, pantry: PantryItem[]): RecipeSuggestion {
  const have: IngredientMatch[] = [];
  const missing: RecipeIngredient[] = [];
  for (const ingredient of recipe.ingredients) {
    // Preferimos el producto que vence antes para aprovecharlo.
    const candidates = pantry.filter((p) => p.totalMilli > 0 && ingredientMatches(ingredient, p.name));
    const item = candidates.find((c) => c.expiringSoon) ?? candidates[0];
    if (item) have.push({ ingredient, item, amount: checkAmount(ingredient, item) });
    else if (!ingredient.optional && !ingredient.staple) missing.push(ingredient);
  }
  const required = recipe.ingredients.filter((i) => !i.optional && !i.staple);
  const haveRequired = have.filter((h) => !h.ingredient.optional && !h.ingredient.staple).length;
  const usesExpiring = [...new Set(have.filter((h) => h.item.expiringSoon).map((h) => h.item.name))];
  const coverage = required.length === 0 ? 1 : haveRequired / required.length;
  const score =
    Math.round(coverage * 100) + usesExpiring.length * 15 - missing.length * 5 - (recipe.minutes > 45 ? 3 : 0);
  return { recipe, have, missing, usesExpiring, requiredCount: required.length, score };
}

/**
 * Ordena las recetas según lo que hay en casa. Se descartan las que no usan
 * ningún ingrediente principal disponible y las que no cumplen las preferencias.
 */
export function suggestRecipes(
  recipes: Recipe[],
  pantry: PantryItem[],
  prefs: RecipePreferences,
  limit = 30,
): RecipeSuggestion[] {
  return recipes
    .filter((r) => !prefs.vegetarian || r.vegetarian)
    .filter((r) => prefs.maxMinutes <= 0 || r.minutes <= prefs.maxMinutes)
    .map((r) => evaluateRecipe(r, pantry))
    .filter((s) => s.have.some((h) => !h.ingredient.staple))
    .sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes)
    .slice(0, limit);
}
