// Building the rows a user creates: log entries (with their nutrition snapshot, rule 3),
// custom foods, weights, and the anonymous miss for submit-miss. Shapes follow
// packages/contracts/log-schema.md v1 in the local SQLite encoding (flags are 0/1).
// Missing values stay null; nothing here ever turns unknown into 0 (rule 2).
import { canonicalEan } from '../data/barcode';
import type { Per100Unit, Product } from '../data/products';
import type { ActivityLevel, GoalType, Sex } from './goals';
import { resolveGrams, type AmountUnit } from './grams';
import { stampLocalDay } from './localDate';
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

export type FoodRef =
  | { kind: 'product'; product: Product; db_version: string | null }
  | { kind: 'custom'; food: CustomFoodRow };

function syncFields(at: Date): SyncFields {
  const now = at.toISOString();
  return { id: uuidv7(at.getTime()), created_at: now, updated_at: now, deleted_at: null };
}

/** Units the portion screen offers for a food: its own unit first, then g, then serving/piece when serving_g is known. */
export function unitsFor(food: { per_100_unit: Per100Unit; serving_g: number | null }): AmountUnit[] {
  const units: AmountUnit[] = food.per_100_unit === 'ml' ? ['ml', 'g'] : ['g'];
  if (food.serving_g !== null) units.push('serving', 'piece');
  return units;
}

export function buildLogEntry(input: {
  food: FoodRef;
  quantity: number;
  unit: AmountUnit;
  meal: Meal;
  at: Date;
  tz: string;
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
    ...syncFields(input.at),
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

/** A typed number: empty means unknown (null). Accepts a decimal comma. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) throw new Error(`not a number: ${text}`);
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`not a number: ${text}`);
  return n;
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
  const serving = parseAmount(form.serving_g);
  return {
    ...syncFields(at),
    name,
    brand: form.brand.trim() || null,
    ean: form.ean.trim() ? canonicalEan(form.ean) : null,
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
