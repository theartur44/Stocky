import { eventRepo, lotRepo, productRepo, type StockEvent } from '../data/repositories';
import { addDays, toLocalDate, type LocalDate } from '../domain/dates';
import { AppError } from '../domain/errors';
import { MAX_QUANTITY_MILLI } from '../domain/units';
import { validateLotInput } from '../domain/validation';
import { nowIso, type ServiceContext } from './context';

/** Historial de lo gastado y lo tirado en este móvil, con opción de deshacer. */
export function createHistoryService(ctx: ServiceContext) {
  const { db } = ctx;
  return {
    list: (limit?: number): Promise<StockEvent[]> => eventRepo.list(db, limit),

    /** Resumen de los últimos `days` días. */
    summary(days = 30): Promise<{ consumed: number; discarded: number; expired: number; from: LocalDate }> {
      const from = addDays(toLocalDate(ctx.clock()), -days + 1);
      return eventRepo.summary(db, from).then((s) => ({ ...s, from }));
    },

    /**
     * Deshace una acción: devuelve a cada lote lo que se gastó o se tiró (y lo
     * vuelve a crear si ya no existía). Si el producto se borró del catálogo,
     * esa parte no se puede recuperar.
     */
    async undo(batchId: string): Promise<number> {
      const restored = await db.transaction(async (tx) => {
        const events = await eventRepo.byBatch(tx, batchId);
        if (events.length === 0) throw new AppError('not_found', 'Nothing to undo');
        const now = nowIso(ctx);
        let n = 0;
        for (const e of events) {
          const current = await lotRepo.get(tx, e.lot.id);
          if (current) {
            if (current.unit !== e.unit) continue;
            const next = Math.min(MAX_QUANTITY_MILLI, current.quantityMilli + e.quantityMilli);
            if ((await lotRepo.setQuantity(tx, current.id, current.quantityMilli, next, now)) === 1) n++;
          } else if (await productRepo.get(tx, e.productId)) {
            await lotRepo.insert(tx, e.lot.id, e.productId, validateLotInput({ ...e.lot, quantityMilli: e.quantityMilli }), now);
            n++;
          }
        }
        await eventRepo.deleteBatch(tx, batchId);
        return n;
      });
      ctx.onChange?.('inventory');
      return restored;
    },
  };
}

export type HistoryService = ReturnType<typeof createHistoryService>;
