import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage, fieldErrors } from '../../state/errors';
import { useAction, useServiceQuery } from '../../state/hooks';
import { Body, Button, Card, ErrorView, LoadingView, Notice, Screen } from '../../ui/components';
import { emptyLotDraft, LotFields, lotDraftToInput, lotToDraft, useFormErrors, type LotDraft } from '../../ui/forms';

/** Alta (`productId`) o edición (`lotId`) de un lote de existencias. */
export default function LotEditScreen() {
  const { lotId, productId } = useLocalSearchParams<{ lotId?: string; productId?: string }>();
  const { services } = useApp();
  const editing = typeof lotId === 'string' && lotId.length > 0;

  const q = useServiceQuery(
    async () => {
      if (editing) {
        const lot = await services.inventory.getLot(lotId);
        if (!lot) return null;
        const product = await services.inventory.getProduct(lot.productId);
        return product ? { product, lot } : null;
      }
      const product = await services.inventory.getProduct(String(productId));
      return product ? { product, lot: null } : null;
    },
    [services, lotId, productId],
    [],
  );
  const [draft, setDraft] = useState<LotDraft | null>(null);
  const [errors, setErrors] = useFormErrors();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data || draft) return;
    const { product, lot } = q.data;
    setDraft(lot ? lotToDraft(lot) : emptyLotDraft({ unit: product.defaultUnit, location: product.defaultLocation }));
  }, [q.data, draft]);

  const [save, busy] = useAction(async () => {
    if (!draft || !q.data) return;
    const r = lotDraftToInput(draft);
    if (!r.input) {
      setErrors(r.errors);
      return;
    }
    try {
      if (q.data.lot) await services.inventory.updateLot(q.data.lot.id, r.input);
      else await services.inventory.addStock({ productId: q.data.product.id }, r.input);
      router.back();
    } catch (e) {
      setErrors(fieldErrors(e));
      setMessage(errorMessage(e));
    }
  });

  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  if (!q.data) return <ErrorView message={t('errors.not_found')} />;
  if (!draft) return <LoadingView />;

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? t('lot.editTitle') : t('lot.newTitle') }} />
      <Body muted>{q.data.product.name}</Body>
      <Card>
        <LotFields value={draft} onChange={setDraft} errors={errors} />
      </Card>
      {message ? <Notice message={message} tone="danger" /> : null}
      <Button label={t('common.save')} icon="checkmark" onPress={() => void save()} loading={busy} />
    </Screen>
  );
}
