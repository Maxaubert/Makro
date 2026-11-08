// Day totals over log entries, checked by packages/contracts/nutrition/totals.json.
// value = sum of the known values, or null if none is known (never COALESCE to 0);
// covered = entries with a known value; count = all entries.
import { NUTRIENTS } from './nutrients';
import type { NutrientValues } from './portion';

export interface NutrientTotal {
  value: number | null;
  covered: number;
  count: number;
}

export function dayTotals(
  items: readonly NutrientValues[],
  nutrients: readonly string[] = NUTRIENTS,
): Record<string, NutrientTotal> {
  const out: Record<string, NutrientTotal> = {};
  for (const n of nutrients) {
    let value: number | null = null;
    let covered = 0;
    for (const item of items) {
      const v = item[n];
      if (v === null || v === undefined) continue;
      value = (value ?? 0) + v;
      covered += 1;
    }
    out[n] = { value, covered, count: items.length };
  }
  return out;
}
