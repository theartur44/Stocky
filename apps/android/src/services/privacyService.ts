import { deleteAllUserData } from '../data/repositories';
import type { ServiceContext } from './context';

export function createPrivacyService(ctx: ServiceContext) {
  return {
    /**
     * Elimina inventario, catálogo, listas y ajustes del dispositivo.
     * `VACUUM` reconstruye el fichero para que no queden restos de lo borrado.
     * Las notificaciones programadas las cancela quien llama (capa de app).
     */
    async deleteAllData(): Promise<void> {
      await ctx.db.transaction((tx) => deleteAllUserData(tx));
      await ctx.db.exec('VACUUM');
      // Vacía el fichero WAL para que tampoco conserve páginas antiguas.
      await ctx.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      ctx.onChange?.('all');
    },
  };
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;
