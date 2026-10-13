/**
 * Errores de dominio con código estable. El código se traduce en la interfaz
 * mediante i18n; el mensaje técnico nunca debe contener datos personales
 * (nombres de productos, contenido de listas) porque podría acabar en logs.
 */
export type ErrorCode =
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'incompatible_units'
  | 'insufficient_quantity'
  | 'already_transferred'
  | 'network_offline'
  | 'network_timeout'
  | 'remote_error'
  | 'invalid_response'
  | 'storage';

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Errores por campo (clave de campo → clave de i18n). */
  readonly fields: Readonly<Record<string, string>>;

  constructor(code: ErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
