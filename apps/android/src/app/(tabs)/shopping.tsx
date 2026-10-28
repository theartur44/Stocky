import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { defaultShoppingAmount } from '../../domain/inventory';
import type { Product, ShoppingItem } from '../../domain/models';
import { parseQuickAdd } from '../../domain/quickAdd';
import { groupByCategory, shoppingListText } from '../../domain/shoppingGroups';
import { normalizeKey } from '../../domain/text';
import { formatMilli, type Unit } from '../../domain/units';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useServiceQuery } from '../../state/hooks';
import {
  Backdrop,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorView,
  FadeIn,
  Glass,
  HorizontalScroller,
  IconButton,
  LoadingView,
  PressableScale,
  SectionHeader,
  Stepper,
  TextField,
} from '../../ui/components';
import { listLabel, qty } from '../../ui/format';
import { TAB_BAR, elevation, font, radius, spacing, useTheme } from '../../ui/theme';
import { useToast } from '../../ui/toast';

/** Paso del botón −/+ según la unidad. */
function stepFor(unit: Unit): number {
  if (unit === 'unit') return 1000;
  if (unit === 'kg' || unit === 'l') return 500;
  return 100_000; // 100 g o 100 ml
}

export default function ShoppingScreen() {
  const { services } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = insets.bottom + TAB_BAR.height + TAB_BAR.gap;
  const toast = useToast();
  const [listId, setListId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<TextInput>(null);

  const q = useServiceQuery(
    async () => {
      const lists = await services.shopping.lists();
      const current = lists.find((l) => l.id === listId) ?? lists[0] ?? (await services.shopping.ensureDefaultList());
      const [items, summaries] = [await services.shopping.items(current.id), await services.inventory.listSummaries()];
      return { lists: lists.length ? lists : [current], current, items, summaries };
    },
    [services, listId],
    ['shopping', 'inventory'],
  );

  const pending = useMemo(
    () => new Set((q.data?.items ?? []).filter((i) => !i.transferredAt).flatMap((i) => [i.productId ?? '', normalizeKey(i.name)])),
    [q.data],
  );
  const suggestions = useMemo((): Product[] => {
    if (!q.data) return [];
    return q.data.summaries
      .filter((s) => s.lots.length === 0 || (s.isLowStock && s.product.lowStockThresholdMilli !== null))
      .map((s) => s.product)
      .filter((p) => !pending.has(p.id) && !pending.has(normalizeKey(p.name)))
      .slice(0, 12);
  }, [q.data, pending]);
  // Al escribir, productos del catálogo que coinciden (evita duplicados con nombres distintos).
  const matches = useMemo((): Product[] => {
    const typed = normalizeKey(parseQuickAdd(text)?.name ?? '');
    if (!q.data || typed.length < 2) return [];
    return q.data.summaries
      .map((s) => s.product)
      .filter((p) => normalizeKey(p.name).includes(typed) && !pending.has(p.id))
      .slice(0, 8);
  }, [q.data, text, pending]);
  const categoryOf = useMemo(() => {
    const map = new Map((q.data?.summaries ?? []).map((s) => [s.product.id, s.product.category]));
    return (id: string) => map.get(id);
  }, [q.data]);

  if (q.loading) return <LoadingView />;
  if (q.error || !q.data) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  const { lists, current, items } = q.data;
  const toBuy = items.filter((i) => !i.checked && !i.transferredAt);
  const groups = groupByCategory(toBuy, categoryOf);

  const share = () =>
    void Share.share({
      message: shoppingListText(listLabel(current), groups, {
        category: (c) => t(`categories.${c}`),
        item: (i) => `${i.name} (${qty(i.quantityMilli, i.unit)})`,
      }),
    }).catch(() => undefined);
  const inCart = items.filter((i) => i.checked && !i.transferredAt);
  const done = items.filter((i) => i.transferredAt);

  const add = async () => {
    const parsed = parseQuickAdd(text);
    if (!parsed) return;
    try {
      const r = await services.shopping.addItem(current.id, parsed);
      setText('');
      toast(r.merged ? t('shopping.merged') : t('shopping.added', { name: parsed.name }), { icon: 'cart' });
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
    }
    inputRef.current?.focus();
  };

  const addSuggestion = async (p: Product) => {
    try {
      // Si se escribió una cantidad («2 leche»), se respeta.
      const typed = parseQuickAdd(text);
      const amount = typed && /\d/.test(text) ? { quantityMilli: typed.quantityMilli, unit: typed.unit } : defaultShoppingAmount(p);
      await services.shopping.addItem(current.id, { name: p.name, productId: p.id, ...amount });
      setText('');
      toast(t('shopping.added', { name: p.name }), { icon: 'cart' });
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
    }
  };

  const transfer = () => {
    const count = inCart.length;
    Alert.alert(t('shopping.transferTitle'), t('shopping.transferMessage', { count }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          try {
            const n = await services.shopping.transferChecked(current.id);
            toast(t('shopping.transferDone', { count: n }), { icon: 'home' });
          } catch (e) {
            toast(errorMessage(e), { tone: 'danger' });
          }
        },
      },
    ]);
  };

  const createList = async () => {
    try {
      const list = await services.shopping.createList(newName);
      setCreating(false);
      setNewName('');
      setListId(list.id);
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
    }
  };

  const deleteList = () => {
    if (lists.length <= 1) return;
    Alert.alert(t('shopping.deleteList'), t('shopping.deleteListMessage', { name: listLabel(current) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await services.shopping.deleteList(current.id);
          setListId(lists.find((l) => l.id !== current.id)!.id);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabSpace + (inCart.length > 0 ? 90 : 30) }]}
        keyboardShouldPersistTaps="handled"
      >
        {lists.length > 1 || creating ? (
          <ChipGroup
            scroll
            value={current.id}
            onChange={setListId}
            options={lists.map((l) => ({ value: l.id, label: listLabel(l), icon: 'list' as const }))}
          />
        ) : null}

        {/* Entrada rápida */}
        <Glass strong style={styles.quickAdd}>
          <Ionicons name="add-circle" size={26} color={colors.primary} />
          <TextInput
            ref={inputRef}
            accessibilityLabel={t('shopping.addPlaceholder')}
            placeholder={t('shopping.quickPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void add()}
            submitBehavior="submit"
            returnKeyType="done"
            maxLength={120}
            style={{ flex: 1, color: colors.text, fontSize: font.body, minHeight: 52 }}
          />
          {text.trim() ? (
            <IconButton icon="arrow-up-circle" size={32} label={t('common.add')} onPress={() => void add()} />
          ) : (
            <IconButton
              icon="barcode-outline"
              filled
              label={t('shopping.scanToList')}
              onPress={() => router.push({ pathname: '/scan', params: { mode: 'shopping', listId: current.id } })}
            />
          )}
        </Glass>

        {(matches.length > 0 || (!text.trim() && suggestions.length > 0)) ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={[styles.overline, { color: colors.textMuted }]}>{matches.length > 0 ? t('shopping.fromCatalog') : t('shopping.suggestions')}</Text>
            <HorizontalScroller contentContainerStyle={{ flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.xl }}>
              {(matches.length > 0 ? matches : suggestions).map((p) => (
                <PressableScale
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('shopping.addSuggestion', { name: p.name })}
                  onPress={() => void addSuggestion(p)}
                  style={[styles.suggestion, { backgroundColor: colors.primarySoft }]}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '700' }} numberOfLines={1}>
                    {p.name}
                  </Text>
                </PressableScale>
              ))}
            </HorizontalScroller>
          </View>
        ) : null}

        {items.length === 0 ? <EmptyState icon="cart-outline" message={t('shopping.empty')} /> : null}

        {toBuy.length > 0 ? (
          <>
            <SectionHeader
              title={t('shopping.toBuy', { count: toBuy.length })}
              action={<IconButton icon="share-social-outline" label={t('shopping.share')} onPress={share} />}
            />
            <Card style={{ paddingVertical: spacing.xs }}>
              {groups.map((g) => (
                <View key={g.category}>
                  {groups.length > 1 ? (
                    <Text style={[styles.overline, styles.groupTitle, { color: colors.textMuted }]}>{t(`categories.${g.category}`)}</Text>
                  ) : null}
                  {g.items.map((item, i) => (
                    <FadeIn key={item.id} delay={i * 25}>
                      <ItemRow item={item} />
                    </FadeIn>
                  ))}
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {inCart.length > 0 ? (
          <>
            <SectionHeader title={t('shopping.inCartTitle', { count: inCart.length })} />
            <Card style={{ paddingVertical: spacing.xs }}>
              {inCart.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </Card>
          </>
        ) : null}

        {done.length > 0 ? (
          <>
            <SectionHeader
              title={t('shopping.doneTitle', { count: done.length })}
              action={<Button compact variant="ghost" label={t('shopping.clearTransferred')} onPress={() => void services.shopping.clearTransferred(current.id)} />}
            />
            <Card style={{ paddingVertical: spacing.xs, opacity: 0.75 }}>
              {done.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </Card>
          </>
        ) : null}

        {/* Gestión de listas */}
        {creating ? (
          <Card>
            <TextField label={t('shopping.newListName')} value={newName} onChangeText={setNewName} maxLength={60} autoFocus />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button label={t('common.cancel')} variant="ghost" onPress={() => setCreating(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={t('common.save')} onPress={() => void createList()} disabled={!newName.trim()} />
              </View>
            </View>
          </Card>
        ) : (
          <View style={styles.row}>
            <Button compact variant="ghost" icon="add" label={t('shopping.newList')} onPress={() => setCreating(true)} />
            {lists.length > 1 ? <Button compact variant="ghost" icon="trash-outline" label={t('shopping.deleteList')} onPress={deleteList} /> : null}
          </View>
        )}
      </ScrollView>

      {inCart.length > 0 ? (
        <View style={[styles.bottomBar, { bottom: tabSpace + spacing.sm }]} pointerEvents="box-none">
          <PressableScale accessibilityRole="button" accessibilityLabel={t('shopping.transfer', { count: inCart.length })} onPress={transfer} style={[styles.transferWrap, elevation(colors, 3)]}>
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.transfer}>
              <Ionicons name="home" size={20} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: font.body }}>{t('shopping.transfer', { count: inCart.length })}</Text>
            </LinearGradient>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

function ItemRow({ item }: { item: ShoppingItem }) {
  const { services } = useApp();
  const { colors } = useTheme();
  const toast = useToast();
  const done = !!item.transferredAt;
  const step = stepFor(item.unit);
  const onError = (e: unknown) => toast(errorMessage(e), { tone: 'danger' });

  const remove = () =>
    Alert.alert(t('shopping.deleteItemTitle'), t('shopping.deleteItemMessage', { name: item.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => services.shopping.removeItem(item.id).catch(onError) },
    ]);

  const setQty = (milli: number) =>
    services.shopping.updateItem(item.id, { name: item.name, quantityMilli: milli, unit: item.unit }).catch(onError);

  return (
    <View style={styles.item}>
      <PressableScale
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked, disabled: done }}
        accessibilityLabel={`${item.name}, ${qty(item.quantityMilli, item.unit)}`}
        accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && remove()}
        disabled={done}
        onPress={() => services.shopping.setChecked(item.id, !item.checked).catch(onError)}
        onLongPress={remove}
        scaleTo={0.97}
        style={styles.check}
      >
        <View
          style={[
            styles.circle,
            { borderColor: item.checked ? colors.primary : colors.textMuted, backgroundColor: item.checked ? colors.primary : 'transparent' },
          ]}
        >
          {item.checked ? <Ionicons name={done ? 'checkmark-done' : 'checkmark'} size={18} color={colors.onPrimary} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: item.checked ? colors.textMuted : colors.text,
              fontSize: font.body,
              fontWeight: '600',
              textDecorationLine: item.checked ? 'line-through' : 'none',
            }}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {done ? <Text style={{ color: colors.textMuted, fontSize: font.small }}>{t('shopping.transferred')}</Text> : null}
        </View>
      </PressableScale>
      {done ? (
        <Text style={{ color: colors.textMuted }}>{qty(item.quantityMilli, item.unit)}</Text>
      ) : (
        <Stepper
          label={item.name}
          value={`${formatMilli(item.quantityMilli)} ${t(`units.${item.unit}`)}`}
          canDecrement={item.quantityMilli > step}
          onDecrement={() => void setQty(item.quantityMilli - step)}
          onIncrement={() => void setQty(item.quantityMilli + step)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  quickAdd: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, paddingLeft: spacing.lg, paddingRight: spacing.xs },
  overline: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupTitle: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, minHeight: 40, borderRadius: radius.pill, maxWidth: 220 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60 },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' },
  bottomBar: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  transferWrap: { borderRadius: radius.md },
  transfer: { minHeight: 56, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
