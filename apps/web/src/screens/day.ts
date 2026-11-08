// Shared helpers for the day screens.
import type { LocalLogEntry } from '../data/logStore';
import type { Meal } from '../domain/entry';
import { NUTRIENTS } from '../domain/nutrients';
import { dayTotals, type NutrientTotal } from '../domain/totals';
import { stampLocalDay } from '../domain/localDate';

export function today(): string {
  return stampLocalDay().local_date;
}

/** Day totals from the stored per-entry totals; unknown stays unknown with a count. */
export function totalsOf(entries: LocalLogEntry[]): Record<string, NutrientTotal> {
  return dayTotals(
    entries.map((e) => Object.fromEntries(NUTRIENTS.map((n) => [n, e[`${n}_total`]]))),
    NUTRIENTS,
  );
}

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** A sensible default meal for the time of day. */
export function mealForNow(d = new Date()): Meal {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export function addDays(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function dayLabel(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function amountLabel(e: { quantity: number; unit: string; grams: number }): string {
  const q = Number.isInteger(e.quantity) ? String(e.quantity) : e.quantity.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (e.unit === 'g') return `${q} g`;
  if (e.unit === 'ml') return `${q} ml`;
  const g = Math.round(e.grams);
  return `${q} ${e.unit}${e.quantity === 1 ? '' : 's'} · ${g} g`;
}
