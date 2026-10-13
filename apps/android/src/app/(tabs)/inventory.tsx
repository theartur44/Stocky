import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { toLocalDate } from '../../domain/dates';
import type { Location, ProductStockSummary } from '../../domain/models';
import { normalizeKey } from '../../domain/text';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useServiceQuery } from '../../state/hooks';
import { Badge, Button, ChipGroup, EmptyState, ErrorView, Fab, ListRow, LoadingView, TextField } from '../../ui/components';
import { expiryLabel, qty } from '../../ui/format';
import { spacing, useTheme } from '../../ui/theme';

type Filter = 'in_stock' | 'out' | 'all' | Location;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'in_stock', label: t('inventory.filterInStock') },
  { value: 'fridge', label: t('locations.fridge') },
  { value: 'freezer', label: t('locations.freezer') },
  { value: 'pantry', label: t('locations.pantry') },
  { value: 'out', label: t('inventory.filterOut') },
  { value: 'all', label: t('inventory.filterAll') },
];

function applyFilter(items: ProductStockSummary[], filter: Filter, query: string): ProductStockSummary[] {
  const q = normalizeKey(query);
  return items.filter((s) => {
    if (filter === 'in_stock' && s.lots.length === 0) return false;
    if (filter === 'out' && s.lots.length > 0) return false;
    if ((filter === 'fridge' || filter === 'freezer' || filter === 'pantry' || filter === 'other') && !s.lots.some((l) => l.location === filter))
      return false;
    if (!q) return true;
    return (
      normalizeKey(s.product.name).includes(q) ||
      (s.product.brand !== null && normalizeKey(s.product.brand).includes(q)) ||
      s.product.barcode === query.trim()
    );
  });
}

export default function InventoryScreen() {
  const { services, settings } = useApp();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('in_stock');
  const q = useServiceQuery(() => services.inventory.listSummaries(), [services], ['inventory']);
  const items = useMemo(() => applyFilter(q.data ?? [], filter, query), [q.data, filter, query]);
  const today = toLocalDate(new Date());

  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={items}
        keyExtractor={(s) => s.product.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: spacing.sm }}>
            <TextField
              label={t('common.search')}
              placeholder={t('inventory.searchPlaceholder')}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
            <Button label={t('inventory.addManual')} icon="add" variant="secondary" onPress={() => router.push('/product/new')} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="file-tray-outline"
            message={query ? t('inventory.emptySearch', { query }) : t('inventory.empty')}
          />
        }
        renderItem={({ item: s }) => {
          const e = expiryLabel(
            { expiryDate: s.nearestExpiry, expiryKind: s.lots.find((l) => l.expiryDate === s.nearestExpiry)?.expiryKind ?? 'use_by' },
            today,
            settings.warnDays,
          );
          const subtitle =
            s.lots.length === 0
              ? t('inventory.noStock')
              : [
                  qty(s.totalMilli, s.product.defaultUnit),
                  t('inventory.lots', { count: s.lots.length }),
                  s.incompatibleLots > 0 ? t('inventory.incompatibleUnits') : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
          return (
            <ListRow
              title={s.product.brand ? `${s.product.name} (${s.product.brand})` : s.product.name}
              subtitle={subtitle}
              right={s.lots.length > 0 && e.status !== 'none' ? <Badge label={e.label} tone={e.tone} /> : null}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: s.product.id } })}
            />
          );
        }}
      />
      <Fab icon="barcode-outline" label={t('home.scan')} onPress={() => router.push('/scan')} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 96 },
});
