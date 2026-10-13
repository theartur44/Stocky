import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { formatMilli } from '../../../domain/units';
import { t } from '../../../i18n';
import { useApp } from '../../../state/AppProvider';
import { errorMessage, fieldErrors } from '../../../state/errors';
import { useAction, useServiceQuery } from '../../../state/hooks';
import { Button, Card, ErrorView, LoadingView, Notice, Screen } from '../../../ui/components';
import { emptyProductDraft, ProductFields, productDraftToInput, useFormErrors, type ProductDraft } from '../../../ui/forms';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { services } = useApp();
  const q = useServiceQuery(() => services.inventory.getProduct(String(id)), [services, id], []);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [errors, setErrors] = useFormErrors();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const p = q.data;
    if (!p || draft) return;
    setDraft(
      emptyProductDraft({
        name: p.name,
        brand: p.brand ?? '',
        barcode: p.barcode ?? '',
        category: p.category,
        defaultUnit: p.defaultUnit,
        defaultLocation: p.defaultLocation,
        lowStock: p.lowStockThresholdMilli ? formatMilli(p.lowStockThresholdMilli) : '',
        notes: p.notes ?? '',
        imageUrl: p.imageUrl,
        source: p.source,
      }),
    );
  }, [q.data, draft]);

  const [save, busy] = useAction(async () => {
    if (!draft) return;
    const r = productDraftToInput(draft);
    if (!r.input) {
      setErrors(r.errors);
      return;
    }
    try {
      await services.inventory.updateProduct(String(id), r.input);
      router.back();
    } catch (e) {
      setErrors(fieldErrors(e));
      setMessage(errorMessage(e));
    }
  });

  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  if (!q.data) return <ErrorView message={t('product.notFound')} />;
  if (!draft) return <LoadingView />;

  return (
    <Screen>
      <Card>
        <ProductFields value={draft} onChange={setDraft} errors={errors} />
      </Card>
      {message ? <Notice message={message} tone="danger" /> : null}
      <Button label={t('common.save')} icon="checkmark" onPress={() => void save()} loading={busy} />
    </Screen>
  );
}
