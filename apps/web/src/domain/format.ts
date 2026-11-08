// Turning numbers into text for the screens. Rounding goes through roundForDisplay (the
// display.json rule); unknown shows as "?" and is never printed as 0 (rule 2).
import { roundForDisplay } from './display';
import type { NutrientTotal } from './totals';

export function formatNumber(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined) return '?';
  const r = roundForDisplay(value, digits) as number;
  return r.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** A day total and how many entries had no value for it. An empty day really is 0. */
export function formatTotal(t: NutrientTotal, digits: number): { text: string; unknown: number } {
  const unknown = t.count - t.covered;
  if (t.count === 0) return { text: '0', unknown: 0 };
  return { text: formatNumber(t.value, digits), unknown };
}
