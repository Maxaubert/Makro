// Daily supplements (#52, log-schema.md, cases in guidance/daily_supplements.json).
// A supplement row says what to add every day; each day's entry is a normal log entry with
// meal 'supplements', its own snapshot (rule 3) and daily_supplement_id set. Only today is filled
// in, never a day the app was not opened. Pure: no clock, no database.
import { buildRepeatedEntry, type EntrySnapshot, type FoodRef, type LogEntryRow } from './entry';
import { resolveGrams, type AmountUnit } from './grams';
import { stampLocalDay } from './localDate';
import { uuidv7 } from './uuid';

export interface DailySupplementRow {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  product_id: string | null;
  custom_food_id: string | null;
  name: string;
  quantity: number;
  unit: AmountUnit;
  grams: number;
  sort_order: number;
  start_date: string;
  stopped_on: string | null;
}

type DueSupplement = Pick<DailySupplementRow, 'id' | 'start_date' | 'stopped_on' | 'deleted_at'>;
type TodayEntry = { daily_supplement_id: string | null; deleted_at: string | null };

/** Active on `day`: not deleted, started on or before it, and not stopped on or before it. */
export function isActiveOn(s: DueSupplement, day: string): boolean {
  return s.deleted_at === null && s.start_date <= day && (s.stopped_on === null || s.stopped_on > day);
}

/** The supplements that need an entry today. Any row for today, a skip (tombstone) included, means none. */
export function dueToday<T extends DueSupplement>(supplements: readonly T[], entriesToday: readonly TodayEntry[], today: string): T[] {
  const has = new Set(entriesToday.map((e) => e.daily_supplement_id).filter((id): id is string => id !== null));
  return supplements.filter((s) => isActiveOn(s, today) && !has.has(s.id));
}

/** The local day after `day` (YYYY-MM-DD): "Stop adding daily" keeps today's entry. */
export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildDailySupplement(input: { food: FoodRef; quantity: number; unit: AmountUnit; at: Date; tz: string; sort_order?: number }): DailySupplementRow {
  const per = input.food.kind === 'product' ? input.food.product : input.food.food;
  const { grams } = resolveGrams({ quantity: input.quantity, unit: input.unit, serving_g: per.serving_g });
  if (grams === null) throw new Error('this food has no serving size; enter the amount in grams');
  const now = input.at.toISOString();
  return {
    id: uuidv7(input.at.getTime()),
    created_at: now,
    updated_at: now,
    deleted_at: null,
    product_id: input.food.kind === 'product' ? input.food.product.id : null,
    custom_food_id: input.food.kind === 'custom' ? input.food.food.id : null,
    name: per.name,
    quantity: input.quantity,
    unit: input.unit,
    grams,
    sort_order: input.sort_order ?? 0,
    start_date: stampLocalDay(input.at, input.tz).local_date,
    stopped_on: null,
  };
}

/** Today's entry for a supplement: the current food's numbers, else the last snapshot, else unknown (rules 2 and 3). */
export function supplementEntry(input: { supplement: DailySupplementRow; food: FoodRef | null; snapshot: EntrySnapshot | null; at: Date; tz: string }): LogEntryRow {
  const s = input.supplement;
  const item = { product_id: s.product_id, custom_food_id: s.custom_food_id, quantity: s.quantity, unit: s.unit, grams: s.grams, name: s.name };
  const entry = buildRepeatedEntry({ item, food: input.food, snapshot: input.food ? null : input.snapshot, meal: 'snack', at: input.at, tz: input.tz });
  return { ...entry, meal: 'supplements', daily_supplement_id: s.id };
}
