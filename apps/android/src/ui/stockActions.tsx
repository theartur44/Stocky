import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { FREEZE_DAYS } from '../services/inventoryService';
import type { ConsumeResult } from '../services/inventoryService';
import { addDays, toLocalDate } from '../domain/dates';
import { defaultShoppingAmount } from '../domain/inventory';
import type { StockLot } from '../domain/models';
import type { Place } from '../domain/places';
import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { errorMessage } from '../state/errors';
import { Button } from './components';
import { PlacePicker } from './places';
import { spacing } from './theme';
import { useToast } from './toast';

/**
 * Tras gastar o tirar: aviso con «Deshacer» y, si ya no queda nada del
 * producto, la pregunta de si se añade a la lista de la compra.
 */
export function useStockFeedback() {
  const { services } = useApp();
  const toast = useToast();

  const offerShoppingList = useCallback(
    (product: { id: string; name: string }) =>
      Alert.alert(t('finished.title', { name: product.name }), t('finished.message'), [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('finished.add'),
          onPress: async () => {
            try {
              const p = await services.inventory.getProduct(product.id);
              const list = await services.shopping.ensureDefaultList();
              const amount = p ? defaultShoppingAmount(p) : { quantityMilli: 1000, unit: 'unit' as const };
              await services.shopping.addItem(list.id, { name: product.name, productId: product.id, ...amount });
              toast(t('finished.added', { name: product.name }), { icon: 'cart' });
            } catch (e) {
              toast(errorMessage(e), { tone: 'danger' });
            }
          },
        },
      ]),
    [services, toast],
  );

  return useCallback(
    (text: string, result: ConsumeResult, product: { id: string; name: string }) => {
      toast(text, {
        icon: 'checkmark-circle',
        action: {
          label: t('history.undo'),
          onPress: () =>
            void services.history.undo(result.batchId).then(
              () => toast(t('history.undone'), { icon: 'arrow-undo' }),
              (e: unknown) => toast(errorMessage(e), { tone: 'danger' }),
            ),
        },
      });
      if (result.productEmpty) offerShoppingList(product);
    },
    [services, toast, offerShoppingList],
  );
}

/** Pide confirmación de fecha nueva al pasar algo al congelador. */
function askFreezeDate(onAnswer: (newDate: boolean) => void) {
  Alert.alert(t('lotActions.freezeDateTitle'), t('lotActions.freezeDateMessage', { months: Math.round(FREEZE_DAYS / 30) }), [
    { text: t('lotActions.keepDate'), onPress: () => onAnswer(false) },
    { text: t('lotActions.newDate'), onPress: () => onAnswer(true) },
  ]);
}

/**
 * Acciones rápidas sobre un lote. `compact` muestra solo las más habituales
 * (para listas); la versión completa añade abrir y mover a otro sitio.
 */
export function LotActions({ lot, productName, compact = false }: { lot: StockLot; productName: string; compact?: boolean }) {
  const { services } = useApp();
  const toast = useToast();
  const feedback = useStockFeedback();
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const product = { id: lot.productId, name: productName };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const moveTo = (place: Place) => {
    setMoving(false);
    if (place.id === lot.placeId) return;
    const go = (newDate: boolean) =>
      void run(async () => {
        await services.inventory.moveLot(
          lot.id,
          place.id,
          newDate ? { date: addDays(toLocalDate(new Date()), FREEZE_DAYS), kind: 'best_before' } : null,
        );
        toast(t('lotActions.moved'), { icon: 'swap-horizontal' });
      });
    if (place.kind === 'freezer' && lot.location !== 'freezer') askFreezeDate(go);
    else go(false);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button
          compact
          variant="tonal"
          icon="checkmark-done"
          label={t('lotActions.finished')}
          disabled={busy}
          onPress={() =>
            void run(async () => feedback(t('lotActions.finishedDone', { name: productName }), await services.inventory.finishLot(lot.id), product))
          }
        />
        {!compact && !lot.openedOn ? (
          <Button
            compact
            variant="secondary"
            icon="lock-open-outline"
            label={t('lotActions.open')}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const r = await services.inventory.openLot(lot.id);
                toast(r.expiryChanged ? t('lotActions.openedNewDate') : t('lotActions.openedDone'), { icon: 'lock-open' });
              })
            }
          />
        ) : null}
        {lot.location !== 'freezer' ? (
          <Button
            compact
            variant="secondary"
            icon="snow-outline"
            label={t('lotActions.freeze')}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await services.inventory.freezeLot(lot.id);
                toast(t('lotActions.frozen', { months: Math.round(FREEZE_DAYS / 30) }), { icon: 'snow' });
              })
            }
          />
        ) : null}
        {!compact ? (
          <Button compact variant="secondary" icon="swap-horizontal" label={t('lotActions.move')} disabled={busy} onPress={() => setMoving(!moving)} />
        ) : null}
        <Button
          compact
          variant="ghost"
          icon="trash-outline"
          label={t('lotActions.discard')}
          disabled={busy}
          onPress={() =>
            void run(async () => feedback(t('lotActions.discarded', { name: productName }), await services.inventory.discardLot(lot.id), product))
          }
        />
      </View>
      {moving ? <PlacePicker label={t('lotActions.moveTo')} placeId={lot.placeId} kind={lot.location} manage={false} onChange={moveTo} /> : null}
    </View>
  );
}
