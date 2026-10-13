import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShoppingItem } from '../../domain/models';
import { parseQuantity, type Unit } from '../../domain/units';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage, fieldErrors } from '../../state/errors';
import { useAction, useServiceQuery } from '../../state/hooks';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorView,
  IconButton,
  LoadingView,
  Notice,
  Screen,
  TextField,
  Title,
} from '../../ui/components';
import { qty, unitOptions } from '../../ui/format';
import { font, spacing, useTheme } from '../../ui/theme';

export default function ShoppingScreen() {
  const { services } = useApp();
  const [listId, setListId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const q = useServiceQuery(
    async () => {
      const lists = await services.shopping.lists();
      const current = lists.find((l) => l.id === listId) ?? lists[0] ?? (await services.shopping.ensureDefaultList());
      const items = await services.shopping.items(current.id);
      return { lists: lists.length ? lists : [current], current, items };
    },
    [services, listId],
    ['shopping', 'inventory'],
  );

  useEffect(() => setMessage(null), [listId]);

  if (q.loading) return <LoadingView />;
  if (q.error || !q.data) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  const { lists, current, items } = q.data;
  const checkedPending = items.filter((i) => i.checked && !i.transferredAt);
  const transferred = items.filter((i) => i.transferredAt);

  const confirmTransfer = () => {
    const count = checkedPending.length;
    Alert.alert(t('shopping.transferTitle'), t('shopping.transferMessage', { count }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          try {
            const n = await services.shopping.transferChecked(current.id);
            setMessage(t('shopping.transferDone', { count: n }));
          } catch (e) {
            setMessage(errorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ListSelector lists={lists} currentId={current.id} onSelect={setListId} />
      <AddItemForm listId={current.id} onMessage={setMessage} />
      {message ? <Notice message={message} /> : null}
      <Button
        label={t('shopping.scanToList')}
        icon="barcode-outline"
        variant="secondary"
        onPress={() => router.push({ pathname: '/scan', params: { mode: 'shopping', listId: current.id } })}
      />

      {items.length === 0 ? (
        <EmptyState icon="cart-outline" message={t('shopping.empty')} />
      ) : (
        <Card>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} onError={(e) => setMessage(errorMessage(e))} />
          ))}
        </Card>
      )}

      {checkedPending.length > 0 ? (
        <Button
          label={t('shopping.transfer', { count: checkedPending.length })}
          icon="arrow-down-circle-outline"
          onPress={confirmTransfer}
        />
      ) : null}
      {transferred.length > 0 ? (
        <Button
          label={t('shopping.clearTransferred')}
          variant="ghost"
          onPress={() => services.shopping.clearTransferred(current.id).catch((e) => setMessage(errorMessage(e)))}
        />
      ) : null}
    </Screen>
  );
}

function ItemRow({ item, onError }: { item: ShoppingItem; onError: (e: unknown) => void }) {
  const { services } = useApp();
  const { colors } = useTheme();
  const done = !!item.transferredAt;
  const status = done ? t('shopping.transferred') : item.checked ? t('shopping.inCart') : t('shopping.pending');

  const remove = () =>
    Alert.alert(t('shopping.deleteItemTitle'), t('shopping.deleteItemMessage', { name: item.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => services.shopping.removeItem(item.id).catch(onError) },
    ]);

  return (
    <View style={[styles.item, { borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked, disabled: done }}
        accessibilityLabel={`${item.name}, ${qty(item.quantityMilli, item.unit)}. ${status}`}
        disabled={done}
        onPress={() => services.shopping.setChecked(item.id, !item.checked).catch(onError)}
        style={styles.check}
      >
        <Ionicons
          name={done ? 'checkmark-done-circle' : item.checked ? 'checkbox' : 'square-outline'}
          size={28}
          color={done ? colors.textMuted : colors.primary}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: done ? colors.textMuted : colors.text,
              fontSize: font.body,
              textDecorationLine: item.checked ? 'line-through' : 'none',
            }}
          >
            {item.name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.small }}>
            {qty(item.quantityMilli, item.unit)}
            {done ? ` · ${t('shopping.transferred')}` : ''}
          </Text>
        </View>
      </Pressable>
      <IconButton icon="trash-outline" label={`${t('common.delete')} ${item.name}`} onPress={remove} />
    </View>
  );
}

function AddItemForm({ listId, onMessage }: { listId: string; onMessage: (m: string | null) => void }) {
  const { services } = useApp();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<Unit>('unit');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [add, busy] = useAction(async () => {
    const quantityMilli = parseQuantity(amount);
    if (quantityMilli === null) {
      setErrors({ quantity: t('errors.invalidQuantity') });
      return;
    }
    try {
      const r = await services.shopping.addItem(listId, { name, quantityMilli, unit });
      setName('');
      setAmount('1');
      setErrors({});
      onMessage(r.merged ? t('shopping.merged') : null);
    } catch (e) {
      setErrors(fieldErrors(e));
      onMessage(errorMessage(e));
    }
  });

  return (
    <Card>
      <TextField
        label={t('common.add')}
        placeholder={t('shopping.addPlaceholder')}
        value={name}
        onChangeText={setName}
        error={errors.name}
        returnKeyType="done"
        onSubmitEditing={() => void add()}
        maxLength={120}
      />
      <View style={styles.qtyRow}>
        <View style={{ width: 110 }}>
          <TextField
            label={t('shopping.quantity')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            error={errors.quantity}
            maxLength={12}
          />
        </View>
        <View style={{ flex: 1 }}>
          <ChipGroup label={t('lot.unit')} options={unitOptions} value={unit} onChange={setUnit} />
        </View>
      </View>
      <Button label={t('common.add')} icon="add" onPress={() => void add()} loading={busy} disabled={!name.trim()} />
    </Card>
  );
}

function ListSelector({
  lists,
  currentId,
  onSelect,
}: {
  lists: { id: string; name: string }[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const { services } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const current = lists.find((l) => l.id === currentId);

  const create = async () => {
    try {
      const list = await services.shopping.createList(name);
      setCreating(false);
      setName('');
      setError(null);
      onSelect(list.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = () => {
    if (!current || lists.length <= 1) return;
    Alert.alert(t('shopping.deleteList'), t('shopping.deleteListMessage', { name: current.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await services.shopping.deleteList(current.id);
          onSelect(lists.find((l) => l.id !== current.id)!.id);
        },
      },
    ]);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Title>{current?.name ?? t('shopping.title')}</Title>
      {lists.length > 1 ? (
        <ChipGroup
          label={t('shopping.lists')}
          options={lists.map((l) => ({ value: l.id, label: l.name }))}
          value={currentId}
          onChange={onSelect}
        />
      ) : null}
      {creating ? (
        <Card>
          <TextField label={t('shopping.newListName')} value={name} onChangeText={setName} error={error} maxLength={60} autoFocus />
          <View style={styles.qtyRow}>
            <View style={{ flex: 1 }}>
              <Button label={t('common.cancel')} variant="ghost" onPress={() => setCreating(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('common.save')} onPress={() => void create()} disabled={!name.trim()} />
            </View>
          </View>
        </Card>
      ) : (
        <View style={styles.qtyRow}>
          <View style={{ flex: 1 }}>
            <Button label={t('shopping.newList')} variant="ghost" icon="add" compact onPress={() => setCreating(true)} />
          </View>
          {lists.length > 1 ? (
            <View style={{ flex: 1 }}>
              <Button label={t('shopping.deleteList')} variant="ghost" icon="trash-outline" compact onPress={remove} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  qtyRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
});
