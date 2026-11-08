// Test helpers: sqlite-wasm in memory under Node, and the fixture product database.
// Used only by *.test.ts files.
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { buildFixture } from '../../scripts/fixture.mjs';
import { wrapDb, type Sql } from './sql';

let sqlite3: Promise<Sqlite3Static> | null = null;

export function sqlite(): Promise<Sqlite3Static> {
  sqlite3 ??= sqlite3InitModule();
  return sqlite3;
}

export async function memoryDb(): Promise<Sql> {
  const s = await sqlite();
  return wrapDb(new s.oo1.DB(':memory:'));
}

/** The fixture products.sqlite, open in memory. */
export async function fixtureProducts(opts?: { schemaVersion?: number; dbVersion?: string }): Promise<Sql> {
  const s = await sqlite();
  const db = new s.oo1.DB(':memory:');
  buildFixture(db, opts);
  return wrapDb(db);
}

/** The fixture as file bytes, as the bucket would serve it uncompressed. */
export async function fixtureBytes(opts?: { schemaVersion?: number; dbVersion?: string }): Promise<Uint8Array> {
  const s = await sqlite();
  const db = new s.oo1.DB(':memory:');
  buildFixture(db, opts);
  const bytes = s.capi.sqlite3_js_db_export(db.pointer!);
  db.close();
  return bytes;
}
