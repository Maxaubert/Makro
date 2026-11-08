// Builds the fixture product database for local development and the Playwright smoke test.
//   node scripts/build-fixture.mjs        (npm run fixture)
// Writes, under scripts/out/ (git-ignored):
//   products-fixture.sqlite   served by the dev server at /__fixture/products.sqlite
//                             when VITE_PRODUCTS_SOURCE=fixture (no bucket needed)
//   products.sqlite.gz        and latest.json, the same layout nutrition-data's upload script
//   latest.json               puts in the "products" bucket, for trying the real download path
//                             against the local stack (scripts/upload-fixture-local.mjs)
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { buildFixture, FIXTURE_DB_VERSION } from './fixture.mjs';

const out = new URL('./out/', import.meta.url);
mkdirSync(out, { recursive: true });

const sqlite3 = await sqlite3InitModule();
const db = new sqlite3.oo1.DB(':memory:');
buildFixture(db);
db.exec('vacuum');
const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
db.close();

const gz = gzipSync(bytes);
const sha = (b) => createHash('sha256').update(b).digest('hex');
writeFileSync(new URL('products-fixture.sqlite', out), bytes);
writeFileSync(new URL('products.sqlite.gz', out), gz);
const latest = {
  db_version: FIXTURE_DB_VERSION,
  schema_version: 2,
  files: {
    'products.sqlite.gz': {
      path: `db-${FIXTURE_DB_VERSION}/products.sqlite.gz`,
      variant: 'full',
      bytes: gz.length,
      sha256: sha(gz),
      sha256_uncompressed: sha(bytes),
    },
  },
};
writeFileSync(new URL('latest.json', out), JSON.stringify(latest, null, 2) + '\n');
console.log(`fixture ${FIXTURE_DB_VERSION}: ${bytes.length} bytes, sha256 ${sha(bytes)}`);
