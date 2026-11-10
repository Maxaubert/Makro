// Canonical barcode form (packages/contracts/products-db.md, Barcodes), applied before every
// lookup in product_eans. No check-digit validation: rows with a bad check digit are still found.
//   1. keep digits only
//   2. fewer than 13 digits: left-pad with zeros to 13 (EAN-8, UPC-A)
//   3. 14 digits starting with 0: drop it (a GTIN-14 that is really an EAN-13)
//   4. no digits, or more than 14: not a barcode
/** Lengths a typed code may have: EAN-8, UPC-A, EAN-13 and GTIN-14. Other lengths would be padded into the wrong code. */
export const BARCODE_LENGTHS = [8, 12, 13, 14];

export function canonicalEan(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 14) return null;
  if (digits.length < 13) return digits.padStart(13, '0');
  if (digits.length === 14 && digits[0] === '0') return digits.slice(1);
  return digits;
}
