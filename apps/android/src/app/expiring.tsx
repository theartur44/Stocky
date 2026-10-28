import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import { toLocalDate } from '../domain/dates';
import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { errorMessage } from '../state/errors';
import { useServiceQuery } from '../state/hooks';
import { Backdrop, Badge, Body, CategoryAvatar, EmptyState, ErrorView, Glass, ListRow, LoadingView, Notice } from '../ui/components';
import { expiryLabel, qty } from '../ui/format';
import { usePlaces } from '../ui/places';
import { spacing } from '../ui/theme';

const HORIZON_DAYS = 365;

/** Todos los lotes con fecha, ordenados por proximidad (los vencidos primero). */
export default function ExpiringScreen() {
  const { services, settings } = useApp();
  const { nameOf } = usePlaces();
  const q = useServiceQuery(
    () => services.inventory.listExpiring(toLocalDate(new Date()), HORIZON_DAYS),
    [services],
    ['inventory'],
  );
  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  const today = toLocalDate(new Date());

  return (
    <View style={{ flex: 1 }}>
    <Backdrop />
    <FlatList
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }}
      data={q.data ?? []}
      keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
          <Notice message={t('expiryDisclaimer')} />
          <Body muted small>
            {t('expiring.horizon', { days: HORIZON_DAYS })}
          </Body>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="calendar-outline" message={t('expiring.empty')} />}
      renderItem={({ item: lot }) => {
        const e = expiryLabel(lot, today, settings.warnDays);
        return (
          <Glass style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            left={<CategoryAvatar category={lot.product.category} size={40} />}
            title={lot.product.name}
            subtitle={`${qty(lot.quantityMilli, lot.unit)} · ${nameOf(lot)} · ${t(`expiryKinds.${lot.expiryKind}`)}`}
            right={<Badge label={e.label} tone={e.tone} />}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: lot.productId } })}
          />
          </Glass>
        );
      }}
    />
    </View>
  );
}
