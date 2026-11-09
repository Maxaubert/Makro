// Builds the daily suggestions (domain/guidance.ts) from the two databases, in the worker.
// A food from history keeps the numbers of its newest log entry (the snapshot, rule 3); a
// verified product is worked out by the shared portion maths. Both show their source (rule 4).
import { suggestFoods, type HistoryCandidate, type RemainingKey, type Suggested, type VerifiedCandidate } from '../domain/guidance';
import { portion } from '../domain/portion';
import type { LogStore } from './logStore';
import { verifiedProducts, type Product } from './products';
import type { Sql } from './sql';

/** How much of the product file is ranked for a suggestion. */
const VERIFIED_LIMIT = 5000;
const HISTORY_LIMIT = 200;

/** A portion with no serving size is shown as 100 g or ml, the portion screen's own default. */
const DEFAULT_PORTION = 100;

export interface FoodShown {
  kind: 'product' | 'custom';
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  grams: number;
  source_name: string;
  verified: boolean | null;
}

export type FoodSuggestion = Suggested<(HistoryCandidate | VerifiedCandidate) & FoodShown>;

export function verifiedCandidate(p: Product): VerifiedCandidate & FoodShown {
  const grams = p.serving_g ?? DEFAULT_PORTION;
  const values = portion(p.nutrients, grams);
  return {
    id: p.id,
    kind: 'product',
    name: p.name,
    brand: p.brand,
    quantity: grams,
    unit: p.per_100_unit,
    grams,
    source_name: p.source_name,
    verified: p.verified,
    kcal: values.kcal,
    protein_g: values.protein_g,
    carbs_g: values.carbs_g,
    fat_g: values.fat_g,
  };
}

export function loadSuggestions(
  log: Pick<LogStore, 'foodHistory'>,
  products: Sql | null,
  left: Record<RemainingKey, number | null>,
): FoodSuggestion[] {
  const names = new Map((products?.all<{ slug: string; display_name: string }>('select slug, display_name from sources') ?? []).map((s) => [s.slug, s.display_name]));
  const history = log.foodHistory(HISTORY_LIMIT).map((f): HistoryCandidate & FoodShown => ({
    id: f.product_id ?? (f.custom_food_id as string),
    kind: f.product_id ? 'product' : 'custom',
    name: f.name,
    brand: f.brand,
    quantity: f.quantity,
    unit: f.unit,
    grams: f.grams,
    source_name: f.product_id ? (names.get(f.source) ?? f.source) : 'Your own food',
    verified: f.verified === null ? null : f.verified === 1,
    kcal: f.kcal_total,
    protein_g: f.protein_g_total,
    carbs_g: f.carbs_g_total,
    fat_g: f.fat_g_total,
    uses: f.uses,
    last_eaten_at: f.last_eaten_at,
  }));
  const verified = products ? verifiedProducts(products, VERIFIED_LIMIT).map(verifiedCandidate) : [];
  return suggestFoods(left, history, verified);
}
