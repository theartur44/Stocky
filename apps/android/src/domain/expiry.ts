import { daysBetween, type LocalDate } from './dates';

/**
 * `use_by` = fecha de caducidad («consumir antes del»).
 * `best_before` = fecha de consumo preferente («consumir preferentemente antes del»).
 *
 * Importante: el estado calculado es solo orientativo. No indica que un
 * alimento sea seguro o no: depende de la conservación, de si está abierto y
 * de las indicaciones del fabricante.
 */
export const EXPIRY_KINDS = ['use_by', 'best_before'] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

export type ExpiryStatus =
  /** Sin fecha registrada. */
  | 'none'
  /** Fecha lejana (fuera del margen de aviso). */
  | 'ok'
  /** Dentro del margen de aviso configurado. */
  | 'soon'
  /** La fecha es hoy. */
  | 'today'
  /** Fecha de caducidad superada. */
  | 'expired'
  /** Fecha de consumo preferente superada: revisar estado, no implica caducidad. */
  | 'best_before_passed';

export interface ExpiryInfo {
  expiryDate: LocalDate | null;
  expiryKind: ExpiryKind;
}

export function isExpiryKind(value: unknown): value is ExpiryKind {
  return typeof value === 'string' && (EXPIRY_KINDS as readonly string[]).includes(value);
}

export function getExpiryStatus(info: ExpiryInfo, today: LocalDate, warnDays: number): ExpiryStatus {
  if (!info.expiryDate) return 'none';
  const days = daysBetween(today, info.expiryDate);
  if (days < 0) return info.expiryKind === 'use_by' ? 'expired' : 'best_before_passed';
  if (days === 0) return 'today';
  if (days <= warnDays) return 'soon';
  return 'ok';
}

/** Estados que requieren la atención del usuario. */
export function needsAttention(status: ExpiryStatus): boolean {
  return status === 'soon' || status === 'today' || status === 'expired' || status === 'best_before_passed';
}

/**
 * Orden por proximidad de fecha: primero las fechas más cercanas (incluidas
 * las pasadas), después los productos sin fecha.
 */
export function compareByExpiry(a: ExpiryInfo, b: ExpiryInfo): number {
  if (a.expiryDate === b.expiryDate) return 0;
  if (!a.expiryDate) return 1;
  if (!b.expiryDate) return -1;
  return a.expiryDate < b.expiryDate ? -1 : 1;
}
