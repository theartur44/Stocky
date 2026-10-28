import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { toLocalDate } from '../../domain/dates';
import { getExpiryStatus, needsAttention } from '../../domain/expiry';
import type { ProductStockSummary } from '../../domain/models';
import { normalizeKey } from '../../domain/text';
import { formatQuantity, type Unit } from '../../domain/units';
import { dateLocale, t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useServiceQuery } from '../../state/hooks';
import {
  Backdrop,
  Badge,
  Button,
  CategoryAvatar,
  ChipGroup,
  EmptyState,
  ErrorView,
  FadeIn,
  Glass,
  IconButton,
  LoadingView,
  PressableScale,
  SearchBar,
  type IconName,
} from '../../ui/components';
import { expiryLabel, qty } from '../../ui/format';
import { PLACE_ICONS, placeLabel, usePlaces } from '../../ui/places';
import { font, radius, spacing, useTheme } from '../../ui/theme';
import { useToast } from '../../ui/toast';

/** Los filtros fijos, o `place:<id>` para lo que hay en un sitio concreto. */
type Filter = 'in_stock' | 'expiring' | 'out' | 'all' | `place:${string}`;

function matches(s: ProductStockSummary, filter: Filter, q: string, today: string, warnDays: number): boolean {
  if (filter === 'in_stock' && s.lots.length === 0) return false;
  if (filter === 'out' && s.lots.length > 0) return false;
  if (filter === 'expiring' && !s.lots.some((l) => needsAttention(getExpiryStatus(l, today, warnDays)))) return false;
  if (filter.startsWith('place:') && !s.lots.some((l) => `place:${l.placeId}` === filter)) return false;
  if (!q) return true;
  return (
    normalizeKey(s.product.name).includes(q) ||
    (s.product.brand !== null && normalizeKey(s.product.brand).includes(q)) ||
    s.product.barcode === q
  );
}

/** Lo que se gasta con el botón «−1»: un envase o una unidad. */
function quickConsumeAmount(s: ProductStockSummary): { milli: number; unit: Unit } | null {
  const p = s.product;
  if (s.lots.length === 0 || s.incompatibleLots > 0) return null;
  if (p.defaultUnit === 'unit') return { milli: 1000, unit: 'unit' };
  if (p.packQuantityMilli) return { milli: p.packQuantityMilli, unit: p.defaultUnit };
  return null;
}

export default function InventoryScreen() {
  const { services, settings } = useApp();
  const { colors } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('in_stock');
  const q = useServiceQuery(() => services.inventory.listSummaries(), [services], ['inventory']);
  const { places } = usePlaces();
  const filters = useMemo<{ value: Filter; label: string; icon: IconName }[]>(
    () => [
      { value: 'in_stock', label: t('inventory.filterInStock'), icon: 'home-outline' },
      { value: 'expiring', label: t('inventory.filterExpiring'), icon: 'time-outline' },
      ...places.map((p) => ({ value: `place:${p.id}` as const, label: placeLabel(p), icon: PLACE_ICONS[p.kind] })),
      { value: 'out', label: t('inventory.filterOut'), icon: 'alert-circle-outline' },
      { value: 'all', label: t('inventory.filterAll'), icon: 'apps-outline' },
    ],
    [places],
  );
  // Si se borra el sitio elegido, se vuelve al filtro inicial.
  const activeFilter: Filter = filters.some((f) => f.value === filter) ? filter : 'in_stock';
  const today = toLocalDate(new Date());

  const items = useMemo(() => {
    const nq = normalizeKey(query);
    const list = (q.data ?? []).filter((s) => matches(s, activeFilter, nq, today, settings.warnDays));
    // Primero lo que caduca antes; los que no tienen fecha, por nombre.
    return list.sort((a, b) => {
      if (a.nearestExpiry && b.nearestExpiry) return a.nearestExpiry < b.nearestExpiry ? -1 : 1;
      if (a.nearestExpiry) return -1;
      if (b.nearestExpiry) return 1;
      return a.product.name.localeCompare(b.product.name, dateLocale());
    });
  }, [q.data, activeFilter, query, today, settings.warnDays]);

  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;

  const consumeOne = async (s: ProductStockSummary) => {
    const amount = quickConsumeAmount(s);
    if (!amount) return;
    try {
      await services.inventory.consumeProduct(s.product.id, amount.milli, amount.unit);
      toast(t('inventory.consumed', { name: s.product.name, amount: formatQuantity(amount.milli, amount.unit) }), { icon: 'remove-circle' });
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <FlatList
        data={items}
        keyExtractor={(s) => s.product.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <SearchBar
              label={t('common.search')}
              placeholder={t('inventory.searchPlaceholder')}
              value={query}
              onChangeText={setQuery}
            />
            <ChipGroup options={filters} value={activeFilter} onChange={setFilter} scroll />
            <View style={styles.countRow}>
              <Text style={{ color: colors.textMuted, fontWeight: '600', flex: 1 }}>{t('inventory.count', { count: items.length })}</Text>
              <Button compact variant="tonal" icon="add" label={t('inventory.addManual')} onPress={() => router.push('/product/new')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="file-tray-outline"
            message={query ? t('inventory.emptySearch', { query }) : t('inventory.empty')}
            action={!query ? <Button label={t('home.scanCta')} icon="barcode-outline" onPress={() => router.push('/scan')} /> : undefined}
          />
        }
        renderItem={({ item: s, index }) => {
          const kind = s.lots.find((l) => l.expiryDate === s.nearestExpiry)?.expiryKind ?? 'use_by';
          const e = expiryLabel({ expiryDate: s.nearestExpiry, expiryKind: kind }, today, settings.warnDays);
          const amount = quickConsumeAmount(s);
          return (
            <FadeIn delay={index * 30}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`${s.product.name}. ${s.lots.length === 0 ? t('inventory.noStock') : qty(s.totalMilli, s.product.defaultUnit)}. ${e.label}`}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: s.product.id } })}
                scaleTo={0.98}
              >
                <Glass style={styles.item}>
                <CategoryAvatar category={s.product.category} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.body }} numberOfLines={1}>
                    {s.product.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.small }} numberOfLines={1}>
                    {s.lots.length === 0
                      ? t('inventory.noStock')
                      : [qty(s.totalMilli, s.product.defaultUnit), s.product.brand, s.lots.length > 1 ? t('inventory.lots', { count: s.lots.length }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                  </Text>
                  {s.lots.length > 0 && e.status !== 'none' ? <Badge label={e.label} tone={e.tone} /> : null}
                </View>
                {amount ? (
                  <IconButton
                    icon="remove"
                    filled
                    label={t('inventory.consumeOne', { name: s.product.name })}
                    onPress={() => void consumeOne(s)}
                  />
                ) : null}
                </Glass>
              </PressableScale>
            </FadeIn>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 140, gap: spacing.sm },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
});
