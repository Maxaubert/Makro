// A tiny products.sqlite for local development and tests, in the exact shape of
// packages/contracts/products-db.md v1 (schema_version 2) and loftspace/nutrition-data
// tools/build_slim.py. Not real data: the numbers are rounded label values, enough to
// exercise search, ml drinks, null serving_g, unknown nutrients, barcodes and redirects.
//
// Used by scripts/build-fixture.mjs (writes the file) and by the Vitest suites (in memory).

export const FIXTURE_DB_VERSION = '2026.10.25';

const N = ['kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'fibre_g', 'salt_g'];

export const FIXTURE_SOURCES = [
  ['custom', 'Your own food', 'custom'],
  ['matvaretabellen', 'Matvaretabellen', 'government'],
  ['oda', 'Oda', 'shop'],
  ['openfoodfacts', 'Open Food Facts', 'open_database'],
  ['tine', 'Tine', 'brand'],
];

// [id, name, brand, pack_size, ean, flavour, category, serving_g, per_100_unit, source, verified,
//  status, data_quality, ...8 nutrients in the order of N]
export const FIXTURE_PRODUCTS = [
  ['tine:skyr-naturell', 'Skyr Naturell', 'Tine', '450 g', '7038010012345', null, 'dairy_eggs', 170, 'g', 'tine', 1,
    'from_source', '["missing_fibre"]', 62, 11, 0.2, 0.1, 4, 4, null, 0.1],
  ['tine:skyr-vanilje', 'Skyr Vanilje', 'Tine', '450 g', '7038010012352', 'vanilje', 'dairy_eggs', 170, 'g', 'tine', 1,
    'from_source', null, 74, 10, 0.2, 0.1, 7.5, 7.5, 0, 0.1],
  ['openfoodfacts:7039010019999', 'Skyr Mango', 'Q', '450 g', '7039010019999', 'mango', 'dairy_eggs', null, 'g',
    'openfoodfacts', 0, 'from_source', '["no_nutrition"]', null, null, null, null, null, null, null, null],
  ['tine:lettmelk', 'Lettmelk', 'Tine', '1 l', '7038010000731', null, 'dairy_eggs', 250, 'ml', 'tine', 1,
    'from_source', null, 37, 3.5, 0.5, 0.3, 4.5, 4.5, 0, 0.1],
  ['oda:havregryn-lettkokt', 'Havregryn Lettkokt', 'Axa', '750 g', '7310130003134', null, 'bread_cereal_grain', null,
    'g', 'oda', 0, 'from_source', null, 372, 13, 7, 1.2, 59, 1, 10, 0.01],
  ['matvaretabellen:06.531', 'Banan', null, null, null, null, 'fruit_vegetables', 118, 'g', 'matvaretabellen', 1,
    'from_source', null, 89, 1.1, 0.3, 0.1, 20, 17, 1.9, 0],
  ['oda:kjottdeig-14', 'Kjøttdeig 14%', 'Gilde', '400 g', '0000070380107', null, 'meat_fish', null, 'g', 'oda', 0,
    'from_source', '["per100_basis_assumed"]', 208, 18, 14, 6, 0.5, 0.5, null, 1.1],
];

// Extra barcodes a product is known by (canonical form). The EAN-8 above is stored padded to 13.
export const FIXTURE_EXTRA_EANS = [['tine:skyr-naturell', '7038010099995']];
export const FIXTURE_REDIRECTS = [['tine:skyr-naturell-old', 'tine:skyr-naturell']];
export const FIXTURE_REMOVED = ['tine:skyr-jordbaer'];

const LETTERS = [['ø', 'o'], ['æ', 'ae'], ['å', 'a'], ['ä', 'a'], ['ö', 'o'], ['ü', 'u'], ['ß', 'ss']];
function normalise(text) {
  let out = text.toLowerCase();
  for (const [a, b] of LETTERS) out = out.split(a).join(b);
  return out.normalize('NFKD').replace(/\p{Mn}/gu, '');
}

/** Writes the fixture into an open, empty sqlite-wasm oo1 database. */
export function buildFixture(db, { schemaVersion = 2, dbVersion = FIXTURE_DB_VERSION } = {}) {
  db.exec(`
create table products(
  id text primary key,
  name text not null,
  brand text,
  pack_size text,
  ean text,
  flavour text,
  category text,
  serving_g real,
  per_100_unit text not null check (per_100_unit in ('g', 'ml')),
  source text not null,
  verified integer not null check (verified in (0, 1)),
  status text,
  data_quality text,
  kcal real, protein_g real, fat_g real, sat_fat_g real, carbs_g real, sugars_g real, fibre_g real, salt_g real,
  search_text text not null
);
create table sources(slug text primary key, display_name text not null, kind text not null);
create table product_eans(product_id text not null, ean text not null);
create table redirects(old_id text primary key, new_id text not null);
create table removed(id text primary key);
create table meta(key text primary key, value text not null);
`);
  for (const s of FIXTURE_SOURCES) db.exec({ sql: 'insert into sources values (?, ?, ?)', bind: s });
  const cols = 13 + N.length + 1;
  for (const p of FIXTURE_PRODUCTS) {
    const search = normalise([p[1], p[2], p[5]].filter(Boolean).join(' '));
    db.exec({ sql: `insert into products values (${Array(cols).fill('?').join(',')})`, bind: [...p, search] });
    if (p[4]) db.exec({ sql: 'insert into product_eans values (?, ?)', bind: [p[0], p[4]] });
  }
  for (const e of FIXTURE_EXTRA_EANS) db.exec({ sql: 'insert into product_eans values (?, ?)', bind: e });
  for (const r of FIXTURE_REDIRECTS) db.exec({ sql: 'insert into redirects values (?, ?)', bind: r });
  for (const id of FIXTURE_REMOVED) db.exec({ sql: 'insert into removed values (?)', bind: [id] });
  db.exec(`
create unique index ux_product_eans_ean on product_eans(ean);
create virtual table products_fts using fts5(
  search_text, content='products', content_rowid='rowid', tokenize='unicode61', prefix='2 3');
insert into products_fts(rowid, search_text) select rowid, search_text from products;
insert into products_fts(products_fts) values('optimize');
`);
  const meta = {
    db_version: dbVersion,
    schema_version: String(schemaVersion),
    variant: 'full',
    product_count: String(FIXTURE_PRODUCTS.length),
    built_at: '2026-10-25T00:00:00Z',
    source_commit: 'fixture',
  };
  for (const [k, v] of Object.entries(meta)) db.exec({ sql: 'insert into meta values (?, ?)', bind: [k, v] });
  db.exec(`pragma user_version = ${schemaVersion}`);
}
