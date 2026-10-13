import { isAppError } from '../domain/errors';
import { t } from '../i18n';

/**
 * Registro de errores sin datos personales: solo un identificador de la
 * operación y el código/tipo del error. Nunca se registran mensajes de SQL con
 * valores, nombres de productos ni contenido de listas.
 */
export function logError(operation: string, e: unknown): void {
  if (!__DEV__) return;
  const kind = isAppError(e) ? `AppError:${e.code}` : (e as { name?: string } | null)?.name ?? typeof e;
  console.warn(`[stoky] ${operation} failed (${kind})`);
}

const NETWORK_KEYS: Record<string, string> = {
  network_offline: 'scan.offline',
  network_timeout: 'scan.timeout',
  remote_error: 'scan.remoteError',
  invalid_response: 'scan.remoteError',
};

/** Mensaje para el usuario a partir de un error. */
export function errorMessage(e: unknown): string {
  if (isAppError(e)) {
    const network = NETWORK_KEYS[e.code];
    if (network) return t(network);
    if (e.code === 'validation') {
      const first = Object.values(e.fields)[0];
      return first ? t(first) : t('errors.validation');
    }
    if (e.code === 'storage') return t('errors.storage');
    return t(`errors.${e.code}`);
  }
  return t('errors.generic');
}

/** Errores por campo traducidos (para formularios). */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!isAppError(e)) return {};
  return Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, t(v)]));
}
