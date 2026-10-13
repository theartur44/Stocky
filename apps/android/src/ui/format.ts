import { daysBetween, formatLocalDate, type LocalDate } from '../domain/dates';
import { getExpiryStatus, type ExpiryKind, type ExpiryStatus } from '../domain/expiry';
import { CATEGORIES, LOCATIONS } from '../domain/models';
import { formatQuantity, UNITS, type Unit } from '../domain/units';
import { t } from '../i18n';
import type { Tone } from './components';

export function expiryLabel(
  lot: { expiryDate: LocalDate | null; expiryKind: ExpiryKind; expiryEstimated?: boolean },
  today: LocalDate,
  warnDays: number,
): { status: ExpiryStatus; label: string; tone: Tone } {
  const status = getExpiryStatus(lot, today, warnDays);
  const date = lot.expiryDate ? formatLocalDate(lot.expiryDate) : '';
  let label: string;
  switch (status) {
    case 'none':
      label = t('expiryStatus.none');
      break;
    case 'ok':
      label = t('expiryStatus.ok', { date });
      break;
    case 'soon':
      label = t('expiryStatus.soon', { count: daysBetween(today, lot.expiryDate!) });
      break;
    case 'today':
      label = t('expiryStatus.today');
      break;
    case 'expired':
      label = t('expiryStatus.expired', { date });
      break;
    case 'best_before_passed':
      label = t('expiryStatus.best_before_passed', { date });
      break;
  }
  if (lot.expiryEstimated && status !== 'none') label += ` · ${t('expiryStatus.estimated')}`;
  const tone: Tone =
    status === 'expired' ? 'danger' : status === 'soon' || status === 'today' || status === 'best_before_passed' ? 'warning' : 'neutral';
  return { status, label, tone };
}

export const qty = (milli: number, unit: Unit) => formatQuantity(milli, unit);

export const unitOptions = UNITS.map((u) => ({ value: u, label: t(`units.${u}`) }));
export const locationOptions = LOCATIONS.map((l) => ({ value: l, label: t(`locations.${l}`) }));
export const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }));
export const expiryKindOptions = (['use_by', 'best_before'] as const).map((k) => ({
  value: k,
  label: t(`expiryKinds.${k}`),
}));
