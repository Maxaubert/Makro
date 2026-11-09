// The pure parts of the D_Diary board: which days the list shows, a day row, the amount stepper,
// the live preview of an inline edit and the top sources. Unknown stays null (rule 2).
import type { LocalLogEntry } from '../../data/logStore';
import { roundForDisplay } from '../../domain/display';
import { parseAmount, type Meal } from '../../domain/entry';
import type { AmountUnit } from '../../domain/grams';
import { NUTRIENTS, type Nutrient } from '../../domain/nutrients';
import { portion } from '../../domain/portion';
import type { NutrientTotal } from '../../domain/totals';
import { addDays, totalsOf } from '../day';

const PAGE_DAYS = 7;

function daysBefore(date: string, later: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(later) - utc(date)) / 86_400_000);
}

/** Seven days, newest first, in blocks counted back from today, so a block stays put as days are picked. */
export function listWindow(date: string, now: string): string[] {
  const blocks = Math.floor(Math.max(0, daysBefore(date, now)) / PAGE_DAYS);
  const end = addDays(now, -blocks * PAGE_DAYS);
  return Array.from({ length: PAGE_DAYS }, (_, i) => addDays(end, -i));
}

/** The day a chevron goes to: a week from the picked day, never past today. */
export function pageDay(date: string, now: string, direction: -1 | 1): string {
  const next = addDays(date, direction * PAGE_DAYS);
  return next > now ? now : next;
}

export function canPageForward(date: string, now: string): boolean {
  return listWindow(date, now)[0] < now;
}

export interface DayRowSummary {
  kcal: NutrientTotal;
  /** Width of the row's bar, 0 to 100. */
  pct: number;
  over: boolean;
}

export function dayRowSummary(entries: LocalLogEntry[], kcalTarget: number | null): DayRowSummary {
  const kcal = totalsOf(entries).kcal;
  const measurable = kcal.value !== null && kcalTarget !== null && kcalTarget > 0;
  return {
    kcal,
    pct: measurable ? Math.min(100, ((kcal.value as number) / (kcalTarget as number)) * 100) : 0,
    over: measurable && (kcal.value as number) > (kcalTarget as number),
  };
}

/** One press of + or -: 10 for grams and millilitres, 1 otherwise, stopping at one step. */
export function steppedAmount(quantity: number, unit: AmountUnit, direction: -1 | 1): number {
  const step = unit === 'g' || unit === 'ml' ? 10 : 1;
  const next = roundForDisplay(quantity + direction * step, 2) as number;
  return next < step ? quantity : next;
}

/** null when the text is empty or cannot be read. */
export function parsedQuantity(text: string): number | null {
  try {
    return parseAmount(text);
  } catch {
    return null;
  }
}

/** The entry as it will be after Done, so totals and meals follow the edit. The snapshot is untouched. */
export function previewEntry(entry: LocalLogEntry, draft: { quantity: number | null; meal: Meal }): LocalLogEntry {
  const moved = { ...entry, meal: draft.meal };
  if (draft.quantity === null) return moved;
  const perUnit = entry.unit === 'g' || entry.unit === 'ml' ? 1 : entry.quantity > 0 ? entry.grams / entry.quantity : null;
  if (perUnit === null) return moved;
  const grams = draft.quantity * perUnit;
  const values = portion(Object.fromEntries(NUTRIENTS.map((n) => [n, entry[n]])), grams);
  return { ...moved, quantity: draft.quantity, grams, ...Object.fromEntries(NUTRIENTS.map((n) => [`${n}_total`, values[n]])) };
}

export interface TopSource {
  id: string;
  name: string;
  value: number;
  /** Width of its bar: relative to the largest, never narrower than 6 so it stays visible. */
  pct: number;
}

export function topSources(entries: LocalLogEntry[], key: Nutrient, limit = 3): TopSource[] {
  const known = entries
    .map((e) => ({ id: e.id, name: e.name, value: e[`${key}_total`] }))
    .filter((e): e is { id: string; name: string; value: number } => e.value !== null && e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const largest = known[0]?.value ?? 1;
  return known.map((e) => ({ ...e, pct: Math.max(6, (e.value / largest) * 100) }));
}
