import { addDays, atLocalTime, toLocalDate, type LocalDate } from './dates';
import type { ExpiryKind } from './expiry';

export interface PlannableLot {
  productName: string;
  expiryDate: LocalDate | null;
  expiryKind: ExpiryKind;
}

export interface PlanOptions {
  warnDays: number;
  notifyHour: number;
  /** Días hacia adelante que se programan (se reprograma al abrir la app y tras cada cambio). */
  horizonDays?: number;
  /** Límite de notificaciones programadas (Android limita las alarmas por app). */
  maxNotifications?: number;
}

export interface PlannedNotification {
  /** Identificador estable: permite reemplazar en vez de duplicar. */
  id: string;
  fireAt: Date;
  /** `window`: entran en el margen de aviso; `day`: la fecha es ese mismo día. */
  kind: 'window' | 'day';
  count: number;
  /** Nombres de producto (la capa de presentación decide si mostrarlos). */
  names: string[];
}

/**
 * Calcula los avisos locales a programar. Lógica pura: no programa nada.
 *
 * Para cada lote con fecha se generan, como máximo, dos avisos agrupados por
 * día: cuando entra en el margen de aviso y el mismo día de la fecha. Los
 * avisos de un mismo día se agrupan en uno solo para no saturar al usuario.
 * Los momentos ya pasados se omiten.
 */
export function planExpiryNotifications(lots: PlannableLot[], now: Date, opts: PlanOptions): PlannedNotification[] {
  const horizon = opts.horizonDays ?? 60;
  const max = opts.maxNotifications ?? 50;
  const today = toLocalDate(now);
  const lastDay = addDays(today, horizon);

  const groups = new Map<string, { kind: 'window' | 'day'; date: LocalDate; names: string[] }>();
  const push = (kind: 'window' | 'day', date: LocalDate, name: string) => {
    if (date < today || date > lastDay) return;
    const key = `${kind}:${date}`;
    const g = groups.get(key) ?? { kind, date, names: [] };
    g.names.push(name);
    groups.set(key, g);
  };

  for (const lot of lots) {
    if (!lot.expiryDate) continue;
    if (opts.warnDays > 0) push('window', addDays(lot.expiryDate, -opts.warnDays), lot.productName);
    push('day', lot.expiryDate, lot.productName);
  }

  const planned: PlannedNotification[] = [];
  for (const g of groups.values()) {
    const fireAt = atLocalTime(g.date, opts.notifyHour);
    if (fireAt.getTime() <= now.getTime()) continue;
    planned.push({
      id: `expiry-${g.kind}-${g.date}`,
      fireAt,
      kind: g.kind,
      count: g.names.length,
      names: [...new Set(g.names)].sort((a, b) => a.localeCompare(b, 'es')),
    });
  }
  planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.kind.localeCompare(b.kind));
  return planned.slice(0, max);
}
