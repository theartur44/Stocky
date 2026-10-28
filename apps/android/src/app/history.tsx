import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { StockEvent } from '../data/repositories';
import { formatLocalDate } from '../domain/dates';
import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { errorMessage } from '../state/errors';
import { useServiceQuery } from '../state/hooks';
import { Backdrop, Badge, Body, CategoryAvatar, ChipGroup, EmptyState, ErrorView, Glass, IconButton, ListRow, LoadingView, Title } from '../ui/components';
import { qty } from '../ui/format';
import { font, spacing, useTheme } from '../ui/theme';
import { useToast } from '../ui/toast';

type Filter = 'all' | StockEvent['kind'];

/** Una fila por acción y producto (gastar de dos lotes a la vez cuenta como una). */
interface Entry {
  key: string;
  batchId: string;
  kind: StockEvent['kind'];
  productName: string;
  category: StockEvent['category'];
  quantityMilli: number;
  unit: StockEvent['unit'];
  expired: boolean;
  day: StockEvent['day'];
}

function group(events: StockEvent[]): Entry[] {
  const map = new Map<string, Entry>();
  for (const e of events) {
    const key = `${e.batchId}:${e.productId}:${e.unit}`;
    const prev = map.get(key);
    if (prev) prev.quantityMilli += e.quantityMilli;
    else map.set(key, { key, batchId: e.batchId, kind: e.kind, productName: e.productName, category: e.category, quantityMilli: e.quantityMilli, unit: e.unit, expired: e.expired, day: e.day });
  }
  return [...map.values()];
}

/** Historial de lo gastado y lo tirado en este móvil, con resumen del último mes. */
export default function HistoryScreen() {
  const { services } = useApp();
  const { colors } = useTheme();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useServiceQuery(
    async () => ({ events: await services.history.list(), summary: await services.history.summary(30) }),
    [services],
    ['inventory'],
  );
  const entries = useMemo(() => group(q.data?.events ?? []).filter((e) => filter === 'all' || e.kind === filter), [q.data, filter]);

  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  const s = q.data!.summary;
  const total = s.consumed + s.discarded;

  const undo = (batchId: string) =>
    services.history.undo(batchId).then(
      () => toast(t('history.undone'), { icon: 'arrow-undo' }),
      (e: unknown) => toast(errorMessage(e), { tone: 'danger' }),
    );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Glass style={{ padding: spacing.lg, gap: spacing.sm }}>
              <Title size="heading">{t('history.lastDays', { days: 30 })}</Title>
              <View style={styles.stats}>
                <Stat value={s.consumed} label={t('history.consumed')} color={colors.primary} />
                <Stat value={s.discarded} label={t('history.discarded')} color={colors.danger} />
              </View>
              {total > 0 ? (
                <Body muted small>
                  {t('history.wasteShare', { percent: Math.round((s.discarded / total) * 100), expired: s.expired })}
                </Body>
              ) : null}
            </Glass>
            <Body muted small>
              {t('history.thisDevice')}
            </Body>
            <ChipGroup
              scroll
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('inventory.filterAll'), icon: 'apps-outline' },
                { value: 'consumed', label: t('history.consumed'), icon: 'checkmark-done' },
                { value: 'discarded', label: t('history.discarded'), icon: 'trash-outline' },
              ]}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="time-outline" message={t('history.empty')} />}
        renderItem={({ item: e }) => (
          <Glass style={{ paddingHorizontal: spacing.md }}>
            <ListRow
              left={<CategoryAvatar category={e.category} size={40} />}
              title={e.productName}
              subtitle={`${qty(e.quantityMilli, e.unit)} · ${formatLocalDate(e.day)}`}
              right={
                <View style={styles.right}>
                  <Badge
                    label={e.kind === 'consumed' ? t('history.consumed') : e.expired ? t('history.discardedExpired') : t('history.discarded')}
                    tone={e.kind === 'consumed' ? 'success' : 'danger'}
                  />
                  <IconButton icon="arrow-undo" size={20} label={`${t('history.undo')}: ${e.productName}`} onPress={() => void undo(e.batchId)} />
                </View>
              }
            />
          </Glass>
        )}
      />
    </View>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: font.display, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: font.small }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.lg },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
