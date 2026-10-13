import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useServiceQuery } from '../../state/hooks';
import { Badge, Body, Card, EmptyState, ErrorView, ListRow, LoadingView, Notice, Screen, SwitchRow } from '../../ui/components';
import { spacing } from '../../ui/theme';

export default function RecipesScreen() {
  const { services, settings } = useApp();
  const [vegetarian, setVegetarian] = useState(settings.recipeVegetarian);
  const [quick, setQuick] = useState(settings.recipeMaxMinutes > 0 && settings.recipeMaxMinutes <= 30);
  const maxMinutes = quick ? 30 : settings.recipeMaxMinutes;

  const q = useServiceQuery(
    async () => {
      const summaries = await services.inventory.listSummaries();
      const hasStock = summaries.some((s) => s.lots.length > 0);
      const suggestions = await services.recipes.suggestions({ vegetarian, maxMinutes }, settings.warnDays);
      return { hasStock, suggestions };
    },
    [services, vegetarian, maxMinutes, settings.warnDays],
    ['inventory'],
  );

  if (q.loading) return <LoadingView />;
  if (q.error || !q.data) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;

  return (
    <Screen>
      <Body muted>{t('recipes.intro')}</Body>
      <Card>
        <SwitchRow label={t('recipes.filterVegetarian')} value={vegetarian} onChange={setVegetarian} />
        <SwitchRow label={t('recipes.filterQuick')} value={quick} onChange={setQuick} />
      </Card>
      {!q.data.hasStock ? (
        <EmptyState icon="restaurant-outline" message={t('recipes.empty')} />
      ) : q.data.suggestions.length === 0 ? (
        <EmptyState icon="restaurant-outline" message={t('recipes.noMatches')} />
      ) : (
        <Card>
          {q.data.suggestions.map((s) => {
            const haveCount = s.have.filter((h) => !h.ingredient.optional && !h.ingredient.staple).length;
            const details = [
              t('recipes.minutes', { count: s.recipe.minutes }),
              t('recipes.have', { have: haveCount, total: s.requiredCount }),
              s.missing.length ? t('recipes.missing', { names: s.missing.map((m) => m.name).join(', ') }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View key={s.recipe.id} style={{ gap: spacing.xs }}>
                <ListRow
                  title={s.recipe.title}
                  subtitle={details}
                  onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: s.recipe.id } })}
                  right={s.usesExpiring.length > 0 ? <Badge label={t('recipes.usesExpiring', { names: s.usesExpiring.join(', ') })} tone="warning" /> : null}
                />
              </View>
            );
          })}
        </Card>
      )}
      <Notice message={t('recipes.disclaimer')} />
    </Screen>
  );
}
