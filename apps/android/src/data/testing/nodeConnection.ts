/// <reference types="node" />
/**
 * Conexión SQLite para pruebas en Node (módulo `node:sqlite`, Node ≥ 22.13).
 * Solo la importan las pruebas; nunca forma parte del paquete de la app.
 */
import { DatabaseSync } from 'node:sqlite';

import { CONNECTION_PRAGMAS, SerializedDatabase, type RawConnection, type SqlParams } from '../sql';

class NodeConnection implements RawConnection {
  constructor(private readonly db: DatabaseSync) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: SqlParams = []): Promise<{ changes: number }> {
    const r = this.db.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  async all<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async get<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export function openTestDatabase(path = ':memory:'): SerializedDatabase {
  const db = new DatabaseSync(path);
  db.exec(CONNECTION_PRAGMAS);
  return new SerializedDatabase(new NodeConnection(db));
}
