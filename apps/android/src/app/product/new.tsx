import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image } from 'react-native';

import { isCategory } from '../../domain/models';
import { isUnit } from '../../domain/units';
import { isSafeImageUrl } from '../../domain/validation';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage, fieldErrors } from '../../state/errors';
import { useAction } from '../../state/hooks';
import { Button, Card, Notice, Screen, Title } from '../../ui/components';
import {
  emptyLotDraft,
  emptyProductDraft,
  LotFields,
  lotDraftToInput,
  ProductFields,
  productDraftToInput,
  useFormErrors,
} from '../../ui/forms';
import { radius } from '../../ui/theme';

type Params = {
  barcode?: string;
  name?: string;
  brand?: string;
  imageUrl?: string;
  category?: string;
  unit?: string;
  source?: string;
};

/** Alta de producto con sus primeras existencias (manual o desde el escáner). */
export default function NewProductScreen() {
  const p = useLocalSearchParams<Params>();
  const { services } = useApp();
  const fromOff = p.source === 'openfoodfacts';
  const unit = isUnit(p.unit) ? p.unit : 'unit';
  const [product, setProduct] = useState(() =>
    emptyProductDraft({
      name: p.name ?? '',
      brand: p.brand ?? '',
      barcode: p.barcode ?? '',
      category: isCategory(p.category) ? p.category : 'other',
      defaultUnit: unit,
      imageUrl: p.imageUrl && isSafeImageUrl(p.imageUrl) ? p.imageUrl : null,
      source: fromOff ? 'openfoodfacts' : 'manual',
    }),
  );
  const [lot, setLot] = useState(() => emptyLotDraft({ unit, quantity: '1' }));
  const [errors, setErrors] = useFormErrors();
  const [message, setMessage] = useState<string | null>(null);

  const [save, busy] = useAction(async () => {
    const pr = productDraftToInput(product);
    const lr = lotDraftToInput(lot);
    const localErrors = { ...pr.errors, ...lr.errors };
    if (!pr.input || !lr.input) {
      setErrors(localErrors);
      return;
    }
    try {
      const result = await services.inventory.addStock({ product: pr.input }, lr.input);
      router.replace({ pathname: '/product/[id]', params: { id: result.product.id } });
    } catch (e) {
      setErrors(fieldErrors(e));
      setMessage(errorMessage(e));
    }
  });

  return (
    <Screen>
      {fromOff ? <Notice message={t('product.fromOff')} tone="warning" /> : null}
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          accessibilityIgnoresInvertColors
          accessible={false}
          style={{ width: 120, height: 120, borderRadius: radius.md, alignSelf: 'center' }}
          resizeMode="contain"
        />
      ) : null}
      <Card>
        <ProductFields
          value={product}
          onChange={(v) => {
            // La ubicación habitual se propone también para el lote.
            if (v.defaultPlaceId !== product.defaultPlaceId || v.defaultLocation !== product.defaultLocation || v.defaultUnit !== product.defaultUnit) {
              setLot({ ...lot, location: v.defaultLocation, placeId: v.defaultPlaceId, unit: v.defaultUnit });
            }
            setProduct(v);
          }}
          errors={errors}
        />
      </Card>
      <Card>
        <Title>{t('product.firstLot')}</Title>
        <LotFields value={lot} onChange={setLot} errors={errors} />
      </Card>
      {message ? <Notice message={message} tone="danger" /> : null}
      <Button label={t('common.save')} icon="checkmark" onPress={() => void save()} loading={busy} />
    </Screen>
  );
}
