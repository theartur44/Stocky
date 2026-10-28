import { router } from 'expo-router';
import { Alert, FlatList, View } from 'react-native';

import { toLocalDate } from '../domain/dates';
import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { errorMessage } from '../state/errors';
import { useServiceQuery } from '../state/hooks';
import { getExpiryStatus } from '../domain/expiry';
import { Backdrop, Badge, Body, Button, CategoryAvatar, EmptyState, ErrorView, Glass, ListRow, LoadingView, Notice } from '../ui/components';
import { expiryLabel, qty } from '../ui/format';
import { usePlaces } from '../ui/places';
import { LotActions } from '../ui/stockActions';
import { spacing } from '../ui/theme';
import { useToast } from '../ui/toast';

const HORIZON_DAYS = 365;

/** Todos los lotes con fecha, ordenados por proximidad (los vencidos primero). */
export default function ExpiringScreen() {
  const { services, settings } = useApp();
  const { nameOf } = usePlaces();
  const toast = useToast();
  const q = useServiceQuery(
    () => services.inventory.listExpiring(toLocalDate(new Date()), HORIZON_DAYS),
    [services],
    ['inventory'],
  );
  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  const today = toLocalDate(new Date());
  const expiredCount = (q.data ?? []).filter((l) => getExpiryStatus(l, today, 0) === 'expired').length;

  const discardExpired = () =>
    Alert.alert(t('expiring.discardExpiredTitle', { count: expiredCount }), t('expiring.discardExpiredMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('lotActions.discard'),
        style: 'destructive',
        onPress: async () => {
          try {
            const r = await services.inventory.discardExpired();
            toast(t('expiring.discardedExpired', { count: r.count }), {
              icon: 'trash',
              action: { label: t('history.undo'), onPress: () => void services.history.undo(r.batchId).catch(() => undefined) },
            });
          } catch (e) {
            toast(errorMessage(e), { tone: 'danger' });
          }
        },
      },
    ]);

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
          {expiredCount > 0 ? (
            <Button icon="trash-outline" variant="danger" label={t('expiring.discardExpired', { count: expiredCount })} onPress={discardExpired} />
          ) : null}
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
          <View style={{ paddingBottom: spacing.md }}>
            <LotActions lot={lot} productName={lot.product.name} compact />
          </View>
          </Glass>
        );
      }}
    />
    </View>
  );
}
