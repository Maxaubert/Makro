/// <reference lib="webworker" />
// The database worker. The opfs-sahpool VFS needs synchronous OPFS access handles, which exist
// only in workers, so both SQLite files live here:
//   /products.sqlite  the product database, read-only, replaced on a newer db_version
//   /log.sqlite       the user's log with the outbox (LogStore)
// The main thread calls the methods of `api` through ../lib/db.ts.
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { LogStore } from '../data/logStore';
import {
  assertSupportedSchema,
  getProduct,
  lookupBarcode,
  readProductMeta,
  searchProducts,
  type ProductMeta,
} from '../data/products';
import { wrapDb, type Sql } from '../data/sql';

const PRODUCTS = '/products.sqlite';
const LOG = '/log.sqlite';

let sqlite3: Sqlite3Static;
let pool: SAHPoolUtil;
let productsDb: Database | null = null;
let products: Sql | null = null;
let productMeta: ProductMeta | null = null;
let log: LogStore;

function openProducts(): void {
  productsDb = new pool.OpfsSAHPoolDb(PRODUCTS);
  products = wrapDb(productsDb);
  productMeta = readProductMeta(products);
  assertSupportedSchema(productMeta);
}

function closeProducts(): void {
  productsDb?.close();
  productsDb = null;
  products = null;
  productMeta = null;
}

function requireProducts(): Sql {
  if (!products) throw new Error('The product database is not installed yet.');
  return products;
}

const api = {
  async init(): Promise<{ products: ProductMeta | null }> {
    if (log) return { products: productMeta };
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
    if (pool.getFileNames().includes(PRODUCTS)) {
      try {
        openProducts();
      } catch {
        // An unreadable or too old file: drop it, the next product sync downloads a good one.
        closeProducts();
        pool.unlink(PRODUCTS);
      }
    }
    return { products: productMeta };
  },

  productMeta(): ProductMeta | null {
    return productMeta;
  },

  /** Install a verified product file. Checks the file's own meta against what was expected. */
  async installProducts(bytes: Uint8Array, expected: { db_version: string; schema_version: number } | null): Promise<ProductMeta> {
    closeProducts();
    await pool.importDb(PRODUCTS, bytes);
    try {
      openProducts();
      const meta = productMeta as ProductMeta;
      if (expected && (meta.db_version !== expected.db_version || meta.schema_version !== expected.schema_version)) {
        throw new Error(
          `the file says db_version ${meta.db_version} / schema_version ${meta.schema_version}, latest.json said ${expected.db_version} / ${expected.schema_version}`,
        );
      }
      return meta;
    } catch (e) {
      closeProducts();
      pool.unlink(PRODUCTS);
      throw e;
    }
  },

  search: (q: string, limit?: number) => searchProducts(requireProducts(), q, limit),
  product: (id: string) => getProduct(requireProducts(), id),
  barcode: (code: string) => lookupBarcode(requireProducts(), code),

  saveLogEntry: (...a: Parameters<LogStore['saveLogEntry']>) => log.saveLogEntry(...a),
  updateLogEntry: (...a: Parameters<LogStore['updateLogEntry']>) => log.updateLogEntry(...a),
  tombstone: (...a: Parameters<LogStore['tombstone']>) => log.tombstone(...a),
  saveCustomFood: (...a: Parameters<LogStore['saveCustomFood']>) => log.saveCustomFood(...a),
  saveWeight: (...a: Parameters<LogStore['saveWeight']>) => log.saveWeight(...a),
  dayEntries: (d: string) => log.dayEntries(d),
  logEntry: (id: string) => log.logEntry(id),
  recentFoods: (n: number) => log.recentFoods(n),
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
