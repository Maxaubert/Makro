import { describe, expect, it } from 'vitest';
import { loadGolden } from './golden';
import { buildDailySupplement, dueToday, nextDay, supplementEntry } from './supplements';
import type { Product } from '../data/products';

interface Input {
  today: string;
  supplements: { id: string; start_date: string; stopped_on: string | null; deleted: boolean }[];
  entries_today: { daily_supplement_id: string; deleted: boolean }[];
}

const golden = loadGolden<Input, { due: string[] }>('guidance/daily_supplements.json');

describe('guidance/daily_supplements.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const supps = c.input.supplements.map((s) => ({ ...s, deleted_at: s.deleted ? '2026-11-14T08:00:00.000Z' : null }));
    const entries = c.input.entries_today.map((e) => ({ ...e, deleted_at: e.deleted ? '2026-11-14T08:00:00.000Z' : null }));
    expect(dueToday(supps, entries, c.input.today).map((s) => s.id)).toEqual(c.expected.due);
  });
});

const creatine: Product = {
  id: 'apex-no:creatine', name: 'Creatine Monohydrate', brand: 'Apex', pack_size: '500 g', ean: null, serving_g: 5,
  per_100_unit: 'g', source: 'apex-no', source_name: 'Apex', source_kind: 'shop', verified: false, data_quality: [],
  nutrients: { kcal: null, protein_g: null, fat_g: null, sat_fat_g: null, carbs_g: null, sugars_g: null, fibre_g: null, salt_g: null },
};
const at = new Date('2026-11-14T07:30:00.000Z');

describe('daily supplements', () => {
  it('a supplement starts today and keeps the amount', () => {
    const s = buildDailySupplement({ food: { kind: 'product', product: creatine, db_version: '2026.11.19' }, quantity: 5, unit: 'g', at, tz: 'Europe/Oslo' });
    expect(s).toMatchObject({ product_id: 'apex-no:creatine', custom_food_id: null, name: 'Creatine Monohydrate', quantity: 5, unit: 'g', grams: 5, start_date: '2026-11-14', stopped_on: null });
  });
  it('the day entry is a supplements entry with its own snapshot; unknown stays unknown', () => {
    const s = buildDailySupplement({ food: { kind: 'product', product: creatine, db_version: '2026.11.19' }, quantity: 5, unit: 'g', at, tz: 'Europe/Oslo' });
    const e = supplementEntry({ supplement: s, food: { kind: 'product', product: creatine, db_version: '2026.11.19' }, snapshot: null, at, tz: 'Europe/Oslo' });
    expect(e).toMatchObject({ meal: 'supplements', daily_supplement_id: s.id, local_date: '2026-11-14', quantity: 5, grams: 5, kcal: null, protein_g: null });
  });
  it('a food that is gone keeps the last snapshot', () => {
    const s = buildDailySupplement({ food: { kind: 'product', product: creatine, db_version: '2026.11.19' }, quantity: 5, unit: 'g', at, tz: 'Europe/Oslo' });
    const e = supplementEntry({ supplement: s, food: null, snapshot: { name: 'Creatine', brand: 'Apex', source: 'apex-no', ean: null, db_version: '2026.11.18', verified: 0, per_100_unit: 'g', kcal: 0, protein_g: null, fat_g: null, sat_fat_g: null, carbs_g: null, sugars_g: null, fibre_g: null, salt_g: null }, at, tz: 'Europe/Oslo' });
    expect(e).toMatchObject({ meal: 'supplements', name: 'Creatine', kcal: 0, protein_g: null });
  });
  it('stop from tomorrow: the next local day', () => {
    expect(nextDay('2026-11-14')).toBe('2026-11-15');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });
});
