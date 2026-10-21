import type { SqlDatabase, SqlExecutor } from '../data/sql';
import { ApiError, type RemoteChange, type SyncOpIn, type SyncTransport } from './api';
import { ENTITIES, UPSERT_ORDER, isSyncEntity, parseRecord, readRecord, writeRow, type SyncEntity } from './records';

/**
 * Motor de sincronización con el hogar compartido.
 *
 * Envío (push):
 *  1. Los triggers de SQLite anotan cada cambio local en `sync_outbox`.
 *  2. Se «reclaman» hasta 500 entradas: se agrupan por registro y se guardan
 *     en `sync_pending` con un `op_id` fijo, en la misma transacción.
 *  3. Se envía el lote. Si se corta la red, el mismo lote (mismos `op_id`)
 *     se reenvía después y el servidor no lo aplica dos veces.
 *
 * Recepción (pull):
 *  - Se descargan todos los cambios posteriores a la última revisión y se
 *    aplican en una transacción con los triggers en pausa (`applying = 1`).
 *  - Si un registro tiene cambios locales sin enviar, gana el cambio local
 *    (se enviará en la siguiente pasada).
 *  - Productos con el mismo código de barras y listas con el mismo nombre
 *    creados en dos móviles se fusionan. Para que los dos móviles decidan lo
 *    mismo, sobrevive siempre el de identificador menor; lo que colgaba del
 *    otro pasa al superviviente.
 *
 * Conflictos de campos: gana la última escritura que recibe el servidor.
 * Cantidades: se envían como diferencias y se suman en el servidor.
 */
export interface SyncResult {
  pushed: number;
  pulled: number;
}

const PUSH_BATCH = 500;

export function createSyncEngine(opts: {
  db: SqlDatabase;
  transport: SyncTransport;
  newId: () => string;
  clock?: () => Date;
}) {
  const { db, transport, newId } = opts;
  const clock = opts.clock ?? (() => new Date());
  let running: Promise<SyncResult> | null = null;

  async function setApplying(tx: SqlExecutor, on: boolean) {
    await tx.run('UPDATE sync_state SET applying = ? WHERE id = 1', [on ? 1 : 0]);
  }

  /** Agrupa la cola en operaciones y las deja preparadas en `sync_pending`. */
  async function claimBatch(): Promise<number> {
    return db.transaction(async (tx) => {
      const rows = await tx.all<{ seq: number; entity: SyncEntity; entity_id: string; kind: string; delta_milli: number | null }>(
        'SELECT seq, entity, entity_id, kind, delta_milli FROM sync_outbox ORDER BY seq LIMIT ?',
        [PUSH_BATCH],
      );
      if (rows.length === 0) return 0;
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = `${r.entity}:${r.entity_id}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      for (const group of groups.values()) {
        const { entity, entity_id: id } = group[0]!;
        const seq = group[group.length - 1]!.seq;
        const record = await readRecord(tx, entity, id);
        let op: Omit<SyncOpIn, 'op_id'> | null;
        if (!record) {
          op = { entity, entity_id: id, kind: 'delete' };
        } else if (group.some((r) => r.kind !== 'adjust')) {
          op = { entity, entity_id: id, kind: 'upsert', data: record };
        } else {
          const delta = group.reduce((sum, r) => sum + (r.delta_milli ?? 0), 0);
          op = delta === 0 ? null : { entity, entity_id: id, kind: 'adjust_quantity', delta_milli: delta };
        }
        if (op) {
          await tx.run(
            'INSERT INTO sync_pending (op_id, seq, entity, entity_id, kind, data, delta_milli) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [newId(), seq, op.entity, op.entity_id, op.kind, op.data ? JSON.stringify(op.data) : null, op.delta_milli ?? null],
          );
        }
      }
      await tx.run('DELETE FROM sync_outbox WHERE seq <= ?', [rows[rows.length - 1]!.seq]);
      return rows.length;
    });
  }

  async function sendPending(): Promise<number> {
    const pending = await db.all<{ op_id: string; entity: string; entity_id: string; kind: SyncOpIn['kind']; data: string | null; delta_milli: number | null }>(
      'SELECT op_id, entity, entity_id, kind, data, delta_milli FROM sync_pending ORDER BY seq',
    );
    if (pending.length === 0) return 0;
    const results = await transport.push(
      pending.map((p) => ({
        op_id: p.op_id,
        entity: p.entity,
        entity_id: p.entity_id,
        kind: p.kind,
        ...(p.data !== null ? { data: JSON.parse(p.data) as Record<string, unknown> } : {}),
        ...(p.delta_milli !== null ? { delta_milli: p.delta_milli } : {}),
      })),
    );
    const byId = new Map(results.map((r) => [r.op_id, r]));
    await db.transaction(async (tx) => {
      await setApplying(tx, true);
      for (const p of pending) {
        const r = byId.get(p.op_id);
        // Ajuste sobre un lote que otro móvil ya había gastado: se borra también aquí.
        if (r?.status === 'rejected' && r.reason === 'not_found' && p.kind === 'adjust_quantity' && isSyncEntity(p.entity)) {
          await tx.run(`DELETE FROM ${ENTITIES[p.entity].table} WHERE id = ?`, [p.entity_id]);
        }
      }
      await setApplying(tx, false);
      await tx.run(`DELETE FROM sync_pending WHERE op_id IN (${pending.map(() => '?').join(',')})`, pending.map((p) => p.op_id));
    });
    return pending.length;
  }

  async function push(): Promise<number> {
    // Primero lo que quedó a medias de una pasada anterior.
    let sent = await sendPending();
    while ((await claimBatch()) > 0) sent += await sendPending();
    return sent;
  }

  /** Mueve lo que colgaba de un registro local al registro equivalente del servidor y borra el local. */
  async function mergeInto(tx: SqlExecutor, entity: 'product' | 'shopping_list', localId: string, remoteId: string) {
    // Estos cambios sí se anotan en la cola: el servidor tiene que saber que los lotes cambian de producto.
    await setApplying(tx, false);
    if (entity === 'product') {
      await tx.run('UPDATE stock_lots SET product_id = ? WHERE product_id = ?', [remoteId, localId]);
      await tx.run('UPDATE shopping_items SET product_id = ? WHERE product_id = ?', [remoteId, localId]);
      await tx.run('DELETE FROM products WHERE id = ?', [localId]);
    } else {
      await tx.run('UPDATE shopping_items SET list_id = ? WHERE list_id = ?', [remoteId, localId]);
      await tx.run('DELETE FROM shopping_lists WHERE id = ?', [localId]);
    }
    await setApplying(tx, true);
  }

  async function applyChanges(changes: RemoteChange[], fullResync: boolean): Promise<number> {
    // Solo el estado más reciente de cada registro.
    const latest = new Map<string, RemoteChange>();
    for (const c of changes) if (isSyncEntity(c.entity)) latest.set(`${c.entity}:${c.entity_id}`, c);
    const all = [...latest.values()];
    let applied = 0;

    await db.transaction(async (tx) => {
      // Los padres pueden llegar después que los hijos: las claves foráneas se comprueban al final.
      await tx.exec('PRAGMA defer_foreign_keys = ON');
      await setApplying(tx, true);
      const pendingRows = await tx.all<{ entity: string; entity_id: string }>('SELECT DISTINCT entity, entity_id FROM sync_outbox');
      const localPending = new Set(pendingRows.map((r) => `${r.entity}:${r.entity_id}`));

      for (const entity of [...UPSERT_ORDER].reverse() as SyncEntity[]) {
        for (const c of all) {
          if (c.entity !== entity || !c.deleted || localPending.has(`${entity}:${c.entity_id}`)) continue;
          await tx.run(`DELETE FROM ${ENTITIES[entity].table} WHERE id = ?`, [c.entity_id]);
          applied++;
        }
      }
      for (const entity of UPSERT_ORDER) {
        for (const c of all) {
          if (c.entity !== entity || c.deleted || localPending.has(`${entity}:${c.entity_id}`)) continue;
          const values = parseRecord(entity, c.data);
          if (!values) continue;
          if (entity === 'product' && values.barcode) {
            const dup = await tx.get<{ id: string }>('SELECT id FROM products WHERE barcode = ? AND id <> ?', [values.barcode, c.entity_id]);
            if (dup && c.entity_id < dup.id) {
              await tx.run('UPDATE products SET barcode = NULL WHERE id = ?', [dup.id]);
              await writeRow(tx, entity, c.entity_id, values);
              await mergeInto(tx, 'product', dup.id, c.entity_id);
              applied++;
              continue;
            }
            // Sobrevive el local: el remoto se guarda sin código de barras hasta que el otro móvil lo fusione.
            if (dup) values.barcode = null;
          }
          if (entity === 'shopping_list') {
            const exists = await tx.get<{ id: string }>('SELECT id FROM shopping_lists WHERE id = ?', [c.entity_id]);
            const dup = exists
              ? null
              : await tx.get<{ id: string }>('SELECT id FROM shopping_lists WHERE name = ? AND id <> ?', [values.name ?? null, c.entity_id]);
            if (dup && c.entity_id < dup.id) {
              await writeRow(tx, entity, c.entity_id, values);
              await mergeInto(tx, 'shopping_list', dup.id, c.entity_id);
              applied++;
              continue;
            }
          }
          try {
            await writeRow(tx, entity, c.entity_id, values);
            applied++;
          } catch {
            // Registro que no cumple las restricciones locales (p. ej. dato corrupto): se ignora.
          }
        }
      }

      if (fullResync) {
        // Resincronización completa: lo que ya no existe en el servidor y no tiene cambios locales se borra.
        for (const entity of [...UPSERT_ORDER].reverse() as SyncEntity[]) {
          const table = ENTITIES[entity].table;
          const ids = await tx.all<{ id: string }>(`SELECT id FROM ${table}`);
          for (const { id } of ids) {
            const key = `${entity}:${id}`;
            if (!latest.has(key) && !localPending.has(key)) await tx.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
          }
        }
      }

      // Huérfanos (p. ej. un lote de un producto que otro móvil borró a la vez).
      await tx.exec(
        `DELETE FROM stock_lots WHERE product_id NOT IN (SELECT id FROM products);
         DELETE FROM shopping_items WHERE list_id NOT IN (SELECT id FROM shopping_lists);
         UPDATE shopping_items SET product_id = NULL WHERE product_id IS NOT NULL AND product_id NOT IN (SELECT id FROM products);`,
      );
      await setApplying(tx, false);
    });
    return applied;
  }

  async function pull(): Promise<number> {
    const state = await db.get<{ last_rev: number }>('SELECT last_rev FROM sync_state WHERE id = 1');
    let since = state?.last_rev ?? 0;
    let fullResync = false;
    const changes: RemoteChange[] = [];
    for (;;) {
      let page;
      try {
        page = await transport.pull(since);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'full_resync_required' && !fullResync) {
          fullResync = true;
          since = 0;
          changes.length = 0;
          continue;
        }
        throw e;
      }
      changes.push(...page.changes);
      since = page.next;
      if (!page.has_more) break;
    }
    const applied = changes.length > 0 || fullResync ? await applyChanges(changes, fullResync) : 0;
    await db.run('UPDATE sync_state SET last_rev = ? WHERE id = 1', [since]);
    return applied;
  }

  async function cycle(initial: boolean): Promise<SyncResult> {
    let pulled = 0;
    // Al conectar, primero se recibe lo del hogar para fusionar duplicados antes de enviar.
    if (initial) pulled += await pull();
    let pushed = await push();
    pulled += await pull();
    // Las fusiones de duplicados hechas al recibir generan cambios: se envían ya.
    if ((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox'))!.n > 0) pushed += await push();
    await db.run('UPDATE sync_state SET last_sync_at = ?, last_error = NULL WHERE id = 1', [clock().toISOString()]);
    return { pushed, pulled };
  }

  return {
    /**
     * Activa la sincronización y pone en cola todos los datos locales para
     * subirlos al hogar. Se llama una vez al unirse o crear un hogar.
     */
    async enable(info: { serverUrl: string; email: string; householdId: string; householdName: string; role: string }) {
      await db.transaction(async (tx) => {
        await tx.exec('DELETE FROM sync_outbox; DELETE FROM sync_pending;');
        await tx.run(
          `UPDATE sync_state SET enabled = 1, applying = 0, server_url = ?, account_email = ?, household_id = ?,
             household_name = ?, role = ?, last_rev = 0, last_sync_at = NULL, last_error = NULL WHERE id = 1`,
          [info.serverUrl, info.email, info.householdId, info.householdName, info.role],
        );
        for (const entity of UPSERT_ORDER) {
          await tx.run(
            `INSERT INTO sync_outbox (entity, entity_id, kind) SELECT ?, id, 'upsert' FROM ${ENTITIES[entity].table}`,
            [entity],
          );
        }
      });
    },

    /** Desactiva la sincronización. Los datos se quedan en el móvil. */
    async disable() {
      await db.exec(
        `UPDATE sync_state SET enabled = 0, applying = 0, server_url = NULL, account_email = NULL, household_id = NULL,
           household_name = NULL, role = NULL, last_rev = 0, last_sync_at = NULL, last_error = NULL WHERE id = 1;
         DELETE FROM sync_outbox;
         DELETE FROM sync_pending;`,
      );
    },

    /** Una pasada completa (enviar y recibir). Si ya hay una en marcha, se espera a esa. */
    sync(options: { initial?: boolean } = {}): Promise<SyncResult> {
      running ??= (async () => {
        try {
          return await cycle(!!options.initial);
        } catch (e) {
          await db
            .run('UPDATE sync_state SET last_error = ? WHERE id = 1', [e instanceof ApiError ? e.code : 'internal'])
            .catch(() => undefined);
          throw e;
        } finally {
          running = null;
        }
      })();
      return running;
    },

    async pendingCount(): Promise<number> {
      const r = await db.get<{ n: number }>(
        'SELECT (SELECT COUNT(DISTINCT entity || entity_id) FROM sync_outbox) + (SELECT COUNT(*) FROM sync_pending) AS n',
      );
      return r?.n ?? 0;
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
