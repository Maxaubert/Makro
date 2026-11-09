// What a scanned or typed barcode leads to. One decision for the camera and for typing, so the
// two cannot drift apart. Lookup is offline: the product file and the local custom foods.
import type { CustomFoodRow } from '../domain/entry';
import { NUTRIENTS } from '../domain/nutrients';
import { canonicalEan } from './barcode';
import type { Product } from './products';

export type BarcodeResult =
  | { kind: 'invalid' }
  | { kind: 'product'; product: Product }
  | { kind: 'custom'; food: CustomFoodRow }
  | { kind: 'no-nutrition'; product: Product; ean: string }
  | { kind: 'not-found'; ean: string };

export function resolveBarcode(raw: string, product: Product | null, customFoods: readonly CustomFoodRow[]): BarcodeResult {
  const ean = canonicalEan(raw);
  if (ean === null) return { kind: 'invalid' };
  const noNumbers = product !== null && NUTRIENTS.every((n) => product.nutrients[n] === null);
  if (product && !noNumbers) return { kind: 'product', product };
  // Scanned before and saved with its label values: use those instead of asking again.
  const food = customFoods.find((f) => f.ean === ean);
  if (food) return { kind: 'custom', food };
  return product ? { kind: 'no-nutrition', product, ean } : { kind: 'not-found', ean };
}

/** The hash route for a result. null when the input was not a barcode. */
export function barcodeRoute(r: BarcodeResult): string | null {
  switch (r.kind) {
    case 'product':
      return `/portion/product/${encodeURIComponent(r.product.id)}`;
    case 'custom':
      return `/portion/custom/${encodeURIComponent(r.food.id)}`;
    case 'no-nutrition':
      return `/no-data/${encodeURIComponent(r.product.id)}?ean=${r.ean}`;
    case 'not-found':
      return `/not-found/${r.ean}`;
    case 'invalid':
      return null;
  }
}

/** Looks the code up and says where to go. */
export async function barcodeDestination(
  db: { barcode(raw: string): Promise<Product | null>; customFoods(): Promise<CustomFoodRow[]> },
  raw: string,
): Promise<string | null> {
  const [product, customFoods] = await Promise.all([db.barcode(raw), db.customFoods()]);
  return barcodeRoute(resolveBarcode(raw, product, customFoods));
}
