import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import { validateMiss } from '../../../../supabase/functions/submit-miss/validate';
import { buildCustomFood, buildLogEntry, buildMissPayload, buildWeightEntry, parseAmount, unitsFor } from './entry';

const skyr: Product = {
  id: 'tine:skyr-naturell',
  name: 'Skyr Naturell',
  brand: 'Tine',
  pack_size: '450 g',
  ean: '7038010012345',
  serving_g: 170,
  per_100_unit: 'g',
  source: 'tine',
  source_name: 'Tine',
  source_kind: 'brand',
  verified: true,
  data_quality: [],
  nutrients: { kcal: 62, protein_g: 11, fat_g: 0.2, sat_fat_g: 0.1, carbs_g: 4, sugars_g: 4, fibre_g: null, salt_g: 0.1 },
};
const at = new Date('2026-10-20T23:30:00.000Z');
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('buildLogEntry', () => {
  it('snapshots the product, resolves grams and stamps the local day', () => {
    const e = buildLogEntry({ food: { kind: 'product', product: skyr, db_version: '2026.10.25' }, quantity: 150, unit: 'g', meal: 'breakfast', at, tz: 'Europe/Oslo' });
    expect(e.id).toMatch(V7);
    expect(e).toMatchObject({
      eaten_at: '2026-10-20T23:30:00.000Z',
      created_at: '2026-10-20T23:30:00.000Z',
      updated_at: '2026-10-20T23:30:00.000Z',
      deleted_at: null,
      tz: 'Europe/Oslo',
      local_date: '2026-10-21',
      meal: 'breakfast',
      quantity: 150,
      unit: 'g',
      grams: 150,
      product_id: 'tine:skyr-naturell',
      custom_food_id: null,
      name: 'Skyr Naturell',
      brand: 'Tine',
      source: 'tine',
      ean: '7038010012345',
      db_version: '2026.10.25',
      verified: 1,
      per_100_unit: 'g',
      kcal: 62,
      protein_g: 11,
    });
  });

  it('keeps an unknown nutrient null, never 0', () => {
    const e = buildLogEntry({ food: { kind: 'product', product: skyr, db_version: '2026.10.25' }, quantity: 150, unit: 'g', meal: 'lunch', at, tz: 'UTC' });
    expect(e.fibre_g).toBeNull();
  });

  it('resolves a serving through serving_g', () => {
    const e = buildLogEntry({ food: { kind: 'product', product: skyr, db_version: 'x' }, quantity: 2, unit: 'serving', meal: 'snack', at, tz: 'UTC' });
    expect(e.grams).toBe(340);
  });

  it('refuses a piece when serving_g is unknown instead of guessing', () => {
    const p = { ...skyr, serving_g: null };
    expect(() => buildLogEntry({ food: { kind: 'product', product: p, db_version: 'x' }, quantity: 1, unit: 'piece', meal: 'snack', at, tz: 'UTC' })).toThrow(/serving/);
  });

  it('snapshots a custom food with source custom and verified null', () => {
    const food = buildCustomFood({ name: 'Mormors brød', brand: '', ean: '', serving_g: '', per_100_unit: 'g', nutrients: { kcal: '250' } }, at);
    const e = buildLogEntry({ food: { kind: 'custom', food }, quantity: 80, unit: 'g', meal: 'dinner', at, tz: 'UTC' });
    expect(e).toMatchObject({ product_id: null, custom_food_id: food.id, source: 'custom', verified: null, db_version: null, kcal: 250, protein_g: null });
  });

  it('rejects an unknown meal', () => {
    expect(() => buildLogEntry({ food: { kind: 'product', product: skyr, db_version: 'x' }, quantity: 1, unit: 'g', meal: 'brunch' as never, at, tz: 'UTC' })).toThrow();
  });
});

describe('unitsFor', () => {
  it('offers g, ml only for a drink, and piece/serving only with serving_g', () => {
    expect(unitsFor(skyr)).toEqual(['g', 'serving', 'piece']);
    expect(unitsFor({ ...skyr, per_100_unit: 'ml', serving_g: null })).toEqual(['ml', 'g']);
  });
});

describe('parseAmount', () => {
  it('reads a Norwegian decimal comma and treats empty as unknown', () => {
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount(' 7 ')).toBe(7);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBe(0);
  });
  it('rejects text and negatives', () => {
    expect(() => parseAmount('abc')).toThrow();
    expect(() => parseAmount('-1')).toThrow();
  });
});

describe('buildCustomFood', () => {
  it('keeps empty fields as null (unknown) and parses the rest', () => {
    const f = buildCustomFood({ name: ' Skyr Mango ', brand: 'Q', ean: '7039010019999', serving_g: '170', per_100_unit: 'g', nutrients: { kcal: '74', protein_g: '10,2', fat_g: '' } }, at);
    expect(f.id).toMatch(V7);
    expect(f).toMatchObject({ name: 'Skyr Mango', brand: 'Q', ean: '7039010019999', serving_g: 170, per_100_unit: 'g', kcal: 74, protein_g: 10.2, fat_g: null, carbs_g: null, salt_g: null });
  });
  it('needs a name', () => {
    expect(() => buildCustomFood({ name: ' ', brand: '', ean: '', serving_g: '', per_100_unit: 'g', nutrients: {} }, at)).toThrow(/name/);
  });
});

describe('buildMissPayload (submit-miss v1, log-schema.md Miss payload)', () => {
  it('sends the eight _g keys plus per_100_unit, with null for unknown', () => {
    const f = buildCustomFood({ name: 'Skyr Mango', brand: 'Q', ean: '', serving_g: '', per_100_unit: 'ml', nutrients: { kcal: '74' } }, at);
    const p = buildMissPayload(f, { type: 'search_no_match', query_text: 'skyr mango', ean: null, db_version: '2026.10.25', app_version: 'web-0.1.0' });
    expect(p).toEqual({
      type: 'search_no_match',
      ean: null,
      query_text: 'skyr mango',
      language: 'nb',
      country: 'NO',
      db_version: '2026.10.25',
      product_id: null,
      app_version: 'web-0.1.0',
      custom_food: {
        name: 'Skyr Mango',
        brand: 'Q',
        per_100_unit: 'ml',
        serving_g: null,
        per100: { kcal: 74, protein_g: null, fat_g: null, sat_fat_g: null, carbs_g: null, sugars_g: null, fibre_g: null, salt_g: null },
      },
    });
  });
  it('sends a scanned code in canonical form', () => {
    const f = buildCustomFood({ name: 'X', brand: '', ean: '', serving_g: '', per_100_unit: 'g', nutrients: {} }, at);
    expect(buildMissPayload(f, { type: 'scan_not_found', query_text: null, ean: '0 7038010012345', db_version: null, app_version: 'w' }).ean).toBe('7038010012345');
  });

  it('is accepted by the submit-miss validator in this repo with every nutrient kept', () => {
    // The app and submit-miss must change together (log-schema.md): an old validator would drop
    // the _g keys silently and the miss would be stored with kcal only.
    const f = buildCustomFood(
      { name: 'Brød', brand: 'B', ean: '', serving_g: '40', per_100_unit: 'g', nutrients: { kcal: '250', protein_g: '9', fat_g: '3', carbs_g: '45', fibre_g: '6', sat_fat_g: '0.5', sugars_g: '2', salt_g: '1.1' } },
      at,
    );
    const body = { id: crypto.randomUUID(), ...buildMissPayload(f, { type: 'scan_not_found', query_text: null, ean: '7038010012345', db_version: '2026.10.25', app_version: 'web-0.1.0' }) };
    const r = validateMiss(body);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect((r.row.custom_food as { per100: Record<string, number | null> }).per100).toEqual({
      kcal: 250, protein_g: 9, fat_g: 3, sat_fat_g: 0.5, carbs_g: 45, sugars_g: 2, fibre_g: 6, salt_g: 1.1,
    });
  });
});

describe('buildWeightEntry', () => {
  it('stamps tz and local_date and marks the source manual', () => {
    const w = buildWeightEntry({ weight_kg: 81.5, at, tz: 'Europe/Oslo' });
    expect(w).toMatchObject({ weight_kg: 81.5, local_date: '2026-10-21', tz: 'Europe/Oslo', source: 'manual', external_id: null, measured_at: '2026-10-20T23:30:00.000Z' });
  });
  it('refuses a weight that is not positive', () => {
    expect(() => buildWeightEntry({ weight_kg: 0, at, tz: 'UTC' })).toThrow();
  });
});
