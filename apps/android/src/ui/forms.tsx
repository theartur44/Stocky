import { useState } from 'react';
import { View } from 'react-native';

import { addDays, formatLocalDate, parseUserDate, toLocalDate, type LocalDate } from '../domain/dates';
import type { ExpiryKind } from '../domain/expiry';
import type { Category, Location } from '../domain/models';
import { formatMilli, parseQuantity, type Unit } from '../domain/units';
import type { LotInput, ProductInput } from '../domain/validation';
import { t } from '../i18n';
import { Body, Button, ChipGroup, SwitchRow, TextField } from './components';
import { categoryOptions, expiryKindOptions, locationOptions, unitOptions } from './format';
import { spacing } from './theme';

// ------------------------------------------------------------------ producto

export interface ProductDraft {
  name: string;
  brand: string;
  barcode: string;
  category: Category;
  defaultUnit: Unit;
  defaultLocation: Location;
  lowStock: string;
  notes: string;
  imageUrl: string | null;
  source: 'manual' | 'openfoodfacts';
}

export function emptyProductDraft(partial: Partial<ProductDraft> = {}): ProductDraft {
  return {
    name: '',
    brand: '',
    barcode: '',
    category: 'other',
    defaultUnit: 'unit',
    defaultLocation: 'pantry',
    lowStock: '',
    notes: '',
    imageUrl: null,
    source: 'manual',
    ...partial,
  };
}

/** Convierte el borrador en entrada de dominio. Devuelve errores locales de formato. */
export function productDraftToInput(d: ProductDraft): { input?: ProductInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let threshold: number | null = null;
  if (d.lowStock.trim()) {
    threshold = parseQuantity(d.lowStock);
    if (threshold === null) errors.lowStockThresholdMilli = t('errors.invalidQuantity');
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: {
      name: d.name,
      brand: d.brand || null,
      barcode: d.barcode || null,
      category: d.category,
      defaultUnit: d.defaultUnit,
      defaultLocation: d.defaultLocation,
      lowStockThresholdMilli: threshold,
      imageUrl: d.imageUrl,
      source: d.source,
      notes: d.notes || null,
    },
  };
}

export function ProductFields({
  value,
  onChange,
  errors,
}: {
  value: ProductDraft;
  onChange: (v: ProductDraft) => void;
  errors: Record<string, string>;
}) {
  const set = <K extends keyof ProductDraft>(k: K) => (v: ProductDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: spacing.md }}>
      <TextField label={t('product.name')} value={value.name} onChangeText={set('name')} error={errors.name} maxLength={120} />
      <TextField
        label={`${t('product.brand')} (${t('common.optional')})`}
        value={value.brand}
        onChangeText={set('brand')}
        error={errors.brand}
        maxLength={80}
      />
      <TextField
        label={`${t('product.barcode')} (${t('common.optional')})`}
        value={value.barcode}
        onChangeText={set('barcode')}
        error={errors.barcode}
        keyboardType="number-pad"
        maxLength={48}
      />
      <ChipGroup label={t('product.category')} options={categoryOptions} value={value.category} onChange={set('category')} />
      <ChipGroup label={t('product.defaultUnit')} options={unitOptions} value={value.defaultUnit} onChange={set('defaultUnit')} />
      <ChipGroup
        label={t('product.defaultLocation')}
        options={locationOptions}
        value={value.defaultLocation}
        onChange={set('defaultLocation')}
      />
      <TextField
        label={`${t('product.lowStock')} (${t(`units.${value.defaultUnit}`)})`}
        hint={t('product.lowStockHelp')}
        value={value.lowStock}
        onChangeText={set('lowStock')}
        error={errors.lowStockThresholdMilli}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <TextField
        label={`${t('product.notes')} (${t('common.optional')})`}
        value={value.notes}
        onChangeText={set('notes')}
        error={errors.notes}
        multiline
        maxLength={500}
      />
    </View>
  );
}

// ------------------------------------------------------------------ lote

export interface LotDraft {
  quantity: string;
  unit: Unit;
  location: Location;
  addedOn: LocalDate;
  expiry: string;
  expiryKind: ExpiryKind;
  estimated: boolean;
  lotCode: string;
  notes: string;
}

export function emptyLotDraft(partial: Partial<LotDraft> = {}): LotDraft {
  return {
    quantity: '1',
    unit: 'unit',
    location: 'pantry',
    addedOn: toLocalDate(new Date()),
    expiry: '',
    expiryKind: 'use_by',
    estimated: false,
    lotCode: '',
    notes: '',
    ...partial,
  };
}

export function lotToDraft(l: LotInput): LotDraft {
  return {
    quantity: formatMilli(l.quantityMilli),
    unit: l.unit,
    location: l.location,
    addedOn: l.addedOn,
    expiry: l.expiryDate ? formatLocalDate(l.expiryDate) : '',
    expiryKind: l.expiryKind,
    estimated: l.expiryEstimated ?? false,
    lotCode: l.lotCode ?? '',
    notes: l.notes ?? '',
  };
}

export function lotDraftToInput(d: LotDraft): { input?: LotInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const quantityMilli = parseQuantity(d.quantity);
  if (quantityMilli === null) errors.quantity = t('errors.invalidQuantity');
  let expiryDate: LocalDate | null = null;
  if (d.expiry.trim()) {
    expiryDate = parseUserDate(d.expiry);
    if (!expiryDate) errors.expiryDate = t('errors.invalidDate');
  }
  if (Object.keys(errors).length || quantityMilli === null) return { errors };
  return {
    errors,
    input: {
      quantityMilli,
      unit: d.unit,
      location: d.location,
      addedOn: d.addedOn,
      expiryDate,
      expiryKind: d.expiryKind,
      expiryEstimated: d.estimated,
      lotCode: d.lotCode || null,
      notes: d.notes || null,
    },
  };
}

export function LotFields({
  value,
  onChange,
  errors,
}: {
  value: LotDraft;
  onChange: (v: LotDraft) => void;
  errors: Record<string, string>;
}) {
  const set = <K extends keyof LotDraft>(k: K) => (v: LotDraft[K]) => onChange({ ...value, [k]: v });
  const today = toLocalDate(new Date());
  const quick = (days: number | null) => set('expiry')(days === null ? '' : formatLocalDate(addDays(today, days)));
  return (
    <View style={{ gap: spacing.md }}>
      <TextField
        label={t('lot.quantity')}
        value={value.quantity}
        onChangeText={set('quantity')}
        error={errors.quantity}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <ChipGroup label={t('lot.unit')} options={unitOptions} value={value.unit} onChange={set('unit')} />
      <ChipGroup label={t('lot.location')} options={locationOptions} value={value.location} onChange={set('location')} />
      <ChipGroup label={t('lot.expiryKind')} options={expiryKindOptions} value={value.expiryKind} onChange={set('expiryKind')} />
      <Body muted small>
        {t(`expiryKindHelp.${value.expiryKind}`)}
      </Body>
      <TextField
        label={t('lot.expiryDate')}
        hint={t('lot.expiryDateHint')}
        placeholder="dd/mm/aaaa"
        value={value.expiry}
        onChangeText={set('expiry')}
        error={errors.expiryDate}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button compact variant="secondary" label={t('lot.quick.plus3')} onPress={() => quick(3)} />
        <Button compact variant="secondary" label={t('lot.quick.plus7')} onPress={() => quick(7)} />
        <Button compact variant="secondary" label={t('lot.quick.plus30')} onPress={() => quick(30)} />
        <Button compact variant="ghost" label={t('lot.quick.none')} onPress={() => quick(null)} />
      </View>
      {value.expiry.trim() ? (
        <SwitchRow label={t('lot.estimated')} value={value.estimated} onChange={set('estimated')} />
      ) : null}
      <TextField
        label={`${t('lot.lotCode')} (${t('common.optional')})`}
        value={value.lotCode}
        onChangeText={set('lotCode')}
        error={errors.lotCode}
        maxLength={40}
      />
      <TextField
        label={`${t('lot.notes')} (${t('common.optional')})`}
        value={value.notes}
        onChangeText={set('notes')}
        error={errors.notes}
        multiline
        maxLength={500}
      />
    </View>
  );
}

/** Estado de formulario con errores de campo. */
export function useFormErrors() {
  return useState<Record<string, string>>({});
}
