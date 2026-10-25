// A small synchronous SQL interface over a sqlite-wasm oo1 database. The stores are written
// against it, so the same code runs in the browser worker (OPFS) and in Vitest (in memory).
import type { Database } from '@sqlite.org/sqlite-wasm';

export type SqlValue = string | number | null | Uint8Array;
export type Params = readonly SqlValue[] | Record<string, SqlValue>;
export type Row = Record<string, SqlValue>;

export interface Sql {
  run(sql: string, params?: Params): void;
  all<T = Row>(sql: string, params?: Params): T[];
  get<T = Row>(sql: string, params?: Params): T | undefined;
  /** Runs fn in one transaction; nested calls join the outer one. */
  tx<T>(fn: () => T): T;
}

export function wrapDb(db: Database): Sql {
  let depth = 0;
  const all = <T>(sql: string, params?: Params): T[] =>
    db.exec({ sql, bind: params as never, rowMode: 'object', returnValue: 'resultRows' }) as T[];
  return {
    run(sql, params) {
      db.exec({ sql, bind: params as never });
    },
    all,
    get<T>(sql: string, params?: Params) {
      return all<T>(sql, params)[0];
    },
    tx<T>(fn: () => T): T {
      if (depth > 0) return fn();
      depth++;
      db.exec('begin immediate');
      try {
        const out = fn();
        db.exec('commit');
        return out;
      } catch (e) {
        db.exec('rollback');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}
