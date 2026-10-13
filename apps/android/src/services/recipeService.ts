import { localRecipeProvider } from '../data/recipes/localRecipes';
import { toLocalDate } from '../domain/dates';
import { getExpiryStatus, needsAttention } from '../domain/expiry';
import {
  evaluateRecipe,
  suggestRecipes,
  type PantryItem,
  type RecipePreferences,
  type RecipeProvider,
  type RecipeSuggestion,
} from '../domain/recipes';
import type { ServiceContext } from './context';
import type { InventoryService } from './inventoryService';

export function createRecipeService(
  ctx: ServiceContext,
  inventory: InventoryService,
  provider: RecipeProvider = localRecipeProvider,
) {
  async function pantry(warnDays: number): Promise<PantryItem[]> {
    const today = toLocalDate(ctx.clock());
    const summaries = await inventory.listSummaries();
    return summaries
      .filter((s) => s.lots.length > 0)
      .map((s) => ({
        name: s.product.name,
        totalMilli: s.totalMilli,
        unit: s.product.defaultUnit,
        expiringSoon: s.lots.some((l) => needsAttention(getExpiryStatus(l, today, warnDays))),
      }));
  }

  return {
    async suggestions(prefs: RecipePreferences, warnDays: number): Promise<RecipeSuggestion[]> {
      const [recipes, items] = await Promise.all([provider.getRecipes(), pantry(warnDays)]);
      return suggestRecipes(recipes, items, prefs);
    },

    async detail(id: string, warnDays: number): Promise<RecipeSuggestion | null> {
      const recipe = (await provider.getRecipes()).find((r) => r.id === id);
      if (!recipe) return null;
      return evaluateRecipe(recipe, await pantry(warnDays));
    },
  };
}

export type RecipeService = ReturnType<typeof createRecipeService>;
