// Logging again what was logged before: favourites, saved meals and repeat yesterday (#25).
// Everything written here is a normal log entry with a new snapshot: the numbers of the current
// food, or the last snapshot when that food is gone, and unknown stays null (rules 2 and 3).
import { buildRepeatedEntry, mealEntries, type EntryMeal, type EntrySnapshot, type FoodKey, type FoodRef, type LogEntryRow, type Meal, type RepeatItem } from '../domain/entry';
import { stampLocalDay } from '../domain/localDate';
import type { LogStore } from './logStore';
import { getProduct } from './products';
import type { Sql } from './sql';

/** The installed product database; null until it is on this device. */
export type Catalogue = { sql: Sql; db_version: string | null } | null;

export function currentFood(log: LogStore, catalogue: Catalogue, key: FoodKey): FoodRef | null {
  if (key.custom_food_id !== null) {
    const food = log.customFood(key.custom_food_id);
    return food && !food.deleted_at ? { kind: 'custom', food } : null;
  }
  if (!catalogue || key.product_id === null) return null;
  const r = getProduct(catalogue.sql, key.product_id);
  return r.status === 'removed' ? null : { kind: 'product', product: r.product, db_version: catalogue.db_version };
}

/** The favourites that can be logged now, one row per food, newest first. */
export function favouriteFoods(log: LogStore, catalogue: Catalogue): FoodRef[] {
  const seen = new Set<string>();
  const out: FoodRef[] = [];
  for (const key of log.favourites()) {
    const food = currentFood(log, catalogue, key);
    if (!food) continue;
    const id = food.kind === 'product' ? food.product.id : food.food.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(food);
  }
  return out;
}

interface Planned {
  item: RepeatItem;
  meal: Meal;
  /** The source entry's own snapshot; null means look up the last one held for the food. */
  snapshot: EntrySnapshot | null;
}

function write(log: LogStore, catalogue: Catalogue, planned: Planned[], at: Date, tz: string): number {
  // Each entry is a millisecond later, so the copies keep their order in the diary.
  const rows: LogEntryRow[] = planned.map(({ item, meal, snapshot }, i) => {
    const food = currentFood(log, catalogue, item);
    return buildRepeatedEntry({ item, food, snapshot: food ? null : (snapshot ?? log.latestSnapshot(item)), meal, at: new Date(at.getTime() + i), tz });
  });
  log.saveLogEntries(rows);
  return rows.length;
}

/** One tap: every item of a saved meal becomes an entry in `meal`. Returns how many were written. */
export function logSavedMeal(log: LogStore, catalogue: Catalogue, id: string, meal: Meal, at: Date, tz: string): number {
  const saved = log.savedMeal(id);
  if (!saved) throw new Error('This saved meal is no longer on this device.');
  return write(log, catalogue, saved.items.map((item) => ({ item, meal, snapshot: null })), at, tz);
}

type RepeatKey = FoodKey & { meal: EntryMeal; quantity: number; unit: string };

/** The entries of `from` that `already` does not hold yet, counting duplicates one by one. */
export function notYetRepeated<T extends RepeatKey>(from: readonly T[], already: readonly RepeatKey[]): T[] {
  const key = (e: RepeatKey) => JSON.stringify([e.meal, e.product_id, e.custom_food_id, e.quantity, e.unit]);
  const left = new Map<string, number>();
  for (const e of already) left.set(key(e), (left.get(key(e)) ?? 0) + 1);
  return from.filter((e) => {
    const n = left.get(key(e)) ?? 0;
    if (n > 0) left.set(key(e), n - 1);
    return n === 0;
  });
}

/** Copy the chosen meals of an earlier day to today, skipping what is already there. */
export function repeatMeals(log: LogStore, catalogue: Catalogue, what: { from: string; meals: Meal[] }, at: Date, tz: string): number {
  const today = log.dayEntries(stampLocalDay(at, tz).local_date);
  const entries = notYetRepeated(mealEntries(log.dayEntries(what.from)).filter((e) => what.meals.includes(e.meal)), today);
  return write(log, catalogue, entries.map((e) => ({ item: e, meal: e.meal, snapshot: e })), at, tz);
}
