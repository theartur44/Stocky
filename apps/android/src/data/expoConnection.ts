import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { CONNECTION_PRAGMAS, SerializedDatabase, type RawConnection, type SqlParams } from './sql';

export const DATABASE_NAME = 'stoky.db';

class ExpoConnection implements RawConnection {
  constructor(private readonly db: SQLiteDatabase) {}

  exec(sql: string): Promise<void> {
    return this.db.execAsync(sql);
  }

  async run(sql: string, params: SqlParams = []): Promise<{ changes: number }> {
    const r = await this.db.runAsync(sql, [...params]);
    return { changes: r.changes };
  }

  all<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, [...params]);
  }

  get<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, [...params]);
  }

  close(): Promise<void> {
    return this.db.closeAsync();
  }
}

/** Abre la base de datos local de la app (almacenamiento privado de Android). */
export async function openAppDatabase(): Promise<SerializedDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await db.execAsync(CONNECTION_PRAGMAS);
  return new SerializedDatabase(new ExpoConnection(db));
}
