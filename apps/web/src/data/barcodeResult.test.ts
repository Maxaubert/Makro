import { beforeAll, describe, expect, it } from 'vitest';
import { buildCustomFood, type CustomFoodRow } from '../domain/entry';
import { barcodeRoute, resolveBarcode } from './barcodeResult';
import { lookupBarcode } from './products';
import type { Sql } from './sql';
import { fixtureProducts } from './testing';

const SKYR_EAN = '7038010012345';
const NO_DATA_EAN = '7039010019999';
const UNKNOWN_EAN = '7038010000000';

function custom(ean: string, kcal = '120'): CustomFoodRow {
  return buildCustomFood({ name: 'My food', brand: '', ean, serving_g: '', per_100_unit: 'g', nutrients: { kcal } }, new Date('2026-11-09T10:00:00Z'));
}

let db: Sql;
const scan = (raw: string, mine: CustomFoodRow[] = []) => resolveBarcode(raw, lookupBarcode(db, raw), mine);

beforeAll(async () => {
  db = await fixtureProducts();
});

describe('what a scanned or typed barcode leads to', () => {
  it('a product with numbers goes to the portion screen', () => {
    const r = scan(SKYR_EAN);
    expect(r.kind).toBe('product');
    expect(barcodeRoute(r)).toBe('/portion/product/tine%3Askyr-naturell');
  });

  it('a product with no numbers at all goes to the no-data screen, keeping the scanned code', () => {
    const r = scan(NO_DATA_EAN);
    expect(r.kind).toBe('no-nutrition');
    const route = barcodeRoute(r) as string;
    expect(route.startsWith('/no-data/')).toBe(true);
    expect(route.endsWith(`?ean=${NO_DATA_EAN}`)).toBe(true);
  });

  it('a product missing only some values still goes to the portion screen', () => {
    const product = lookupBarcode(db, SKYR_EAN);
    expect(product?.nutrients.fibre_g).toBeNull();
    expect(resolveBarcode(SKYR_EAN, product, []).kind).toBe('product');
  });

  it('not found gives the canonical code, ready for the custom food', () => {
    const r = scan(UNKNOWN_EAN);
    expect(r).toEqual({ kind: 'not-found', ean: UNKNOWN_EAN });
    expect(barcodeRoute(r)).toBe(`/not-found/${UNKNOWN_EAN}`);
  });

  it('an EAN-8 not found is carried in canonical form', () => {
    expect(scan('96385074')).toEqual({ kind: 'not-found', ean: '0000096385074' });
  });

  it('your own food with this code is reused instead of asking again', () => {
    const mine = custom(UNKNOWN_EAN);
    const r = scan(UNKNOWN_EAN, [mine]);
    expect(r.kind).toBe('custom');
    expect(barcodeRoute(r)).toBe(`/portion/custom/${mine.id}`);
  });

  it('your own food is found from an EAN-8 scan too (stored canonical)', () => {
    const mine = custom('96385074');
    expect(scan('96385074', [mine]).kind).toBe('custom');
  });

  it('your own numbers beat a database row with no numbers', () => {
    expect(scan(NO_DATA_EAN, [custom(NO_DATA_EAN)]).kind).toBe('custom');
  });

  it('a database product with numbers beats your own food', () => {
    expect(scan(SKYR_EAN, [custom(SKYR_EAN)]).kind).toBe('product');
  });

  it('a custom food without a barcode never matches', () => {
    expect(scan(UNKNOWN_EAN, [custom('')]).kind).toBe('not-found');
  });

  it('something that is not a barcode has no route', () => {
    const r = resolveBarcode('abc', null, []);
    expect(r.kind).toBe('invalid');
    expect(barcodeRoute(r)).toBeNull();
  });
});
