import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { formatLocalDate, toLocalDate } from '../../domain/dates';
import { defaultShoppingAmount, summarizeProduct } from '../../domain/inventory';
import type { StockLot } from '../../domain/models';
import { areCompatible, parseQuantity, UNITS, type Unit } from '../../domain/units';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useAction, useServiceQuery } from '../../state/hooks';
import {
  Badge,
  Body,
  Button,
  Card,
  CategoryAvatar,
  ChipGroup,
  ErrorView,
  ListRow,
  LoadingView,
  Notice,
  Screen,
  TextField,
  ProductImage,
  Title,
} from '../../ui/components';
import { expiryLabel, qty } from '../../ui/format';
import { usePlaces } from '../../ui/places';
import { LotActions, useStockFeedback } from '../../ui/stockActions';
import { spacing } from '../../ui/theme';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = String(id);
  const { services, settings } = useApp();
  const { nameOf } = usePlaces();
  const [consuming, setConsuming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'danger' } | null>(null);

  const q = useServiceQuery(
    async () => {
      const product = await services.inventory.getProduct(productId);
      if (!product) return null;
      return { product, lots: await services.inventory.listLots(productId) };
    },
    [services, productId],
    ['inventory'],
  );

  const [addToShopping, addingToShopping] = useAction(async () => {
    if (!q.data) return;
    try {
      const list = await services.shopping.ensureDefaultList();
      const { product } = q.data;
      const r = await services.shopping.addItem(list.id, {
        name: product.name,
        productId: product.id,
        ...defaultShoppingAmount(product),
      });
      setMessage({ text: r.merged ? t('product.mergedInShopping') : t('product.addedToShopping'), tone: 'neutral' });
    } catch (e) {
      setMessage({ text: errorMessage(e), tone: 'danger' });
    }
  });

  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  if (!q.data) return <ErrorView message={t('product.notFound')} />;
  const { product, lots } = q.data;
  const summary = summarizeProduct(product, lots);
  const today = toLocalDate(new Date());

  const deleteProduct = () =>
    Alert.alert(t('product.deleteTitle'), t('product.deleteMessage', { name: product.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await services.inventory.deleteProduct(product.id);
            router.back();
          } catch (e) {
            setMessage({ text: errorMessage(e), tone: 'danger' });
          }
        },
      },
    ]);

  const deleteLot = (lot: StockLot) =>
    Alert.alert(t('lot.deleteTitle'), t('lot.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          services.inventory.deleteLot(lot.id).catch((e) => setMessage({ text: errorMessage(e), tone: 'danger' })),
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: product.name }} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <ProductImage uri={product.imageUrl} category={product.category} size={72} radius={20} />
        <View style={{ flex: 1, gap: 4 }}>
          <Title>{product.name}</Title>
          <Body muted small>
            {[product.brand, t(`categories.${product.category}`), product.barcode].filter(Boolean).join(' · ')}
          </Body>
          {lots.length > 0 ? (
            <Badge label={`${t('product.total')}: ${qty(summary.totalMilli, product.defaultUnit)}`} tone="success" icon="cube" />
          ) : (
            <Badge label={t('inventory.noStock')} tone="neutral" />
          )}
        </View>
      </Card>
      {product.notes ? <Body>{product.notes}</Body> : null}
      {message ? <Notice message={message.text} tone={message.tone} /> : null}

      <Card>
        <Title>{t('product.lotsTitle')}</Title>
        {lots.length === 0 ? <Body muted>{t('product.noLots')}</Body> : null}
        {lots.map((lot) => {
          const e = expiryLabel(lot, today, settings.warnDays);
          return (
            <View key={lot.id} style={{ gap: spacing.sm }}>
              <ListRow
                title={`${qty(lot.quantityMilli, lot.unit)} · ${nameOf(lot)}`}
                subtitle={[
                  lot.expiryDate ? t(`expiryKinds.${lot.expiryKind}`) : null,
                  `${t('lot.addedOn')}: ${formatLocalDate(lot.addedOn)}`,
                  lot.lotCode ? `${t('lot.lotCode')}: ${lot.lotCode}` : null,
                  lot.openedOn ? t('lot.openedOn', { date: formatLocalDate(lot.openedOn) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<Badge label={e.label} tone={e.tone} />}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Button compact label={t('lot.consume')} icon="remove-circle-outline" onPress={() => setConsuming(consuming === lot.id ? null : lot.id)} />
                <Button
                  compact
                  variant="secondary"
                  label={t('common.edit')}
                  onPress={() => router.push({ pathname: '/lot/edit', params: { lotId: lot.id } })}
                />
                <Button compact variant="ghost" label={t('common.delete')} onPress={() => deleteLot(lot)} />
              </View>
              <LotActions lot={lot} productName={product.name} />
              {consuming === lot.id ? (
                <ConsumePanel
                  lot={lot}
                  productName={product.name}
                  onDone={(err) => {
                    setConsuming(null);
                    if (err) setMessage({ text: errorMessage(err), tone: 'danger' });
                  }}
                />
              ) : null}
            </View>
          );
        })}
        <Button
          label={t('product.addLot')}
          icon="add"
          variant="secondary"
          onPress={() => router.push({ pathname: '/lot/edit', params: { productId: product.id } })}
        />
      </Card>

      <Notice message={t('expiryDisclaimer')} />

      <Button label={t('product.addToShopping')} icon="cart-outline" variant="secondary" onPress={() => void addToShopping()} loading={addingToShopping} />
      <Button
        label={t('product.editTitle')}
        icon="create-outline"
        variant="secondary"
        onPress={() => router.push({ pathname: '/product/edit/[id]', params: { id: product.id } })}
      />
      <Button label={t('product.deleteTitle')} icon="trash-outline" variant="danger" onPress={deleteProduct} />
    </Screen>
  );
}

function ConsumePanel({
  lot,
  productName,
  onDone,
}: {
  lot: StockLot;
  productName: string;
  onDone: (error?: unknown) => void;
}) {
  const { services } = useApp();
  const feedback = useStockFeedback();
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<Unit>(lot.unit);
  const [error, setError] = useState<string | null>(null);
  const options = UNITS.filter((u) => areCompatible(u, lot.unit)).map((u) => ({ value: u, label: t(`units.${u}`) }));

  const [consume, busy] = useAction(async (milli: number | null, u: Unit) => {
    if (milli === null) {
      setError(t('errors.invalidQuantity'));
      return;
    }
    try {
      const r = await services.inventory.consumeFromLot(lot.id, milli, u);
      onDone();
      feedback(t('lotActions.consumedDone', { amount: qty(milli, u), name: productName }), r, { id: lot.productId, name: productName });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Card>
      <Body>{t('lot.consumeTitle', { name: productName })}</Body>
      <TextField
        label={t('lot.consumeAmount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        error={error}
        maxLength={12}
      />
      {options.length > 1 ? <ChipGroup options={options} value={unit} onChange={setUnit} /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button compact label={t('lot.consume')} onPress={() => void consume(parseQuantity(amount), unit)} loading={busy} />
        <Button compact variant="secondary" label={t('lot.consumeAll')} onPress={() => void consume(lot.quantityMilli, lot.unit)} />
        <Button compact variant="ghost" label={t('common.cancel')} onPress={() => onDone()} />
      </View>
    </Card>
  );
}
