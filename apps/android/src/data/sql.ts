/**
 * Adaptador SQL mínimo. Las pantallas y servicios nunca usan `expo-sqlite`
 * directamente: dependen de esta interfaz, lo que permite
 *  - probar migraciones y repositorios con SQLite real en Node, y
 *  - sustituir el almacenamiento (p. ej. añadir sincronización) sin tocar la UI.
 */
export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  get<T>(sql: string, params?: SqlParams): Promise<T | null>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Ejecuta `fn` en una transacción. Si `fn` lanza un error, se deshacen todos
   * los cambios. Dentro de `fn` se debe usar solo `tx`: llamar a `db` o a
   * `db.transaction` desde dentro bloquearía la cola (no hay anidamiento).
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Conexión de bajo nivel que aporta cada plataforma (Expo o Node). */
export interface RawConnection extends SqlExecutor {
  close(): Promise<void>;
}

/**
 * Serializa todo el acceso a una única conexión.
 *
 * Con una sola conexión, los PRAGMA (p. ej. `foreign_keys`) se aplican a todas
 * las operaciones, y la cola garantiza que ninguna consulta se intercale en
 * medio de una transacción abierta.
 */
export class SerializedDatabase implements SqlDatabase {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly conn: RawConnection) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    // La cola continúa aunque la tarea falle; el error lo recibe quien llamó.
    this.queue = result.catch(() => undefined);
    return result;
  }

  exec(sql: string): Promise<void> {
    return this.enqueue(() => this.conn.exec(sql));
  }

  run(sql: string, params: SqlParams = []): Promise<{ changes: number }> {
    return this.enqueue(() => this.conn.run(sql, params));
  }

  all<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.enqueue(() => this.conn.all<T>(sql, params));
  }

  get<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    return this.enqueue(() => this.conn.get<T>(sql, params));
  }

  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.conn.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(this.conn);
        await this.conn.exec('COMMIT');
        return result;
      } catch (e) {
        await this.conn.exec('ROLLBACK');
        throw e;
      }
    });
  }

  close(): Promise<void> {
    return this.enqueue(() => this.conn.close());
  }
}

/** PRAGMA que se aplican al abrir la conexión. */
export const CONNECTION_PRAGMAS = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA journal_mode = WAL',
  // Sobrescribe con ceros el contenido borrado para que no quede en el fichero.
  'PRAGMA secure_delete = ON',
].join(';\n');
