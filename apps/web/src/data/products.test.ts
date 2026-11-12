import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertSupportedSchema,
  buildMatchQuery,
  getProduct,
  lookupBarcode,
  productAliases,
  productSubtext,
  readProductMeta,
  resolvePopularity,
  searchProducts,
} from './products';
import type { Sql } from './sql';
import { fixtureProducts } from './testing';

let db: Sql;
/** The same fixture shaped like 2026.11.11 and older: no common column. */
let old: Sql;
beforeAll(async () => {
  db = await fixtureProducts();
  old = await fixtureProducts({ common: false });
});

describe('product file meta', () => {
  it('reads db_version and schema_version', () => {
    expect(readProductMeta(db)).toEqual({ db_version: '2026.10.25', schema_version: 2, variant: 'full' });
  });
  it('refuses schema_version below 2', async () => {
    const old = await fixtureProducts({ schemaVersion: 1 });
    expect(() => assertSupportedSchema(readProductMeta(old))).toThrow(/schema_version 1/);
    expect(() => assertSupportedSchema(readProductMeta(db))).not.toThrow();
  });
});

describe('FTS query (products-db.md, Search)', () => {
  it('quotes every token, joins with AND and prefixes tokens of 2+ characters', () => {
    expect(buildMatchQuery('Skyr mango')).toBe('"skyr"* "mango"*');
    expect(buildMatchQuery('D-vita 50μg')).toBe('"d" "vita"* "50μg"*');
  });
  it('gives no query for an empty token list', () => {
    expect(buildMatchQuery('  -- ')).toBeNull();
  });
});

describe('productSubtext', () => {
  const base = { brand: null, pack_size: null, source_kind: 'shop' } as const;
  it('shows brand and sizes', () => {
    expect(productSubtext({ ...base, brand: 'Tine', pack_size: '1 L, 1,75 L' })).toBe('Tine · 1 L, 1,75 L');
  });
  it('shows only the brand when no size is known', () => {
    expect(productSubtext({ ...base, brand: 'Tine' })).toBe('Tine');
  });
  it('calls a food from a food table Generic', () => {
    expect(productSubtext({ ...base, source_kind: 'government' })).toBe('Generic');
    expect(productSubtext({ ...base, source_kind: 'government', pack_size: '100 g' })).toBe('Generic · 100 g');
  });
  it('invents nothing for a shop row with no brand', () => {
    expect(productSubtext(base)).toBeNull();
  });
});

describe('searchProducts', () => {
  it('finds skyr with source and verified on every row (rule 4)', () => {
    const rows = searchProducts(old, 'skyr');
    expect(rows.map((r) => r.id)).toEqual(['tine:skyr-naturell', 'tine:skyr-vanilje', 'openfoodfacts:7039010019999']);
    for (const r of rows) {
      expect(r.source).toBeTruthy();
      expect(r.source_name).toBeTruthy();
      expect(typeof r.verified).toBe('boolean');
    }
  });
  it('ranks products without kcal below those with values, but keeps them', () => {
    const rows = searchProducts(db, 'skyr');
    expect(rows.at(-1)?.nutrients.kcal).toBeNull();
  });
  it('keeps unknown nutrients as null, never 0', () => {
    const skyr = searchProducts(db, 'skyr naturell')[0];
    expect(skyr.nutrients.fibre_g).toBeNull();
    expect(skyr.nutrients.kcal).toBe(62);
  });
  it('normalises the query like search_text (kjøttdeig finds kjottdeig)', () => {
    expect(searchProducts(db, 'Kjøttdeig').map((r) => r.id)).toEqual(['oda:kjottdeig-14']);
    expect(searchProducts(db, 'kjottd').map((r) => r.id)).toEqual(['oda:kjottdeig-14']);
  });
  it('returns nothing for an empty query instead of an FTS syntax error', () => {
    expect(searchProducts(db, '')).toEqual([]);
    expect(searchProducts(db, '%%')).toEqual([]);
  });
  it('ranks the foods you log above equal matches (decision 36)', () => {
    const pop = resolvePopularity(old, [{ product_id: 'tine:skyr-vanilje', n: 3 }], []);
    expect(searchProducts(old, 'skyr', 20, pop).map((r) => r.id)[0]).toBe('tine:skyr-vanilje');
  });
  it('ranks foods many people log next, and your own habits above them', () => {
    const global = resolvePopularity(old, [], [{ product_id: 'tine:skyr-vanilje', users: 4, logs: 9 }]);
    expect(searchProducts(old, 'skyr', 20, global).map((r) => r.id)[0]).toBe('tine:skyr-vanilje');
    const both = resolvePopularity(old, [{ product_id: 'tine:skyr-naturell', n: 1 }], [{ product_id: 'tine:skyr-vanilje', users: 4, logs: 9 }]);
    expect(searchProducts(old, 'skyr', 20, both).map((r) => r.id)[0]).toBe('tine:skyr-naturell');
  });
  it('ranks everyday foods (common) above equal matches, after your own logs and before other people\'s', () => {
    expect(searchProducts(db, 'skyr').map((r) => r.id)).toEqual(['tine:skyr-vanilje', 'tine:skyr-naturell', 'openfoodfacts:7039010019999']);
    const mine = resolvePopularity(db, [{ product_id: 'tine:skyr-naturell', n: 1 }], []);
    expect(searchProducts(db, 'skyr', 20, mine).map((r) => r.id)[0]).toBe('tine:skyr-naturell');
    const others = resolvePopularity(db, [], [{ product_id: 'tine:skyr-naturell', users: 4, logs: 9 }]);
    expect(searchProducts(db, 'skyr', 20, others).map((r) => r.id)[0]).toBe('tine:skyr-vanilje');
  });
  it('never lets common beat a whole-word match', () => {
    expect(searchProducts(db, 'skyr naturell').map((r) => r.id)[0]).toBe('tine:skyr-naturell');
  });
  it('never lets popularity beat a whole-word match or lift a row without kcal above one with it', () => {
    const pop = resolvePopularity(db, [{ product_id: 'openfoodfacts:7039010019999', n: 50 }], []);
    expect(searchProducts(db, 'skyr', 20, pop).at(-1)?.id).toBe('openfoodfacts:7039010019999');
  });
  it('counts logs of a merged listing for the product it became', () => {
    const pop = resolvePopularity(db, [{ product_id: 'tine:skyr-naturell-old', n: 2 }, { product_id: 'tine:skyr-naturell', n: 1 }], []);
    expect(pop.get('tine:skyr-naturell')?.mine).toBe(3);
    expect(pop.has('tine:skyr-naturell-old')).toBe(false);
  });
  /** The fixture plus 600 rows that match 'skyr' better than Skyr Vanilje does. */
  async function crowded(common: boolean): Promise<Sql> {
    const big = await fixtureProducts({ common });
    const cols = big.all<{ name: string }>('pragma table_info(products)').map((c) => c.name);
    const rest = cols.filter((c) => c !== 'id' && c !== 'search_text' && c !== 'common').join(', ');
    for (let n = 0; n < 600; n++) {
      big.run(`insert into products (id, search_text, ${rest}) select ?, 'skyr', ${rest} from products where id = 'tine:skyr-naturell'`, [`x:${n}`]);
    }
    big.run("insert into products_fts(products_fts) values('rebuild')");
    return big;
  }
  it('still finds a popular food when more than 500 rows match better', async () => {
    const big = await crowded(false);
    expect(searchProducts(big, 'skyr', 20).map((r) => r.id)).not.toContain('tine:skyr-vanilje');
    const pop = resolvePopularity(big, [{ product_id: 'tine:skyr-vanilje', n: 1 }], []);
    expect(searchProducts(big, 'skyr', 20, pop)[0].id).toBe('tine:skyr-vanilje');
  });
  it('still finds an everyday food when more than 500 rows match better', async () => {
    expect(searchProducts(await crowded(true), 'skyr', 20)[0].id).toBe('tine:skyr-vanilje');
  });
  it('carries per_100_unit and a null serving_g as they are', () => {
    expect(searchProducts(db, 'lettmelk')[0].per_100_unit).toBe('ml');
    expect(searchProducts(db, 'havregryn')[0].serving_g).toBeNull();
  });
});

describe('typo correction (products-db.md, Search step 6)', () => {
  /** The fixture plus extra rows, searchable once the FTS index is rebuilt. */
  async function withRows(extra: readonly (readonly [id: string, text: string])[]): Promise<Sql> {
    const out = await fixtureProducts();
    const cols = out.all<{ name: string }>('pragma table_info(products)').map((c) => c.name);
    const rest = cols.filter((c) => c !== 'id' && c !== 'name' && c !== 'search_text' && c !== 'ean').join(', ');
    for (const [id, text] of extra) {
      out.run(
        `insert into products (id, name, search_text, ${rest}) select ?, ?, ?, ${rest} from products where id = 'tine:skyr-naturell'`,
        [id, text, text],
      );
    }
    out.run("insert into products_fts(products_fts) values('rebuild')");
    return out;
  }
  const BAREBELLS = [
    ['b:1', 'barebells protein bar salty peanut'],
    ['b:2', 'barebells protein bar caramel'],
    ['b:3', 'barebells soft bar'],
  ] as const;
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it('barebels finds Barebells', async () => {
    const big = await withRows(BAREBELLS);
    expect(ids(searchProducts(big, 'barebels')).sort()).toEqual(['b:1', 'b:2', 'b:3']);
  });
  it('kjottdeig and kjøttdeig find the product directly, and a typo finds it too', () => {
    expect(ids(searchProducts(db, 'kjottdeig'))).toEqual(['oda:kjottdeig-14']);
    expect(ids(searchProducts(db, 'kjøttdeig'))).toEqual(['oda:kjottdeig-14']);
    expect(ids(searchProducts(db, 'kjotdeig'))).toEqual(['oda:kjottdeig-14']);
    expect(ids(searchProducts(db, 'kjøtdeig'))).toEqual(['oda:kjottdeig-14']);
  });
  it('corrects one word of several and keeps the others', async () => {
    const big = await withRows(BAREBELLS);
    expect(ids(searchProducts(big, 'barebels caramel'))).toEqual(['b:2']);
  });
  it('leaves a query that already finds enough alone', async () => {
    const big = await withRows([...BAREBELLS, ['t:1', 'barebels a'], ['t:2', 'barebels b'], ['t:3', 'barebels c']]);
    expect(ids(searchProducts(big, 'barebels')).sort()).toEqual(['t:1', 't:2', 't:3']);
  });
  it('shows what the query really found first, then the correction', async () => {
    const big = await withRows([...BAREBELLS, ['t:1', 'barebels misprint']]);
    const found = ids(searchProducts(big, 'barebels'));
    expect(found[0]).toBe('t:1');
    expect(found.slice(1).sort()).toEqual(['b:1', 'b:2', 'b:3']);
  });
  it('ranks corrected results with the normal order, popularity included', async () => {
    const big = await withRows(BAREBELLS);
    const pop = resolvePopularity(big, [{ product_id: 'b:3', n: 2 }], []);
    expect(ids(searchProducts(big, 'barebels', 20, pop))[0]).toBe('b:3');
  });
  it('respects the limit across real and corrected rows', async () => {
    const big = await withRows([...BAREBELLS, ['t:1', 'barebels misprint']]);
    expect(searchProducts(big, 'barebels', 2)).toHaveLength(2);
  });
  it('finds nothing when no word is close enough', () => {
    expect(searchProducts(db, 'qwertyuiop')).toEqual([]);
  });
  it('does not correct numbers or very short tokens', () => {
    expect(searchProducts(db, 'skr')).toEqual([]);
    expect(searchProducts(db, '1450')).toEqual([]);
  });
  it('never writes to the product file: the vocabulary table lives in temp', async () => {
    const big = await withRows(BAREBELLS);
    const schema = () => big.all('select name from main.sqlite_master order by name');
    const before = schema();
    searchProducts(big, 'barebels');
    expect(schema()).toEqual(before);
    expect(big.all("select name from temp.sqlite_master where name = 'products_vocab'")).toHaveLength(1);
  });
  it('does no vocabulary work for a query that finds enough', async () => {
    const fresh = await fixtureProducts();
    searchProducts(fresh, 'skyr');
    expect(fresh.all("select name from temp.sqlite_master where name = 'products_vocab'")).toHaveLength(0);
  });
});

describe('getProduct resolves ids in the contract order', () => {
  it('finds a product by id', () => {
    expect(getProduct(db, 'tine:lettmelk')).toMatchObject({ status: 'found', product: { name: 'Lettmelk' } });
  });
  it('follows a redirect', () => {
    expect(getProduct(db, 'tine:skyr-naturell-old')).toMatchObject({
      status: 'redirected',
      product: { id: 'tine:skyr-naturell' },
    });
  });
  it('treats a removed id and an unknown id as removed', () => {
    expect(getProduct(db, 'tine:skyr-jordbaer')).toEqual({ status: 'removed' });
    expect(getProduct(db, 'nope:nothing')).toEqual({ status: 'removed' });
  });
});

describe('productAliases', () => {
  it('lists the id and every old id that redirects to it', () => {
    expect(productAliases(db, 'tine:skyr-naturell')).toEqual(['tine:skyr-naturell', 'tine:skyr-naturell-old']);
    expect(productAliases(db, 'tine:lettmelk')).toEqual(['tine:lettmelk']);
  });
});

describe('lookupBarcode canonicalises before the lookup', () => {
  it('finds an EAN-13', () => {
    expect(lookupBarcode(db, '7038010012345')?.id).toBe('tine:skyr-naturell');
  });
  it('finds an extra barcode of the product', () => {
    expect(lookupBarcode(db, '7038010099995')?.id).toBe('tine:skyr-naturell');
  });
  it('finds an EAN-8 typed as 8 digits (stored padded to 13)', () => {
    expect(lookupBarcode(db, '70380107')?.id).toBe('oda:kjottdeig-14');
  });
  it('finds a GTIN-14 with a leading zero and ignores separators', () => {
    expect(lookupBarcode(db, '0 7038010012345')?.id).toBe('tine:skyr-naturell');
  });
  it('returns null for an unknown code or not a barcode', () => {
    expect(lookupBarcode(db, '7038010000000')).toBeNull();
    expect(lookupBarcode(db, 'abc')).toBeNull();
  });
});
