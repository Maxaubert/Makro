/// <reference lib="webworker" />
// The database worker. The opfs-sahpool VFS needs synchronous OPFS access handles, which exist
// only in workers, so both SQLite files live here:
//   /products.sqlite or /products-b.sqlite  the product database, read-only; a newer
//                     db_version goes into the other name and replaces it once checked
//   /log.sqlite       the user's log with the outbox (LogStore)
// The main thread calls the methods of `api` through ../lib/db.ts.
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { LogStore } from '../data/logStore';
import {
  getProduct,
  lookupBarcode,
  productAliases,
  readProductMeta,
  resolvePopularity,
  searchProducts,
  type ProductMeta,
} from '../data/products';
import { ProductSlots } from '../data/productSlots';
import { loadSuggestions } from '../data/suggestions';
import { wrapDb, type Sql } from '../data/sql';

const LOG = '/log.sqlite';

interface ProductsHandle {
  db: Database;
  sql: Sql;
}

let sqlite3: Sqlite3Static;
let pool: SAHPoolUtil;
let slots: ProductSlots<ProductsHandle>;
let log: LogStore;

function requireProducts(): Sql {
  const h = slots?.handle();
  if (!h) throw new Error('The product database is not installed yet.');
  return h.sql;
}

const api = {
  async init(): Promise<{ products: ProductMeta | null }> {
    if (log) return { products: slots.meta() };
    sqlite3 = await sqlite3InitModule();
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'makro', initialCapacity: 8 });
    } catch (e) {
      throw new Error(
        `This browser cannot keep Makro's data on the device (OPFS). If Makro is open in another tab, close it and reload. (${String(e)})`,
      );
    }
    const logDb = new pool.OpfsSAHPoolDb(LOG);
    log = new LogStore(wrapDb(logDb));
    log.migrate();
    // Two product files, so a failed download never removes the working one (productSlots.ts).
    slots = new ProductSlots<ProductsHandle>({
      files: () => pool.getFileNames(),
      importDb: async (name, bytes) => {
        await pool.importDb(name, bytes);
      },
      open: (name) => {
        const db = new pool.OpfsSAHPoolDb(name);
        return { db, sql: wrapDb(db) };
      },
      meta: (h) => readProductMeta(h.sql),
      close: (h) => h.db.close(),
      unlink: (name) => {
        pool.unlink(name);
      },
    });
    slots.restore();
    return { products: slots.meta() };
  },

  productMeta(): ProductMeta | null {
    return slots?.meta() ?? null;
  },

  /** Install a verified product file. The old file stays in use until the new one checks out. */
  installProducts: (bytes: Uint8Array, expected: { db_version: string; schema_version: number } | null) =>
    slots.install(bytes, expected),

  search: (q: string, limit?: number) => {
    const sql = requireProducts();
    return searchProducts(sql, q, limit, resolvePopularity(sql, log.productCounts(), log.popularity()));
  },
  popularityStale: (maxAgeMs: number) => log.popularityStale(maxAgeMs),
  savePopularity: (...a: Parameters<LogStore['savePopularity']>) => log.savePopularity(...a),
  product: (id: string) => getProduct(requireProducts(), id),
  barcode: (code: string) => lookupBarcode(requireProducts(), code),

  saveLogEntry: (...a: Parameters<LogStore['saveLogEntry']>) => log.saveLogEntry(...a),
  updateLogEntry: (...a: Parameters<LogStore['updateLogEntry']>) => log.updateLogEntry(...a),
  tombstone: (...a: Parameters<LogStore['tombstone']>) => log.tombstone(...a),
  saveCustomFood: (...a: Parameters<LogStore['saveCustomFood']>) => log.saveCustomFood(...a),
  saveWeight: (...a: Parameters<LogStore['saveWeight']>) => log.saveWeight(...a),
  saveGoal: (...a: Parameters<LogStore['saveGoal']>) => log.saveGoal(...a),
  exportAll: () => log.exportAll(),
  wipe: () => log.wipe(),
  setupDoneFor: () => log.setupDoneFor(),
  markSetupDone: (userId: string) => log.markSetupDone(userId),
  dayEntries: (d: string) => log.dayEntries(d),
  entriesBetween: (from: string, to: string) => log.entriesBetween(from, to),
  suggestions: (left: Parameters<typeof loadSuggestions>[2]) => loadSuggestions(log, slots?.handle()?.sql ?? null, left),
  logEntry: (id: string) => log.logEntry(id),
  recentFoods: (n: number) => log.recentFoods(n),
  lastPortion: (...a: Parameters<LogStore['lastPortion']>) => log.lastPortion(...a),
  productAliases: (id: string) => productAliases(requireProducts(), id),
  customFood: (id: string) => log.customFood(id),
  customFoods: () => log.customFoods(),
  weights: (n: number) => log.weights(n),
  goalFor: (d: string) => log.goalFor(d),
  claimOwner: (userId: string) => log.claimOwner(userId),
  pendingCount: () => log.pendingCount(),
  rejected: () => log.rejected(),
  outboxBatch: (n: number) => log.outboxBatch(n),
  ackPush: (...a: Parameters<LogStore['ackPush']>) => log.ackPush(...a),
  cursor: () => log.cursor(),
  applyPullPage: (...a: Parameters<LogStore['applyPullPage']>) => log.applyPullPage(...a),
};

export type DbApi = typeof api;

type Request = { id: number; method: keyof DbApi; args: unknown[] };

// Calls run one at a time, in order, so a save and the read after it never interleave.
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, method, args } = ev.data;
  queue = queue.then(async () => {
    try {
      const fn = api[method] as (...a: unknown[]) => unknown;
      if (typeof fn !== 'function') throw new Error(`unknown method ${String(method)}`);
      const result = await fn(...args);
      self.postMessage({ id, ok: true, result });
    } catch (e) {
      self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
};
