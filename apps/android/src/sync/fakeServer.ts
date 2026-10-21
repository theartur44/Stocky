import { ApiError, type OpResult, type PullPage, type RemoteChange, type SyncOpIn, type SyncTransport } from './api';

/**
 * Servidor en memoria con la misma lógica de sincronización que
 * `services/api/app/routers/sync.py`. Solo para pruebas.
 */
export function createFakeServer() {
  let rev = 0;
  let purgedRev = 0;
  const records = new Map<string, { entity: string; id: string; rev: number; deleted: boolean; data: Record<string, unknown> | null }>();
  const processed = new Map<string, OpResult>();
  /** Si se activa, el servidor aplica el siguiente push pero «se pierde» la respuesta. */
  let dropNextResponse = false;
  let offline = false;

  function apply(op: SyncOpIn): OpResult {
    const key = `${op.entity}:${op.entity_id}`;
    const rec = records.get(key);
    if (op.kind === 'upsert') {
      rev++;
      records.set(key, { entity: op.entity, id: op.entity_id, rev, deleted: false, data: structuredClone(op.data ?? {}) });
      return { op_id: op.op_id, status: 'applied', rev };
    }
    if (op.kind === 'delete') {
      rev++;
      records.set(key, { entity: op.entity, id: op.entity_id, rev, deleted: true, data: null });
      return { op_id: op.op_id, status: 'applied', rev };
    }
    if (!rec || rec.deleted || !rec.data) return { op_id: op.op_id, status: 'rejected', rev, reason: 'not_found' };
    const next = Math.max(0, (rec.data.quantityMilli as number) + (op.delta_milli ?? 0));
    rev++;
    rec.rev = rev;
    if (next === 0) {
      rec.deleted = true;
      rec.data = null;
    } else {
      rec.data.quantityMilli = next;
    }
    return { op_id: op.op_id, status: 'applied', rev };
  }

  const transport: SyncTransport = {
    async push(ops) {
      if (offline) throw new ApiError('network');
      const results = ops.map((op) => {
        const done = processed.get(op.op_id);
        if (done) return { ...done, status: 'duplicate' as const };
        const r = apply(op);
        processed.set(op.op_id, r);
        return r;
      });
      if (dropNextResponse) {
        dropNextResponse = false;
        throw new ApiError('network');
      }
      return results;
    },
    async pull(since, limit = 500): Promise<PullPage> {
      if (offline) throw new ApiError('network');
      if (since > 0 && since < purgedRev) throw new ApiError('full_resync_required', 410);
      const rows = [...records.values()].filter((r) => r.rev > since).sort((a, b) => a.rev - b.rev);
      const page = rows.slice(0, limit);
      const changes: RemoteChange[] = page.map((r) => ({
        entity: r.entity,
        entity_id: r.id,
        rev: r.rev,
        deleted: r.deleted,
        data: r.data ? structuredClone(r.data) : null,
      }));
      return { changes, next: page.length ? page[page.length - 1]!.rev : since, has_more: rows.length > limit };
    },
  };

  return {
    transport,
    records,
    dropNextResponse: () => {
      dropNextResponse = true;
    },
    setOffline: (v: boolean) => {
      offline = v;
    },
    /** Simula la purga de lápidas antiguas. */
    purgeTombstones: () => {
      for (const [k, r] of records) if (r.deleted) records.delete(k);
      purgedRev = rev;
    },
  };
}
