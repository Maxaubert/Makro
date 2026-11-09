import { beforeEach, describe, expect, it } from 'vitest';
import { buildCustomFood, buildLogEntry, type CustomFoodRow, type LogEntryRow, type Meal } from '../domain/entry';
import { LogStore } from './logStore';
import type { Product } from './products';
import type { Sql } from './sql';
import { verifiedProducts } from './products';
import { loadSuggestions, verifiedCandidate } from './suggestions';
import { fixtureProducts, memoryDb } from './testing';

const skyr: Product = {
  id: 'tine:skyr-naturell', name: 'Skyr Naturell', brand: 'Tine', pack_size: '450 g', ean: '7038010012345',
  serving_g: 170, per_100_unit: 'g', source: 'tine', source_name: 'Tine', source_kind: 'brand', verified: true,
  data_quality: [],
  nutrients: { kcal: 62, protein_g: 11, fat_g: 0.2, sat_fat_g: 0.1, carbs_g: 4, sugars_g: 4, fibre_g: null, salt_g: 0.1 },
};
const food: CustomFoodRow = buildCustomFood(
  { name: 'Morning bowl', brand: '', ean: '', serving_g: '', per_100_unit: 'g', nutrients: { kcal: '100', protein_g: '5', carbs_g: '10', fat_g: '2' } },
  new Date('2026-10-01T08:00:00.000Z'),
);
const at = (d: string) => new Date(`2026-10-${d}T08:00:00.000Z`);
const product = (quantity: number, d: string, meal: Meal = 'breakfast'): LogEntryRow =>
  buildLogEntry({ food: { kind: 'product', product: skyr, db_version: '2026.10.25' }, quantity, unit: 'g', meal, at: at(d), tz: 'UTC' });
const left = { kcal: 2000, protein_g: 200, carbs_g: 200, fat_g: 100 };

let log: LogStore;
let products: Sql;
beforeEach(async () => {
  log = new LogStore(await memoryDb());
  log.migrate();
  products = await fixtureProducts();
});

describe('LogStore.entriesBetween', () => {
  it('returns live entries of the range, both ends included', () => {
    log.saveLogEntry(product(100, '11'));
    log.saveLogEntry(product(100, '12'));
    log.saveLogEntry(product(100, '14'));
    log.saveLogEntry(product(100, '15'));
    const gone = product(100, '13');
    log.saveLogEntry(gone);
    log.tombstone('log_entries', gone.id);
    expect(log.entriesBetween('2026-10-12', '2026-10-14').map((e) => e.local_date)).toEqual(['2026-10-12', '2026-10-14']);
  });
});

describe('LogStore.foodHistory', () => {
  it('gives each food once, with the newest portion and how often it was logged', () => {
    log.saveLogEntry(product(100, '10'));
    log.saveLogEntry(product(170, '12'));
    log.saveLogEntry(product(50, '11'));
    expect(log.foodHistory(10)).toMatchObject([
      { product_id: skyr.id, name: 'Skyr Naturell', uses: 3, quantity: 170, unit: 'g', grams: 170, source: 'tine', verified: 1, last_eaten_at: at('12').toISOString() },
    ]);
  });
  it('keeps custom foods apart and leaves deleted entries out', () => {
    log.saveCustomFood(food);
    log.saveLogEntry(buildLogEntry({ food: { kind: 'custom', food }, quantity: 150, unit: 'g', meal: 'lunch', at: at('12'), tz: 'UTC' }));
    const gone = product(100, '13');
    log.saveLogEntry(gone);
    log.tombstone('log_entries', gone.id);
    expect(log.foodHistory(10).map((f) => f.custom_food_id)).toEqual([food.id]);
  });
});

describe('verifiedProducts', () => {
  it('reads only verified products with a known kcal, best protein first', () => {
    expect(verifiedProducts(products, 100).map((p) => p.id)).toEqual(['tine:skyr-naturell', 'tine:skyr-vanilje', 'tine:lettmelk', 'matvaretabellen:06.531']);
  });
});

describe('loadSuggestions', () => {
  it('puts your own food first, then verified products in their serving size', () => {
    log.saveCustomFood(food);
    log.saveLogEntry(buildLogEntry({ food: { kind: 'custom', food }, quantity: 150, unit: 'g', meal: 'lunch', at: at('12'), tz: 'UTC' }));
    const s = loadSuggestions(log, products, left);
    expect(s.map((x) => x.id)).toEqual([food.id, 'tine:skyr-naturell', 'tine:skyr-vanilje']);
    expect(s[0]).toMatchObject({ tier: 'history', kind: 'custom', name: 'Morning bowl', quantity: 150, unit: 'g', grams: 150, kcal: 150, protein_g: 7.5, source_name: 'Your own food', verified: null });
    expect(s[1]).toMatchObject({ tier: 'verified', kind: 'product', name: 'Skyr Naturell', quantity: 170, unit: 'g', grams: 170, source_name: 'Tine', verified: true });
    expect(s[1].kcal).toBeCloseTo(105.4, 9);
    expect(s[1].protein_g).toBeCloseTo(18.7, 9);
  });

  it('leaves out verified servings that do not fit, and keeps ml for drinks', () => {
    const s = loadSuggestions(log, products, { kcal: 100, protein_g: 200, carbs_g: 200, fat_g: 100 });
    // Skyr at 170 g is 105.4 kcal and Banan at 118 g is 105 kcal: too much. Lettmelk at 250 ml is 92.5 kcal.
    expect(s.map((x) => x.id)).toEqual(['tine:lettmelk']);
    expect(s[0]).toMatchObject({ quantity: 250, unit: 'ml', grams: 250 });
  });

  it('uses 100 g when a verified product has no serving size', () => {
    expect(verifiedCandidate({ ...skyr, serving_g: null })).toMatchObject({ quantity: 100, unit: 'g', grams: 100, kcal: 62, protein_g: 11 });
  });

  it('works from history alone while the product file is not installed', () => {
    log.saveLogEntry(product(170, '12'));
    expect(loadSuggestions(log, null, left).map((x) => x.id)).toEqual([skyr.id]);
  });

  it('shows the log entry numbers, which stay unknown when the entry had none', () => {
    log.saveLogEntry(buildLogEntry({ food: { kind: 'product', product: { ...skyr, nutrients: { ...skyr.nutrients, protein_g: null } }, db_version: 'x' }, quantity: 100, unit: 'g', meal: 'lunch', at: at('12'), tz: 'UTC' }));
    expect(loadSuggestions(log, null, left)[0].protein_g).toBeNull();
  });
});
