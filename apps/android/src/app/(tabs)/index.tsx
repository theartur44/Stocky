import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { toLocalDate } from '../../domain/dates';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useServiceQuery } from '../../state/hooks';
import { Badge, Body, Button, Card, ErrorView, Fab, ListRow, LoadingView, Screen, Title } from '../../ui/components';
import { expiryLabel, qty } from '../../ui/format';
import { font, spacing, useTheme } from '../../ui/theme';

const MAX_ROWS = 5;

export default function HomeScreen() {
  const { services, settings } = useApp();
  const { colors } = useTheme();
  const q = useServiceQuery(
    async () => {
      const list = await services.shopping.ensureDefaultList();
      const [dashboard, items] = await Promise.all([
        services.inventory.getDashboard(settings.warnDays),
        services.shopping.items(list.id),
      ]);
      return { dashboard, pending: items.filter((i) => !i.transferredAt && !i.checked).length };
    },
    [services, settings.warnDays],
  );

  if (q.loading) return <LoadingView />;
  if (q.error || !q.data) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  const { dashboard, pending } = q.data;
  const today = toLocalDate(new Date());

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={styles.stats}>
          <Stat label={t('home.productsInStock')} value={dashboard.productsInStock} color={colors.primary} />
          <Stat label={t('home.lots')} value={dashboard.lotsCount} color={colors.text} />
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label={t('home.addProduct')} icon="add-circle-outline" variant="secondary" onPress={() => router.push('/product/new')} />
          </View>
          <View style={styles.action}>
            <Button label={t('home.recipes')} icon="restaurant-outline" variant="secondary" onPress={() => router.push('/recipes')} />
          </View>
        </View>

        <Card>
          <Title>{t('home.expiringTitle')}</Title>
          {dashboard.attentionLots.length === 0 ? (
            <Body muted>{t('home.expiringEmpty')}</Body>
          ) : (
            dashboard.attentionLots.slice(0, MAX_ROWS).map((lot) => {
              const e = expiryLabel(lot, today, settings.warnDays);
              return (
                <ListRow
                  key={lot.id}
                  title={lot.product.name}
                  subtitle={qty(lot.quantityMilli, lot.unit)}
                  right={<Badge label={e.label} tone={e.tone} />}
                  onPress={() => router.push({ pathname: '/product/[id]', params: { id: lot.productId } })}
                />
              );
            })
          )}
          <Button label={t('home.expiringAll')} variant="ghost" icon="calendar-outline" onPress={() => router.push('/expiring')} />
        </Card>

        <Card>
          <Title>{t('home.lowStockTitle')}</Title>
          {dashboard.lowStock.length === 0 ? (
            <Body muted>{t('home.lowStockEmpty')}</Body>
          ) : (
            dashboard.lowStock.slice(0, MAX_ROWS).map((s) => (
              <ListRow
                key={s.product.id}
                title={s.product.name}
                subtitle={s.lots.length === 0 ? t('inventory.noStock') : qty(s.totalMilli, s.product.defaultUnit)}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: s.product.id } })}
              />
            ))
          )}
        </Card>

        <Card>
          <Title>{t('home.shoppingTitle')}</Title>
          <Body muted>{pending === 0 ? t('home.shoppingEmpty') : t('home.shoppingSummary', { count: pending })}</Body>
          <Button label={t('tabs.shopping')} variant="ghost" icon="cart-outline" onPress={() => router.push('/shopping')} />
        </Card>
      </Screen>
      <Fab icon="barcode-outline" label={t('home.scan')} onPress={() => router.push('/scan')} />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.stat}>
      <Text style={{ fontSize: font.display, fontWeight: '700', color }} accessibilityLabel={`${label}: ${value}`}>
        {value}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: font.small }}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: { flexGrow: 1, flexBasis: 150 },
});
