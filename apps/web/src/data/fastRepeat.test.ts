import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCustomFood, buildFavourite, buildLogEntry, buildSavedMeal, type LogEntryRow, type Meal } from '../domain/entry';
import { favouriteFoods, logSavedMeal, notYetRepeated, repeatMeals, type Catalogue } from './fastRepeat';
import { getProduct, type Product } from './products';
import { LogStore } from './logStore';
import { fixtureProducts, memoryDb } from './testing';

const yesterday = new Date('2026-10-20T08:00:00.000Z');
const now = new Date('2026-10-21T12:00:00.000Z');
const TODAY = '2026-10-21';
const YESTERDAY = '2026-10-20';

let catalogue: Catalogue;
let skyr: Product;
let store: LogStore;

beforeAll(async () => {
  const sql = await fixtureProducts();
  catalogue = { sql, db_version: '2026.10.25' };
  const r = getProduct(sql, 'tine:skyr-naturell');
  if (r.status === 'removed') throw new Error('fixture lacks skyr');
  skyr = r.product;
});

beforeEach(async () => {
  store = new LogStore(await memoryDb(), () => now);
  store.migrate();
});

/** An entry logged yesterday from a product as it looked then. */
function logged(product: Product, opts: { quantity?: number; unit?: LogEntryRow['unit']; meal?: Meal; at?: Date; db_version?: string } = {}): LogEntryRow {
  const row = buildLogEntry({
    food: { kind: 'product', product, db_version: opts.db_version ?? '2026.01.01' },
    quantity: opts.quantity ?? 150,
    unit: opts.unit ?? 'g',
    meal: opts.meal ?? 'breakfast',
    at: opts.at ?? yesterday,
    tz: 'UTC',
  });
  store.saveLogEntry(row);
  return row;
}

const oldSkyr = (): Product => ({ ...skyr, nutrients: { ...skyr.nutrients, kcal: 50 } });
const custom = (over: Partial<Record<string, string>> = {}) =>
  buildCustomFood({ name: 'Mormors brød', brand: '', ean: '', serving_g: '40', per_100_unit: 'g', nutrients: { kcal: '250', ...over } }, yesterday);

function savedMealOf(entries: LogEntryRow[], name = 'Usual'): string {
  const { meal, items } = buildSavedMeal(name, entries, yesterday);
  store.saveSavedMeal(meal, items);
  return meal.id;
}

describe('favourites', () => {
  const fav = (product_id: string) => buildFavourite({ product_id, custom_food_id: null }, yesterday);

  it('stores a favourite and queues it for sync', () => {
    store.addFavourite(fav(skyr.id));
    expect(store.isFavourite('product', [skyr.id])).toBe(true);
    expect(store.outboxBatch(10).map((i) => i.table)).toEqual(['favourites']);
  });

  it('keeps one live row when the same food is added twice', () => {
    store.addFavourite(fav(skyr.id));
    store.addFavourite(fav(skyr.id));
    expect(store.favourites()).toHaveLength(1);
  });

  it('counts a favourite stored under an old id, and removes it through the same aliases', () => {
    store.addFavourite(fav('tine:skyr-naturell-old'));
    const aliases = [skyr.id, 'tine:skyr-naturell-old'];
    expect(store.isFavourite('product', aliases)).toBe(true);
    store.removeFavourites('product', aliases);
    expect(store.isFavourite('product', aliases)).toBe(false);
    expect(store.exportAll().favourites).toEqual([]);
  });

  it('removes by tombstone and can be favourited again', () => {
    store.addFavourite(fav(skyr.id));
    store.removeFavourites('product', [skyr.id]);
    store.addFavourite(fav(skyr.id));
    expect(store.isFavourite('product', [skyr.id])).toBe(true);
    expect(store.outboxBatch(10)).toHaveLength(2);
  });

  it('lists current products and custom foods, newest first, with one row per food', () => {
    const food = custom();
    store.saveCustomFood(food);
    store.addFavourite(fav(skyr.id));
    store.addFavourite(buildFavourite({ product_id: 'tine:skyr-naturell-old', custom_food_id: null }, new Date(yesterday.getTime() + 1)));
    store.addFavourite(buildFavourite({ product_id: null, custom_food_id: food.id }, new Date(yesterday.getTime() + 2)));
    const out = favouriteFoods(store, catalogue);
    expect(out.map((f) => (f.kind === 'product' ? f.product.id : f.food.id))).toEqual([food.id, skyr.id]);
  });

  it('leaves out a removed product and a deleted custom food, because neither can be logged', () => {
    const food = custom();
    store.saveCustomFood(food);
    store.tombstone('custom_foods', food.id);
    store.addFavourite(fav('tine:skyr-jordbaer'));
    store.addFavourite(buildFavourite({ product_id: null, custom_food_id: food.id }, yesterday));
    expect(favouriteFoods(store, catalogue)).toEqual([]);
  });

  it('still lists custom favourites before the product database is installed', () => {
    const food = custom();
    store.saveCustomFood(food);
    store.addFavourite(fav(skyr.id));
    store.addFavourite(buildFavourite({ product_id: null, custom_food_id: food.id }, yesterday));
    expect(favouriteFoods(store, null)).toHaveLength(1);
  });
});

describe('saved meals', () => {
  it('saves the meal and its items in order, with quantity, unit and grams, and queues them', () => {
    const a = logged(skyr, { quantity: 2, unit: 'serving' });
    const b = logged(skyr, { quantity: 80 });
    const id = savedMealOf([a, b], 'Morning');
    const [meal] = store.savedMeals();
    expect(meal).toMatchObject({ id, name: 'Morning' });
    expect(meal.items.map((i) => [i.sort_order, i.quantity, i.unit, i.grams])).toEqual([[0, 2, 'serving', 340], [1, 80, 'g', 80]]);
    expect(store.outboxBatch(10).filter((i) => i.table.startsWith('saved_meal'))).toHaveLength(3);
  });

  it('stores no nutrition on the saved meal', () => {
    savedMealOf([logged(skyr)]);
    expect(Object.keys(store.savedMeals()[0].items[0])).not.toContain('kcal');
  });

  it('deletes the meal and every item by tombstone', () => {
    const id = savedMealOf([logged(skyr), logged(skyr)]);
    store.deleteSavedMeal(id);
    expect(store.savedMeals()).toEqual([]);
    const out = store.exportAll();
    expect(out.saved_meals).toEqual([]);
    expect(out.saved_meal_items).toEqual([]);
  });

  it('hides a meal with no live items', () => {
    const id = savedMealOf([logged(skyr)]);
    store.tombstone('saved_meal_items', store.savedMeals()[0].items[0].id);
    expect(store.savedMeals()).toEqual([]);
    expect(id).toBeTruthy();
  });

  it('logs every item as a normal entry on today, in the chosen meal, queued for sync', () => {
    const id = savedMealOf([logged(skyr, { quantity: 2, unit: 'serving' }), logged(skyr, { quantity: 80 })]);
    expect(logSavedMeal(store, catalogue, id, 'lunch', now, 'UTC')).toBe(2);
    const rows = store.dayEntries(TODAY);
    expect(rows.map((r) => [r.quantity, r.unit, r.grams, r.meal])).toEqual([[2, 'serving', 340, 'lunch'], [80, 'g', 80, 'lunch']]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(store.outboxBatch(50).filter((i) => i.table === 'log_entries')).toHaveLength(4);
  });

  it('takes a fresh snapshot from the current product, keeping unknown as null', () => {
    const id = savedMealOf([logged(oldSkyr())]);
    logSavedMeal(store, catalogue, id, 'dinner', now, 'UTC');
    const [e] = store.dayEntries(TODAY);
    expect(e).toMatchObject({ kcal: 62, db_version: '2026.10.25', source: 'tine', verified: 1 });
    expect(e.fibre_g).toBeNull();
    expect(e.fibre_g_total).toBeNull();
    expect(e.kcal_total).toBeCloseTo(93);
  });

  it('follows a redirected id to the current product', () => {
    const entry = logged({ ...oldSkyr(), id: 'tine:skyr-naturell-old' });
    const id = savedMealOf([entry]);
    logSavedMeal(store, catalogue, id, 'dinner', now, 'UTC');
    expect(store.dayEntries(TODAY)[0]).toMatchObject({ product_id: 'tine:skyr-naturell', kcal: 62 });
  });

  it('uses the original snapshot when the product is gone', () => {
    const entry = logged({ ...oldSkyr(), id: 'tine:skyr-jordbaer', name: 'Skyr Jordbær' });
    const id = savedMealOf([entry]);
    logSavedMeal(store, catalogue, id, 'dinner', now, 'UTC');
    expect(store.dayEntries(TODAY)[0]).toMatchObject({ product_id: 'tine:skyr-jordbaer', name: 'Skyr Jordbær', kcal: 50, db_version: '2026.01.01', source: 'tine', verified: 1, fibre_g: null });
  });

  it('uses the original snapshot while the product database is not installed', () => {
    const id = savedMealOf([logged(oldSkyr())]);
    expect(logSavedMeal(store, null, id, 'snack', now, 'UTC')).toBe(1);
    expect(store.dayEntries(TODAY)[0]).toMatchObject({ kcal: 50, db_version: '2026.01.01' });
  });

  it('uses the snapshot of a deleted log entry when no live one is left', () => {
    const entry = logged({ ...oldSkyr(), id: 'tine:skyr-jordbaer' });
    const id = savedMealOf([entry]);
    store.tombstone('log_entries', entry.id);
    logSavedMeal(store, catalogue, id, 'snack', now, 'UTC');
    expect(store.dayEntries(TODAY)[0].kcal).toBe(50);
  });

  it('logs an item with no snapshot anywhere without numbers, never as 0', () => {
    // Saved on another phone: this device never held a log entry for the product.
    const neverLogged = buildLogEntry({ food: { kind: 'product', product: { ...skyr, id: 'tine:skyr-jordbaer', name: 'Skyr Jordbær' }, db_version: 'x' }, quantity: 150, unit: 'g', meal: 'lunch', at: yesterday, tz: 'UTC' });
    const { meal, items } = buildSavedMeal('Usual', [neverLogged], yesterday);
    store.saveSavedMeal(meal, items);
    logSavedMeal(store, catalogue, meal.id, 'snack', now, 'UTC');
    const [e] = store.dayEntries(TODAY);
    expect(e).toMatchObject({ product_id: 'tine:skyr-jordbaer', name: 'Skyr Jordbær', grams: 150, kcal: null, protein_g: null, kcal_total: null, source: 'unknown', verified: null, db_version: null, per_100_unit: 'g' });
  });

  describe('custom foods', () => {
    function savedCustom() {
      const food = custom();
      store.saveCustomFood(food);
      const entry = buildLogEntry({ food: { kind: 'custom', food: { ...food, kcal: 200 } }, quantity: 1, unit: 'serving', meal: 'lunch', at: yesterday, tz: 'UTC' });
      store.saveLogEntry(entry);
      return { food, id: savedMealOf([entry]) };
    }

    it('snapshots the current custom food', () => {
      const { food, id } = savedCustom();
      logSavedMeal(store, catalogue, id, 'lunch', now, 'UTC');
      expect(store.dayEntries(TODAY)[0]).toMatchObject({ custom_food_id: food.id, kcal: 250, source: 'custom', verified: null, grams: 40 });
    });

    it('falls back to the last snapshot when the custom food was deleted', () => {
      const { food, id } = savedCustom();
      store.tombstone('custom_foods', food.id);
      logSavedMeal(store, catalogue, id, 'dinner', now, 'UTC');
      expect(store.dayEntries(TODAY)[0]).toMatchObject({ custom_food_id: food.id, kcal: 200, source: 'custom' });
    });
  });

  it('refuses a meal that does not exist', () => {
    expect(() => logSavedMeal(store, catalogue, 'nope', 'snack', now, 'UTC')).toThrow(/saved meal/);
  });
});

describe('repeat yesterday', () => {
  it('copies only the chosen meals to today and keeps their meal', () => {
    logged(oldSkyr(), { meal: 'breakfast' });
    logged(oldSkyr(), { meal: 'lunch', quantity: 200 });
    expect(repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['lunch'] }, now, 'UTC')).toBe(1);
    const rows = store.dayEntries(TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ meal: 'lunch', quantity: 200, grams: 200, kcal: 62, local_date: TODAY, tz: 'UTC', eaten_at: now.toISOString() });
  });

  it('leaves yesterday and its snapshot unchanged', () => {
    const before = logged(oldSkyr());
    repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['breakfast'] }, now, 'UTC');
    expect(store.logEntry(before.id)).toMatchObject({ kcal: 50, local_date: YESTERDAY, updated_at: before.updated_at });
  });

  it('keeps quantity and the stored grams when the serving size changed or is gone', () => {
    const was: Product = { ...skyr, serving_g: 100 };
    logged(was, { quantity: 2, unit: 'serving' });
    repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['breakfast'] }, now, 'UTC');
    expect(store.dayEntries(TODAY)[0]).toMatchObject({ quantity: 2, unit: 'serving', grams: 200 });
  });

  it('keeps the order of the original entries', () => {
    logged(skyr, { quantity: 10, at: new Date(yesterday.getTime() + 2) });
    logged(skyr, { quantity: 20, at: new Date(yesterday.getTime() + 1) });
    logged(skyr, { quantity: 30, at: new Date(yesterday.getTime() + 3) });
    repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['breakfast'] }, now, 'UTC');
    expect(store.dayEntries(TODAY).map((e) => e.quantity)).toEqual([20, 10, 30]);
  });

  it('uses the original snapshot for a product that is gone', () => {
    logged({ ...oldSkyr(), id: 'tine:skyr-jordbaer' });
    repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['breakfast'] }, now, 'UTC');
    expect(store.dayEntries(TODAY)[0]).toMatchObject({ kcal: 50, db_version: '2026.01.01', fibre_g: null, fibre_g_total: null });
  });

  it('does not copy deleted entries', () => {
    const gone = logged(skyr);
    store.tombstone('log_entries', gone.id);
    expect(repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['breakfast'] }, now, 'UTC')).toBe(0);
  });

  it('adds nothing the second time, so a double tap cannot double the meal', () => {
    logged(skyr);
    logged(skyr, { quantity: 80 });
    expect(repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['breakfast'] }, now, 'UTC')).toBe(2);
    expect(repeatMeals(store, catalogue, { from: YESTERDAY, meals: ['breakfast'] }, now, 'UTC')).toBe(0);
    expect(store.dayEntries(TODAY)).toHaveLength(2);
  });
});

describe('notYetRepeated', () => {
  const row = (meal: Meal, product_id: string, quantity: number) => ({ meal, product_id, custom_food_id: null, quantity, unit: 'g' as const });

  it('counts duplicates: two of the same yesterday and one today leaves one', () => {
    const y = [row('lunch', 'a', 100), row('lunch', 'a', 100), row('lunch', 'b', 50)];
    expect(notYetRepeated(y, [row('lunch', 'a', 100)])).toEqual([row('lunch', 'a', 100), row('lunch', 'b', 50)]);
  });

  it('treats another meal or another amount as different', () => {
    const y = [row('lunch', 'a', 100)];
    expect(notYetRepeated(y, [row('dinner', 'a', 100)])).toEqual(y);
    expect(notYetRepeated(y, [row('lunch', 'a', 90)])).toEqual(y);
  });
});
