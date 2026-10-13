/**
 * Fechas de calendario locales en formato `YYYY-MM-DD`.
 *
 * Las caducidades son fechas de calendario, no instantes: se comparan como
 * días completos en la zona horaria del dispositivo para evitar errores por
 * cambios de hora o de zona.
 */
export type LocalDate = string;

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local (zona del dispositivo) de un instante. */
export function toLocalDate(instant: Date): LocalDate {
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}

function toUtcDays(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Días naturales de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round(toUtcDays(to) - toUtcDays(from));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const t = new Date((toUtcDays(date) + days) * 86_400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Interpreta una fecha escrita como `dd/mm/aaaa`, `dd-mm-aaaa`, `dd/mm/aa`
 * o `aaaa-mm-dd`. Devuelve `null` si no es una fecha válida.
 */
export function parseUserDate(text: string): LocalDate | null {
  const t = text.trim();
  if (isValidLocalDate(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  let year = Number(m[3]);
  if (m[3]!.length === 2) year += 2000;
  const candidate = `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isValidLocalDate(candidate) ? candidate : null;
}

/** `2026-10-13` → `13/10/2026`. */
export function formatLocalDate(date: LocalDate): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Combina una fecha local y una hora local en un instante del dispositivo.
 */
export function atLocalTime(date: LocalDate, hour: number, minute = 0): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}
