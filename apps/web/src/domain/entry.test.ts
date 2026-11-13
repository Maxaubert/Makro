import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Product } from '../data/products';
import { handle } from '../../../../supabase/functions/submit-miss/handler';
import { validateMiss } from '../../../../supabase/functions/submit-miss/validate';
import { buildCustomFood, buildFavourite, buildLogEntry, buildMissPayload, buildRepeatedEntry, buildSavedMeal, buildWeightEntry, mealTimeOn, parseAmount, unitsFor } from './entry';

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

describe('adding food to an earlier day', () => {
  const food = { kind: 'product', product: skyr, db_version: '2026.10.25' } as const;
  const savedAt = new Date('2026-11-09T07:00:00.000Z');

  it('counts toward that day at a time that fits the meal', () => {
    const e = buildLogEntry({ food, quantity: 100, unit: 'g', meal: 'dinner', at: mealTimeOn('2026-11-08', 'dinner', 'Europe/Oslo'), tz: 'Europe/Oslo', saved_at: savedAt });
    expect(e).toMatchObject({ local_date: '2026-11-08', eaten_at: '2026-11-08T17:30:00.000Z', meal: 'dinner', kcal: 62 });
  });
  it('is stamped as saved now, so sync sees a new change', () => {
    const e = buildLogEntry({ food, quantity: 100, unit: 'g', meal: 'lunch', at: mealTimeOn('2026-11-08', 'lunch', 'UTC'), tz: 'UTC', saved_at: savedAt });
    expect(e.created_at).toBe('2026-11-09T07:00:00.000Z');
    expect(e.updated_at).toBe('2026-11-09T07:00:00.000Z');
  });
  it('keeps every meal time inside the day', () => {
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      expect(buildLogEntry({ food, quantity: 1, unit: 'g', meal, at: mealTimeOn('2026-03-29', meal, 'Europe/Oslo'), tz: 'Europe/Oslo' }).local_date).toBe('2026-03-29');
    }
  });
});

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

describe('buildRepeatedEntry', () => {
  const item = { product_id: skyr.id, custom_food_id: null, quantity: 2, unit: 'serving' as const, grams: 340, name: 'Skyr' };
  const food = { kind: 'product' as const, product: skyr, db_version: '2026.10.25' };

  it('takes the amount from the item and the numbers from the current product', () => {
    const e = buildRepeatedEntry({ item, food, snapshot: null, meal: 'lunch', at, tz: 'Europe/Oslo' });
    expect(e.id).toMatch(V7);
    expect(e).toMatchObject({ quantity: 2, unit: 'serving', grams: 340, name: 'Skyr Naturell', kcal: 62, fibre_g: null, meal: 'lunch', local_date: '2026-10-21', tz: 'Europe/Oslo', db_version: '2026.10.25' });
  });

  it('keeps the stored grams when the product lost its serving size', () => {
    const e = buildRepeatedEntry({ item, food: { ...food, product: { ...skyr, serving_g: null } }, snapshot: null, meal: 'lunch', at, tz: 'UTC' });
    expect(e).toMatchObject({ quantity: 2, unit: 'serving', grams: 340 });
  });

  it('copies the snapshot when there is no current food', () => {
    const old = buildLogEntry({ food, quantity: 1, unit: 'g', meal: 'snack', at, tz: 'UTC' });
    const e = buildRepeatedEntry({ item, food: null, snapshot: { ...old, kcal: 50, db_version: '2026.01.01' }, meal: 'dinner', at, tz: 'UTC' });
    expect(e).toMatchObject({ product_id: skyr.id, kcal: 50, db_version: '2026.01.01', source: 'tine', verified: 1, grams: 340, meal: 'dinner', fibre_g: null });
    expect(e.id).not.toBe(old.id);
  });

  it('writes unknown numbers, not zeros, when there is nothing to copy', () => {
    const e = buildRepeatedEntry({ item: { ...item, unit: 'ml', quantity: 200, grams: 200 }, food: null, snapshot: null, meal: 'dinner', at, tz: 'UTC' });
    expect(e).toMatchObject({ name: 'Skyr', source: 'unknown', verified: null, db_version: null, per_100_unit: 'ml', kcal: null, salt_g: null, brand: null, ean: null, grams: 200 });
  });
});

describe('buildSavedMeal', () => {
  const entry = buildLogEntry({ food: { kind: 'product', product: skyr, db_version: 'x' }, quantity: 2, unit: 'serving', meal: 'lunch', at, tz: 'UTC' });

  it('trims the name and links the items', () => {
    const { meal, items } = buildSavedMeal('  Lunsj ', [entry], at);
    expect(meal.id).toMatch(V7);
    expect(meal.name).toBe('Lunsj');
    expect(items[0]).toMatchObject({ saved_meal_id: meal.id, sort_order: 0, product_id: skyr.id, custom_food_id: null, quantity: 2, unit: 'serving', grams: 340, name: 'Skyr Naturell', deleted_at: null });
    expect(items[0].id).toMatch(V7);
  });

  it('needs a name and at least one item', () => {
    expect(() => buildSavedMeal(' ', [entry], at)).toThrow(/name/);
    expect(() => buildSavedMeal('Lunsj', [], at)).toThrow(/item/);
  });
});

describe('buildFavourite', () => {
  it('points at exactly one food', () => {
    const f = buildFavourite({ product_id: skyr.id, custom_food_id: null }, at);
    expect(f).toMatchObject({ product_id: skyr.id, custom_food_id: null, deleted_at: null, created_at: at.toISOString() });
    expect(() => buildFavourite({ product_id: null, custom_food_id: null }, at)).toThrow();
    expect(() => buildFavourite({ product_id: 'a', custom_food_id: 'b' }, at)).toThrow();
  });
});

describe('unitsFor', () => {
  it('offers g, ml only for a drink, and piece/serving only with serving_g', () => {
    // One button for the serving size: 'piece' used the same serving_g, so it was the same amount twice (Max, 2026-11-14).
    expect(unitsFor(skyr)).toEqual(['g', 'serving']);
    expect(unitsFor({ ...skyr, per_100_unit: 'ml', serving_g: null })).toEqual(['ml', 'g']);
    // A food stored per portion (decision 42) is logged in portions only, never in grams.
    expect(unitsFor({ ...skyr, per_100_unit: 'portion', serving_g: null })).toEqual(['portion']);
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

describe('the supabase-js call flushMisses makes, against the submit-miss handler', () => {
  const ORIGIN = 'https://makro-steel.vercel.app';
  const f = buildCustomFood({ name: 'Skyr Mango', brand: '', ean: '', serving_g: '', per_100_unit: 'g', nutrients: { kcal: '74' } }, at);
  const miss = { id: crypto.randomUUID(), ...buildMissPayload(f, { type: 'search_no_match', query_text: 'skyr mango', ean: null, db_version: null, app_version: 'web-0.1.0' }) };

  function client(onRow: (row: unknown) => void, overrideFetch?: typeof fetch) {
    const deps = { rateCheck: async () => true, insert: async (row: unknown) => (onRow(row), true) };
    // What a browser does: preflight the POST, then refuse it unless every request header is allowed.
    const browserFetch: typeof fetch = async (input, init) => {
      const post = new Request(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), origin: ORIGIN } });
      const pre = await handle(new Request(post.url, { method: 'OPTIONS', headers: { origin: ORIGIN } }), deps);
      const allowed = (pre.headers.get('access-control-allow-headers') ?? '').split(',').map((h) => h.trim());
      const blocked = [...post.headers.keys()].filter((h) => h !== 'origin' && !allowed.includes(h));
      if (pre.headers.get('access-control-allow-origin') !== ORIGIN || blocked.length > 0) throw new TypeError(`CORS blocked: ${blocked.join()}`);
      return handle(post, deps);
    };
    return createClient('https://x.supabase.test', 'anon-key', { auth: { persistSession: false }, global: { fetch: overrideFetch ?? browserFetch } });
  }

  it('passes the preflight and stores the miss with its id and nutrients', async () => {
    const rows: unknown[] = [];
    const { data, error } = await client((r) => rows.push(r)).functions.invoke('submit-miss', { body: miss });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: miss.id, type: 'search_no_match', query_text: 'skyr mango', language: 'nb', country: 'NO', custom_food: { name: 'Skyr Mango', per_100_unit: 'g' } });
    expect((rows[0] as { custom_food: { per100: Record<string, number | null> } }).custom_food.per100).toMatchObject({ kcal: 74, fibre_g: null });
  });

  it('gives flushMisses a status for a refused miss, and none for a network failure (which stays queued)', async () => {
    const refused = await client(() => {}).functions.invoke('submit-miss', { body: { type: 'nope' } });
    expect((refused.error as { context?: { status?: number } }).context?.status).toBe(400);
    const offline = await client(() => {}, async () => {
      throw new TypeError('Failed to fetch');
    }).functions.invoke('submit-miss', { body: miss });
    expect(offline.error).not.toBeNull();
    expect((offline.error as { context?: { status?: number } }).context?.status).toBeUndefined();
  });
});

describe('buildWeightEntry', () => {
  it('dates a back-dated weight by when it was measured but stamps the row with now', () => {
    const now = new Date('2026-10-20T09:00:00.000Z');
    const measured = new Date('2026-10-17T06:30:00.000Z');
    const w = buildWeightEntry({ weight_kg: 81.5, at: measured, tz: 'Europe/Oslo', now });
    expect(w.measured_at).toBe(measured.toISOString());
    expect(w.local_date).toBe('2026-10-17');
    expect(w.created_at).toBe(now.toISOString());
    expect(w.updated_at).toBe(now.toISOString());
  });

  it('stamps tz and local_date and marks the source manual', () => {
    const w = buildWeightEntry({ weight_kg: 81.5, at, tz: 'Europe/Oslo' });
    expect(w).toMatchObject({ weight_kg: 81.5, local_date: '2026-10-21', tz: 'Europe/Oslo', source: 'manual', external_id: null, measured_at: '2026-10-20T23:30:00.000Z' });
  });
  it('refuses a weight that is not positive', () => {
    expect(() => buildWeightEntry({ weight_kg: 0, at, tz: 'UTC' })).toThrow();
  });
});
