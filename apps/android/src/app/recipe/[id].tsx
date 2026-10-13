import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { Unit } from '../../domain/units';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useAction, useServiceQuery } from '../../state/hooks';
import { Badge, Body, Button, Card, ErrorView, ListRow, LoadingView, Notice, Screen, Title } from '../../ui/components';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { services, settings } = useApp();
  const [message, setMessage] = useState<string | null>(null);
  const q = useServiceQuery(() => services.recipes.detail(String(id), settings.warnDays), [services, id, settings.warnDays], ['inventory']);

  const [addMissing, busy] = useAction(async () => {
    const s = q.data;
    if (!s) return;
    try {
      const list = await services.shopping.ensureDefaultList();
      for (const m of s.missing) {
        // Se añade una unidad (o la cantidad orientativa de la receta) del ingrediente.
        const amount = m.amount ?? { milli: 1000, unit: 'unit' as Unit };
        await services.shopping.addItem(list.id, {
          name: m.name.replace(/\s*\(.*\)\s*$/, ''),
          quantityMilli: amount.milli,
          unit: amount.unit,
        });
      }
      setMessage(t('recipes.addedMissing', { count: s.missing.length }));
    } catch (e) {
      setMessage(errorMessage(e));
    }
  });

  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  if (!q.data) return <ErrorView message={t('errors.not_found')} />;
  const { recipe, have, missing } = q.data;
  const haveSet = new Set(have.map((h) => h.ingredient));

  return (
    <Screen>
      <Stack.Screen options={{ title: recipe.title }} />
      <Title>{recipe.title}</Title>
      <Body muted>
        {t('recipes.minutes', { count: recipe.minutes })} · {t('recipes.servings', { count: recipe.servings })}
      </Body>
      <Card>
        <Title>{t('recipes.ingredients')}</Title>
        {recipe.ingredients.map((ing) => {
          const match = have.find((h) => h.ingredient === ing);
          return (
            <ListRow
              key={ing.name}
              title={ing.optional ? `${ing.name} (${t('recipes.optional')})` : ing.name}
              subtitle={match ? match.item.name : null}
              right={
                haveSet.has(ing) ? (
                  <Badge label={t('recipes.inStock')} tone={match?.item.expiringSoon ? 'warning' : 'success'} />
                ) : ing.staple ? null : (
                  <Badge label={t('recipes.missingShort')} tone="neutral" />
                )
              }
            />
          );
        })}
        {missing.length > 0 ? (
          <Button label={t('recipes.addMissing')} icon="cart-outline" variant="secondary" onPress={() => void addMissing()} loading={busy} />
        ) : null}
        {message ? <Notice message={message} /> : null}
      </Card>
      <Card>
        <Title>{t('recipes.steps')}</Title>
        {recipe.steps.map((step, i) => (
          <Body key={i}>{`${i + 1}. ${step}`}</Body>
        ))}
      </Card>
      <Notice message={t('recipes.disclaimer')} />
    </Screen>
  );
}
