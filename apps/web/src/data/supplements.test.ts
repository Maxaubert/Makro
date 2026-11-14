import { beforeEach, describe, expect, it } from 'vitest';
import { buildDailySupplement, supplementEntry } from '../domain/supplements';
import { LogStore } from './logStore';
import { ensureSupplements, skipToday } from './supplements';
import { memoryDb } from './testing';
import type { CustomFoodRow } from '../domain/entry';

const TZ = 'Europe/Oslo';
const day1 = new Date('2026-11-14T07:00:00.000Z');
const day2 = new Date('2026-11-15T07:00:00.000Z');

const omega: CustomFoodRow = {
  id: '01930000-0000-7000-8000-000000000001', created_at: '2026-11-01T08:00:00.000Z', updated_at: '2026-11-01T08:00:00.000Z', deleted_at: null,
  name: 'Omega-3', brand: null, ean: null, serving_g: 1.2, per_100_unit: 'g',
  kcal: 750, protein_g: null, fat_g: 83, sat_fat_g: null, carbs_g: 0, sugars_g: null, fibre_g: null, salt_g: null,
};

let log: LogStore;
beforeEach(async () => {
  log = new LogStore(await memoryDb(), () => new Date());
  log.migrate();
  log.saveCustomFood(omega);
});

function addOmega(at = day1) {
  const food = { kind: 'custom', food: omega } as const;
  const s = buildDailySupplement({ food, quantity: 2, unit: 'serving', at, tz: TZ });
  log.addDailySupplement(s, supplementEntry({ supplement: s, food, snapshot: null, at, tz: TZ }));
  return s;
}

const live = (d: string) => log.dayEntries(d).filter((e) => e.meal === 'supplements');

describe('daily supplements in the store', () => {
  it('adding one logs today at once, as a supplements entry with its own numbers', () => {
    addOmega();
    const [e] = live('2026-11-14');
    expect(e).toMatchObject({ meal: 'supplements', quantity: 2, unit: 'serving', grams: 2.4, kcal: 750, protein_g: null });
    expect(e.daily_supplement_id).not.toBeNull();
  });
  it('the next day it is added once when the app opens, never twice', () => {
    addOmega();
    expect(ensureSupplements(log, null, day2, TZ)).toBe(1);
    expect(ensureSupplements(log, null, day2, TZ)).toBe(0);
    expect(live('2026-11-15')).toHaveLength(1);
  });
  it('days the app was not opened stay empty (no back-filling)', () => {
    addOmega();
    ensureSupplements(log, null, new Date('2026-11-17T07:00:00.000Z'), TZ);
    expect(live('2026-11-15')).toHaveLength(0);
    expect(live('2026-11-16')).toHaveLength(0);
    expect(live('2026-11-17')).toHaveLength(1);
  });
  it('skip today removes today only, and it is not added again today', () => {
    const s = addOmega();
    skipToday(log, null, s.id, day1, TZ);
    expect(live('2026-11-14')).toHaveLength(0);
    expect(ensureSupplements(log, null, day1, TZ)).toBe(0);
    expect(ensureSupplements(log, null, day2, TZ)).toBe(1);
  });
  it('skip before the day entry exists still holds', () => {
    const s = addOmega();
    skipToday(log, null, s.id, day2, TZ);
    expect(ensureSupplements(log, null, day2, TZ)).toBe(0);
    expect(live('2026-11-15')).toHaveLength(0);
  });
  it('undo skip brings today back', () => {
    const s = addOmega();
    skipToday(log, null, s.id, day1, TZ);
    log.unskipSupplementToday(s.id, '2026-11-14');
    expect(live('2026-11-14')).toHaveLength(1);
  });
  it('stop keeps today and earlier days, and nothing is added from tomorrow', () => {
    const s = addOmega();
    log.stopSupplement(s.id, '2026-11-14');
    expect(live('2026-11-14')).toHaveLength(1);
    expect(ensureSupplements(log, null, day2, TZ)).toBe(0);
  });
  it('a new amount counts from today on; earlier days keep theirs', () => {
    const s = addOmega();
    ensureSupplements(log, null, day2, TZ);
    log.updateSupplementAmount(s.id, 3, '2026-11-15');
    expect(live('2026-11-14')[0]).toMatchObject({ quantity: 2 });
    expect(live('2026-11-15')[0]).toMatchObject({ quantity: 3 });
    expect(log.dailySupplement(s.id)).toMatchObject({ quantity: 3 });
  });
  it('a supplement whose food is gone keeps the last snapshot', () => {
    addOmega();
    log.tombstone('custom_foods', omega.id);
    ensureSupplements(log, null, day2, TZ);
    expect(live('2026-11-15')[0]).toMatchObject({ name: 'Omega-3', kcal: 750 });
  });
  it('supplement rows and entries go out in the outbox', () => {
    addOmega();
    const tables = log.outboxBatch(100).map((i) => i.table);
    expect(tables).toContain('daily_supplements');
    expect(tables).toContain('log_entries');
  });
});
