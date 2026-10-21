import { t } from '../i18n';
import { es } from '../i18n/es';
import { ApiError } from '../sync/api';
import { ConnectError } from './SyncProvider';

type ErrorKey = keyof typeof es.server.errors;

/** Mensaje para el usuario a partir de un error de conexión o del servidor. */
export function errorText(e: unknown): string {
  const code = e instanceof ConnectError || e instanceof ApiError ? e.code : 'internal';
  return t(`server.errors.${(code in es.server.errors ? code : 'internal') as ErrorKey}`);
}

