// Per-100 values to the values for a portion: value * grams / 100. Checked by
// packages/contracts/nutrition/portion.json. null (unknown) stays null, never 0.
import { NUTRIENTS } from './nutrients';

/** Nutrient values keyed by name. null or a missing key means unknown. */
export type NutrientValues = Partial<Record<string, number | null>>;

export function portionValue(per100: number | null | undefined, grams: number): number | null {
  if (per100 === null || per100 === undefined) return null;
  return (per100 * grams) / 100;
}

export function portion(
  per100: NutrientValues,
  grams: number,
  nutrients: readonly string[] = NUTRIENTS,
): Record<string, number | null> {
  if (!Number.isFinite(grams) || grams < 0) throw new RangeError(`grams must be a finite number >= 0, got ${grams}`);
  const out: Record<string, number | null> = {};
  for (const n of nutrients) out[n] = portionValue(per100[n], grams);
  return out;
}
