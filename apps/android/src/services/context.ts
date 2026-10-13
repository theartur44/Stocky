import type { SqlDatabase } from '../data/sql';

export type ChangeScope = 'inventory' | 'shopping' | 'settings' | 'all';

/** Dependencias inyectadas en los servicios (sustituibles en pruebas). */
export interface ServiceContext {
  db: SqlDatabase;
  newId: () => string;
  clock: () => Date;
  /** Se llama tras cada cambio confirmado (refresco de UI, reprogramar avisos…). */
  onChange?: (scope: ChangeScope) => void;
}

export function nowIso(ctx: ServiceContext): string {
  return ctx.clock().toISOString();
}
