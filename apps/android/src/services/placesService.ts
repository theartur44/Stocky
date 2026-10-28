import { placeRepo } from '../data/repositories';
import { AppError } from '../domain/errors';
import type { Location } from '../domain/models';
import { validatePlaceInput, type Place } from '../domain/places';
import { nowIso, type ServiceContext } from './context';

/** Sitios de la casa: crear, renombrar, ordenar y borrar (moviendo lo que hay dentro). */
export function createPlacesService(ctx: ServiceContext) {
  const { db } = ctx;
  return {
    list: (): Promise<Place[]> => placeRepo.list(db),

    lotCounts: (): Promise<Record<string, number>> => placeRepo.lotCounts(db),

    async create(input: { name: string; kind: Location }): Promise<Place> {
      const p = validatePlaceInput(input);
      const place = await db.transaction(async (tx) => {
        const all = await placeRepo.list(tx);
        const position = all.reduce((max, x) => Math.max(max, x.position), -1) + 1;
        return placeRepo.insert(tx, ctx.newId(), p, position, nowIso(ctx));
      });
      ctx.onChange?.('inventory');
      return place;
    },

    /** Cambia nombre o tipo. Si cambia el tipo, también el de los lotes y productos que lo usan. */
    async update(id: string, input: { name: string; kind: Location }): Promise<void> {
      const p = validatePlaceInput(input);
      await db.transaction(async (tx) => {
        const now = nowIso(ctx);
        if ((await placeRepo.update(tx, id, p, now)) === 0) throw new AppError('not_found', 'Place not found');
        await tx.run('UPDATE stock_lots SET location = ?, updated_at = ? WHERE place_id = ? AND location <> ?', [p.kind, now, id, p.kind]);
        await tx.run('UPDATE products SET default_location = ?, updated_at = ? WHERE default_place_id = ? AND default_location <> ?', [
          p.kind,
          now,
          id,
          p.kind,
        ]);
      });
      ctx.onChange?.('inventory');
    },

    /** Sube (-1) o baja (+1) un sitio en la lista. */
    async move(id: string, direction: -1 | 1): Promise<void> {
      await db.transaction(async (tx) => {
        const all = await placeRepo.list(tx);
        const i = all.findIndex((p) => p.id === id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= all.length) return;
        [all[i], all[j]] = [all[j]!, all[i]!];
        const now = nowIso(ctx);
        for (const [position, p] of all.entries()) await placeRepo.setPosition(tx, p.id, position, now);
      });
      ctx.onChange?.('inventory');
    },

    /** Borra un sitio y pasa sus lotes (y los productos que lo tenían por defecto) a `moveTo`. */
    async remove(id: string, moveTo: string): Promise<void> {
      if (id === moveTo) throw new AppError('validation', 'Cannot move to the same place');
      await db.transaction(async (tx) => {
        const all = await placeRepo.list(tx);
        if (all.length <= 1) throw new AppError('validation', 'At least one place is required', { place: 'places.lastOne' });
        const target = all.find((p) => p.id === moveTo);
        if (!target || !all.some((p) => p.id === id)) throw new AppError('not_found', 'Place not found');
        const now = nowIso(ctx);
        await tx.run('UPDATE stock_lots SET place_id = ?, location = ?, updated_at = ? WHERE place_id = ?', [target.id, target.kind, now, id]);
        await tx.run('UPDATE products SET default_place_id = ?, default_location = ?, updated_at = ? WHERE default_place_id = ?', [
          target.id,
          target.kind,
          now,
          id,
        ]);
        await placeRepo.delete(tx, id);
      });
      ctx.onChange?.('inventory');
    },
  };
}

export type PlacesService = ReturnType<typeof createPlacesService>;
