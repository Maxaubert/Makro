import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertSupportedSchema,
  buildMatchQuery,
  getProduct,
  lookupBarcode,
  productAliases,
  readProductMeta,
  resolvePopularity,
  searchProducts,
} from './products';
import type { Sql } from './sql';
import { fixtureProducts } from './testing';

let db: Sql;
beforeAll(async () => {
  db = await fixtureProducts();
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

describe('searchProducts', () => {
  it('finds skyr with source and verified on every row (rule 4)', () => {
    const rows = searchProducts(db, 'skyr');
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
    const pop = resolvePopularity(db, [{ product_id: 'tine:skyr-vanilje', n: 3 }], []);
    expect(searchProducts(db, 'skyr', 20, pop).map((r) => r.id)[0]).toBe('tine:skyr-vanilje');
  });
  it('ranks foods many people log next, and your own habits above them', () => {
    const global = resolvePopularity(db, [], [{ product_id: 'tine:skyr-vanilje', users: 4, logs: 9 }]);
    expect(searchProducts(db, 'skyr', 20, global).map((r) => r.id)[0]).toBe('tine:skyr-vanilje');
    const both = resolvePopularity(db, [{ product_id: 'tine:skyr-naturell', n: 1 }], [{ product_id: 'tine:skyr-vanilje', users: 4, logs: 9 }]);
    expect(searchProducts(db, 'skyr', 20, both).map((r) => r.id)[0]).toBe('tine:skyr-naturell');
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
  it('still finds a popular food when more than 500 rows match better', async () => {
    const big = await fixtureProducts();
    const cols = big.all<{ name: string }>('pragma table_info(products)').map((c) => c.name);
    const rest = cols.filter((c) => c !== 'id' && c !== 'search_text').join(', ');
    for (let n = 0; n < 600; n++) {
      big.run(`insert into products (id, search_text, ${rest}) select ?, 'skyr', ${rest} from products where id = 'tine:skyr-naturell'`, [`x:${n}`]);
    }
    big.run("insert into products_fts(products_fts) values('rebuild')");
    expect(searchProducts(big, 'skyr', 20).map((r) => r.id)).not.toContain('tine:skyr-vanilje');
    const pop = resolvePopularity(big, [{ product_id: 'tine:skyr-vanilje', n: 1 }], []);
    expect(searchProducts(big, 'skyr', 20, pop)[0].id).toBe('tine:skyr-vanilje');
  });
  it('carries per_100_unit and a null serving_g as they are', () => {
    expect(searchProducts(db, 'lettmelk')[0].per_100_unit).toBe('ml');
    expect(searchProducts(db, 'havregryn')[0].serving_g).toBeNull();
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
