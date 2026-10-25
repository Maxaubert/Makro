import { describe, expect, it } from 'vitest';
import { canonicalEan } from './barcode';

// The canonical barcode rule of packages/contracts/products-db.md (Barcodes).
// search/barcode.json is not in the golden files yet, so the contract's own cases live here.
describe('canonicalEan', () => {
  it.each([
    ['EAN-13 stays as it is', '7038010012345', '7038010012345'],
    ['EAN-8 is left-padded to 13', '96385074', '0000096385074'],
    ['UPC-A is left-padded to 13', '036000291452', '0036000291452'],
    ['GTIN-14 with a leading 0 drops it', '07038010012345', '7038010012345'],
    ['GTIN-14 without a leading 0 stays 14 digits', '17038010012345', '17038010012345'],
    ['separators are removed', '7 038010-012345', '7038010012345'],
    ['an invalid check digit is still looked up', '7038010012346', '7038010012346'],
  ])('%s', (_label, input, expected) => {
    expect(canonicalEan(input)).toBe(expected);
  });

  it.each([
    ['no digits', 'abc'],
    ['empty', ''],
    ['more than 14 digits', '123456789012345'],
  ])('%s is not a barcode', (_label, input) => {
    expect(canonicalEan(input)).toBeNull();
  });
});
