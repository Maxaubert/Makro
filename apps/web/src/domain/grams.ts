// Grams resolution for a log entry (packages/contracts/log-schema.md, log_entries.grams),
// checked by packages/contracts/nutrition/grams.json.
//   g               quantity as entered
//   ml              quantity, 1 ml = 1 g, marked approximate
//   piece, serving  quantity * serving_g; null serving_g means it cannot be resolved (grams null)
//   portion         quantity * 100 for a food stored per portion (decision 42): not a weight, so the
//                   totals (value * grams / 100) are the printed per-portion values times the portions

export const AMOUNT_UNITS = ['g', 'ml', 'piece', 'serving', 'portion'] as const;
export type AmountUnit = (typeof AMOUNT_UNITS)[number];

export interface Amount {
  quantity: number;
  unit: AmountUnit;
  serving_g: number | null;
}

export interface ResolvedGrams {
  /** null when the amount cannot be turned into grams; the UI must then ask for a weight. */
  grams: number | null;
  /** true for ml, which is shown as approximate. */
  approximate: boolean;
}

export function resolveGrams({ quantity, unit, serving_g }: Amount): ResolvedGrams {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`quantity must be a finite number >= 0, got ${quantity}`);
  }
  switch (unit) {
    case 'g':
      return { grams: quantity, approximate: false };
    case 'ml':
      return { grams: quantity, approximate: true };
    case 'portion':
      return { grams: quantity * 100, approximate: false };
    case 'piece':
    case 'serving':
      if (serving_g === null || serving_g === undefined) return { grams: null, approximate: false };
      return { grams: quantity * serving_g, approximate: false };
    default:
      throw new Error(`unknown unit: ${String(unit)}`);
  }
}
