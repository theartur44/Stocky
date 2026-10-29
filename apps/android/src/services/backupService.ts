import type { SqlExecutor } from '../data/sql';
import { AppError } from '../domain/errors';
import { ENTITIES, UPSERT_ORDER, parseRecord, readRecord, writeRow, type SyncEntity } from '../sync/records';
import type { ServiceContext } from './context';

/**
 * Copia de seguridad en un fichero JSON (para cambiar de móvil sin servidor) y
 * exportación del inventario a CSV.
 *
 * La copia usa el mismo formato que la sincronización, y al importarla cada
 * registro pasa por las mismas comprobaciones que lo que llega de otro móvil:
 * un fichero manipulado no puede meter datos que rompan la app.
 */
export const BACKUP_FORMAT = 1;
/** Límite del fichero que se acepta al importar (un hogar normal ocupa unos cientos de KB). */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface BackupFile {
  app: 'stocky';
  format: number;
  exportedAt: string;
  data: Partial<Record<SyncEntity, { id: string; record: Record<string, unknown> }[]>>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

const ID_RE = /^[0-9A-Za-z-]{1,64}$/;

export function createBackupService(ctx: ServiceContext) {
  const { db } = ctx;

  async function exportData(): Promise<BackupFile> {
    return db.transaction(async (tx) => {
      const data: BackupFile['data'] = {};
      for (const entity of UPSERT_ORDER) {
        const ids = await tx.all<{ id: string }>(`SELECT id FROM ${ENTITIES[entity].table} ORDER BY id`);
        const rows: { id: string; record: Record<string, unknown> }[] = [];
        for (const { id } of ids) {
          const record = await readRecord(tx, entity, id);
          if (record) rows.push({ id, record });
        }
        data[entity] = rows;
      }
      return { app: 'stocky', format: BACKUP_FORMAT, exportedAt: ctx.clock().toISOString(), data };
    });
  }

  /** Valida la forma del fichero. Lanza `validation` si no es una copia de Stocky. */
  function parseBackup(text: string): BackupFile {
    if (text.length > MAX_BACKUP_BYTES) throw new AppError('validation', 'Backup too large', { file: 'backup.tooLarge' });
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AppError('validation', 'Not JSON', { file: 'backup.invalid' });
    }
    const b = json as Partial<BackupFile> | null;
    if (!b || typeof b !== 'object' || b.app !== 'stocky' || typeof b.data !== 'object' || b.data === null) {
      throw new AppError('validation', 'Not a Stocky backup', { file: 'backup.invalid' });
    }
    if (typeof b.format !== 'number' || b.format > BACKUP_FORMAT) throw new AppError('validation', 'Newer format', { file: 'backup.newer' });
    return b as BackupFile;
  }

  /**
   * Añade lo de la copia a lo que ya hay (no borra nada). Un registro con el
   * mismo identificador se actualiza; un producto con el mismo código de barras
   * o una lista con el mismo nombre se funden con los existentes.
   */
  async function importData(text: string): Promise<ImportResult> {
    const backup = parseBackup(text);
    const result = await db.transaction(async (tx) => {
      await tx.exec('PRAGMA defer_foreign_keys = ON');
      const idMap = new Map<string, string>();
      let imported = 0;
      let skipped = 0;
      for (const entity of UPSERT_ORDER) {
        const rows = backup.data[entity];
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const values = row && typeof row.id === 'string' && ID_RE.test(row.id) ? parseRecord(entity, row.record) : null;
          if (!values) {
            skipped++;
            continue;
          }
          let id = row.id;
          // Referencias a registros que se han fundido con otros.
          for (const col of ['product_id', 'list_id', 'place_id', 'default_place_id', 'transferred_lot_id']) {
            const ref = values[col];
            if (typeof ref === 'string' && idMap.has(ref)) values[col] = idMap.get(ref)!;
          }
          if (entity === 'product' && typeof values.barcode === 'string') {
            const dup = await tx.get<{ id: string }>('SELECT id FROM products WHERE barcode = ? AND id <> ?', [values.barcode, id]);
            if (dup) {
              idMap.set(id, dup.id);
              id = dup.id;
            }
          }
          if (entity === 'shopping_list') {
            const sameId = await tx.get('SELECT id FROM shopping_lists WHERE id = ?', [id]);
            const dup = sameId ? null : await tx.get<{ id: string }>('SELECT id FROM shopping_lists WHERE name = ?', [values.name ?? null]);
            if (dup) {
              idMap.set(id, dup.id);
              id = dup.id;
            }
          }
          if (await guarded(tx, () => writeRow(tx, entity, id, values))) imported++;
          else skipped++;
        }
      }
      // Lo que quede sin padre (copia incompleta) se descarta o se recoloca.
      await tx.exec(
        `DELETE FROM stock_lots WHERE product_id NOT IN (SELECT id FROM products);
         DELETE FROM shopping_items WHERE list_id NOT IN (SELECT id FROM shopping_lists);
         UPDATE shopping_items SET product_id = NULL WHERE product_id IS NOT NULL AND product_id NOT IN (SELECT id FROM products);
         UPDATE stock_lots SET place_id = (SELECT id FROM places WHERE places.kind = stock_lots.location ORDER BY position LIMIT 1)
           WHERE place_id IS NULL OR place_id NOT IN (SELECT id FROM places);
         UPDATE products SET default_place_id = (SELECT id FROM places WHERE places.kind = products.default_location ORDER BY position LIMIT 1)
           WHERE default_place_id IS NULL OR default_place_id NOT IN (SELECT id FROM places);`,
      );
      return { imported, skipped };
    });
    ctx.onChange?.('all');
    return result;
  }

  return { exportData, parseBackup, importData };
}

async function guarded(tx: SqlExecutor, fn: () => Promise<void>): Promise<boolean> {
  await tx.exec('SAVEPOINT backup_record');
  try {
    await fn();
    await tx.exec('RELEASE backup_record');
    return true;
  } catch {
    await tx.exec('ROLLBACK TO backup_record; RELEASE backup_record');
    return false;
  }
}

/** Celda CSV: entre comillas si hace falta y sin fórmulas (=, +, -, @ al principio las ejecutaría una hoja de cálculo). */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null)[][]): string {
  // BOM para que Excel reconozca los acentos.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export type BackupService = ReturnType<typeof createBackupService>;
