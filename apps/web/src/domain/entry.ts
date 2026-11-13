// Building the rows a user creates: log entries (with their nutrition snapshot, rule 3),
// custom foods, weights, and the anonymous miss for submit-miss. Shapes follow
// packages/contracts/log-schema.md v1 in the local SQLite encoding (flags are 0/1).
// Missing values stay null; nothing here ever turns unknown into 0 (rule 2).
import { canonicalEan } from '../data/barcode';
import type { Per100Unit, Product } from '../data/products';
import type { ActivityLevel, GoalType, Sex } from './goals';
import { resolveGrams, type AmountUnit } from './grams';
import { instantOn, stampLocalDay } from './localDate';
import { NUTRIENTS, type Nutrient } from './nutrients';
import { uuidv7 } from './uuid';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];

type NutrientColumns = Record<Nutrient, number | null>;

interface SyncFields {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LogEntryRow extends SyncFields, NutrientColumns {
  eaten_at: string;
  tz: string;
  local_date: string;
  meal: Meal;
  quantity: number;
  unit: AmountUnit;
  grams: number;
  product_id: string | null;
  custom_food_id: string | null;
  name: string;
  brand: string | null;
  source: string;
  ean: string | null;
  db_version: string | null;
  verified: 0 | 1 | null;
  per_100_unit: Per100Unit;
}

export interface CustomFoodRow extends SyncFields, NutrientColumns {
  name: string;
  brand: string | null;
  ean: string | null;
  serving_g: number | null;
  per_100_unit: Per100Unit;
}

export interface WeightEntryRow extends SyncFields {
  measured_at: string;
  tz: string;
  local_date: string;
  weight_kg: number;
  source: 'manual' | 'apple_health';
  external_id: string | null;
}

export interface GoalWriteRow extends SyncFields {
  effective_from: string;
  goal_type: GoalType;
  kcal_target: number;
  protein_g_target: number;
  carbs_g_target: number;
  fat_g_target: number;
  fibre_g_target: number;
  target_weight_kg: number | null;
  pace_kg_per_week: number;
  sex: Sex;
  birth_year: number;
  height_cm: number;
  activity_level: ActivityLevel;
  weight_kg: number;
}

type GoalInputColumn = 'pace_kg_per_week' | 'sex' | 'birth_year' | 'height_cm' | 'activity_level' | 'weight_kg';

/** A goal row as read back: a row from a phone may not hold the inputs (log-schema.md). */
export type StoredGoal = Omit<GoalWriteRow, GoalInputColumn> & { [K in GoalInputColumn]: GoalWriteRow[K] | null };

export type FoodRef =
  | { kind: 'product'; product: Product; db_version: string | null }
  | { kind: 'custom'; food: CustomFoodRow };

function syncFields(at: Date): SyncFields {
  const now = at.toISOString();
  return { id: uuidv7(at.getTime()), created_at: now, updated_at: now, deleted_at: null };
}

/** Units the portion screen offers for a food: its own unit first, then g, then serving when serving_g is known.
 * Only one serving button: piece would be the same serving_g again. Old entries logged in pieces still read as before. */
export function unitsFor(food: { per_100_unit: Per100Unit; serving_g: number | null }): AmountUnit[] {
  if (food.per_100_unit === 'portion') return ['portion'];
  const units: AmountUnit[] = food.per_100_unit === 'ml' ? ['ml', 'g'] : ['g'];
  if (food.serving_g !== null) units.push('serving');
  return units;
}

/** Food added to an earlier day has no real clock time, so it gets one that fits its meal. */
const MEAL_MINUTES: Record<Meal, number> = { breakfast: 480, lunch: 750, snack: 930, dinner: 1110 };

export function mealTimeOn(localDate: string, meal: Meal, tz: string): Date {
  return instantOn(localDate, MEAL_MINUTES[meal], tz);
}

export function buildLogEntry(input: {
  food: FoodRef;
  quantity: number;
  unit: AmountUnit;
  meal: Meal;
  at: Date;
  tz: string;
  /** When the row is written, if that differs from when it was eaten (adding to an earlier day). */
  saved_at?: Date;
}): LogEntryRow {
  if (!MEALS.includes(input.meal)) throw new Error(`unknown meal: ${input.meal}`);
  const f = input.food;
  const per = f.kind === 'product' ? f.product : f.food;
  const { grams } = resolveGrams({ quantity: input.quantity, unit: input.unit, serving_g: per.serving_g });
  if (grams === null) throw new Error('this food has no serving size; enter the amount in grams');
  const nutrients = {} as NutrientColumns;
  for (const n of NUTRIENTS) {
    const v = f.kind === 'product' ? f.product.nutrients[n] : f.food[n];
    nutrients[n] = v ?? null;
  }
  const day = stampLocalDay(input.at, input.tz);
  return {
    ...syncFields(input.saved_at ?? input.at),
    eaten_at: input.at.toISOString(),
    tz: day.tz,
    local_date: day.local_date,
    meal: input.meal,
    quantity: input.quantity,
    unit: input.unit,
    grams,
    product_id: f.kind === 'product' ? f.product.id : null,
    custom_food_id: f.kind === 'custom' ? f.food.id : null,
    name: per.name,
    brand: per.brand,
    source: f.kind === 'product' ? f.product.source : 'custom',
    ean: per.ean,
    db_version: f.kind === 'product' ? f.db_version : null,
    verified: f.kind === 'product' ? (f.product.verified ? 1 : 0) : null,
    per_100_unit: per.per_100_unit,
    ...nutrients,
  };
}

/** Which food a favourite or saved-meal item points at: exactly one of the two ids is set. */
export interface FoodKey {
  product_id: string | null;
  custom_food_id: string | null;
}

export interface FavouriteRow extends SyncFields, FoodKey {}

export interface SavedMealRow extends SyncFields {
  name: string;
}

export interface SavedMealItemRow extends SyncFields, FoodKey {
  saved_meal_id: string;
  sort_order: number;
  quantity: number;
  unit: AmountUnit;
  grams: number;
  name: string;
}

export type RepeatItem = FoodKey & Pick<LogEntryRow, 'quantity' | 'unit' | 'grams' | 'name'>;
export type EntrySnapshot = Pick<LogEntryRow, 'name' | 'brand' | 'source' | 'ean' | 'db_version' | 'verified' | 'per_100_unit' | Nutrient>;

export function buildFavourite(key: FoodKey, at: Date): FavouriteRow {
  if ((key.product_id === null) === (key.custom_food_id === null)) throw new Error('a favourite points at exactly one food');
  return { ...syncFields(at), product_id: key.product_id, custom_food_id: key.custom_food_id };
}

/** A saved meal from diary entries. It holds amounts only: logging it takes fresh numbers (log-schema.md). */
export function buildSavedMeal(name: string, entries: readonly RepeatItem[], at: Date): { meal: SavedMealRow; items: SavedMealItemRow[] } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('a saved meal needs a name');
  if (entries.length === 0) throw new Error('a saved meal needs at least one item');
  const meal = { ...syncFields(at), name: trimmed };
  const items = entries.map((e, sort_order) => ({
    ...syncFields(at),
    saved_meal_id: meal.id,
    sort_order,
    product_id: e.product_id,
    custom_food_id: e.custom_food_id,
    quantity: e.quantity,
    unit: e.unit,
    grams: e.grams,
    name: e.name,
  }));
  return { meal, items };
}

/**
 * A log entry repeating an earlier amount (a saved-meal item or yesterday's entry). The amount is
 * kept as stored, grams included. The numbers come from the current food; if it is gone, from the
 * last snapshot; with neither, they stay unknown (rules 2 and 3).
 */
export function buildRepeatedEntry(input: {
  item: RepeatItem;
  food: FoodRef | null;
  snapshot: EntrySnapshot | null;
  meal: Meal;
  at: Date;
  tz: string;
}): LogEntryRow {
  const { item, food, snapshot: snap, meal, at, tz } = input;
  if (food) {
    // Built on the weight, so a serving size the product no longer has cannot fail or change it.
    return { ...buildLogEntry({ food, quantity: item.grams, unit: 'g', meal, at, tz }), quantity: item.quantity, unit: item.unit };
  }
  if (!MEALS.includes(meal)) throw new Error(`unknown meal: ${meal}`);
  const nutrients = {} as NutrientColumns;
  for (const n of NUTRIENTS) nutrients[n] = snap?.[n] ?? null;
  const day = stampLocalDay(at, tz);
  return {
    ...syncFields(at),
    eaten_at: at.toISOString(),
    tz: day.tz,
    local_date: day.local_date,
    meal,
    quantity: item.quantity,
    unit: item.unit,
    grams: item.grams,
    product_id: item.product_id,
    custom_food_id: item.custom_food_id,
    name: snap?.name ?? item.name,
    brand: snap?.brand ?? null,
    source: snap?.source ?? 'unknown',
    ean: snap?.ean ?? null,
    db_version: snap?.db_version ?? null,
    verified: snap?.verified ?? null,
    per_100_unit: snap?.per_100_unit ?? (item.unit === 'ml' ? 'ml' : 'g'),
    ...nutrients,
  };
}

/** A typed number: empty means unknown (null). Accepts a decimal comma. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) throw new Error(`not a number: ${text}`);
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`not a number: ${text}`);
  return n;
}

/** An amount to log: a number above 0, or null when empty, 0 or not a number. */
export function parseQuantity(text: string): number | null {
  try {
    const n = parseAmount(text);
    return n !== null && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Per-100 values that cannot be true on a label (the product database leaves these rows out too). */
export function customFoodProblem(n: Partial<Record<Nutrient, number | null>>): string | null {
  const g = (k: Nutrient) => n[k] ?? null;
  if ((g('kcal') ?? 0) > 930) return 'Calories cannot be above 930 per 100. Check the label.';
  for (const k of ['protein_g', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'fibre_g', 'salt_g'] as const) {
    if ((g(k) ?? 0) > 100) return 'A value per 100 cannot be above 100 g. Check the label.';
  }
  if ((g('protein_g') ?? 0) + (g('carbs_g') ?? 0) + (g('fat_g') ?? 0) > 105) return 'Protein, carbs and fat together cannot be above 100 g per 100. Check the label.';
  if (g('sat_fat_g') !== null && g('fat_g') !== null && g('sat_fat_g')! > g('fat_g')!) return 'Saturated fat cannot be more than fat.';
  if (g('sugars_g') !== null && g('carbs_g') !== null && g('sugars_g')! > g('carbs_g')!) return 'Sugars cannot be more than carbs.';
  return null;
}

export interface CustomFoodForm {
  name: string;
  brand: string;
  ean: string;
  serving_g: string;
  per_100_unit: Per100Unit;
  nutrients: Partial<Record<Nutrient, string>>;
}

export function buildCustomFood(form: CustomFoodForm, at: Date): CustomFoodRow {
  const name = form.name.trim();
  if (!name) throw new Error('a custom food needs a name');
  const nutrients = {} as NutrientColumns;
  for (const n of NUTRIENTS) nutrients[n] = parseAmount(form.nutrients[n] ?? '');
  const problem = customFoodProblem(nutrients);
  if (problem) throw new Error(problem);
  const serving = parseAmount(form.serving_g);
  const ean = form.ean.trim() ? canonicalEan(form.ean) : null;
  if (form.ean.trim() && ean === null) throw new Error('That barcode is too long. A barcode has 8 to 14 digits.');
  return {
    ...syncFields(at),
    name,
    brand: form.brand.trim() || null,
    ean,
    serving_g: serving === 0 ? null : serving,
    per_100_unit: form.per_100_unit,
    ...nutrients,
  };
}

export type MissType = 'scan_not_found' | 'search_no_match';

/** The v1 submit-miss body (#57): eight `_g` nutrient keys plus per_100_unit, no user id. */
export function buildMissPayload(
  food: CustomFoodRow,
  ctx: { type: MissType; query_text: string | null; ean: string | null; db_version: string | null; app_version: string },
) {
  const per100 = {} as NutrientColumns;
  for (const n of NUTRIENTS) per100[n] = food[n];
  return {
    type: ctx.type,
    ean: ctx.ean ? canonicalEan(ctx.ean) : null,
    query_text: ctx.query_text?.trim() || null,
    language: 'nb',
    country: 'NO',
    db_version: ctx.db_version,
    product_id: null,
    app_version: ctx.app_version,
    custom_food: {
      name: food.name,
      brand: food.brand,
      per_100_unit: food.per_100_unit,
      serving_g: food.serving_g,
      per100,
    },
  };
}

export function buildGoal(input: {
  targets: Pick<GoalWriteRow, 'kcal_target' | 'protein_g_target' | 'carbs_g_target' | 'fat_g_target' | 'fibre_g_target'>;
  goal_type: GoalType;
  target_weight_kg: number | null;
  pace_kg_per_week: number;
  sex: Sex;
  birth_year: number;
  height_cm: number;
  activity_level: ActivityLevel;
  weight_kg: number;
  at: Date;
  tz: string;
}): GoalWriteRow {
  const { at, tz, targets, ...rest } = input;
  return { ...syncFields(at), effective_from: stampLocalDay(at, tz).local_date, ...targets, ...rest };
}

/** `at` is when it was measured; `now` (default `at`) is when the row is written, for a back-dated weight. */
export function buildWeightEntry(input: { weight_kg: number; at: Date; tz: string; now?: Date }): WeightEntryRow {
  if (!Number.isFinite(input.weight_kg) || input.weight_kg <= 0) throw new Error('weight must be above 0 kg');
  const day = stampLocalDay(input.at, input.tz);
  return {
    ...syncFields(input.now ?? input.at),
    measured_at: input.at.toISOString(),
    tz: day.tz,
    local_date: day.local_date,
    weight_kg: input.weight_kg,
    source: 'manual',
    external_id: null,
  };
}
