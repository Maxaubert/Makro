import { beforeEach, describe, expect, it } from 'vitest';
import { buildCustomFood, buildLogEntry, buildWeightEntry, type LogEntryRow } from '../domain/entry';
import type { Product } from './products';
import { LogStore } from './logStore';
import { memoryDb } from './testing';

const skyr: Product = {
  id: 'tine:skyr-naturell', name: 'Skyr Naturell', brand: 'Tine', pack_size: '450 g', ean: '7038010012345',
  serving_g: 170, per_100_unit: 'g', source: 'tine', source_name: 'Tine', source_kind: 'brand', verified: true,
  data_quality: [],
  nutrients: { kcal: 62, protein_g: 11, fat_g: 0.2, sat_fat_g: 0.1, carbs_g: 4, sugars_g: 4, fibre_g: null, salt_g: 0.1 },
};
const t0 = new Date('2026-10-20T08:00:00.000Z');
const entry = (quantity = 150, at = t0): LogEntryRow =>
  buildLogEntry({ food: { kind: 'product', product: skyr, db_version: '2026.10.25' }, quantity, unit: 'g', meal: 'breakfast', at, tz: 'UTC' });

let now: Date;
let store: LogStore;
beforeEach(async () => {
  now = new Date('2026-10-20T09:00:00.000Z');
  store = new LogStore(await memoryDb(), () => now);
  store.migrate();
});

describe('local schema', () => {
  it('has the seven synced tables, the outbox and user_version 1', () => {
    expect(store.schemaVersion()).toBe(1);
    for (const t of ['log_entries', 'custom_foods', 'saved_meals', 'saved_meal_items', 'favourites', 'goals', 'weight_entries', 'outbox']) {
      expect(store.hasTable(t), t).toBe(true);
    }
  });
  it('migrates twice without harm', () => {
    store.migrate();
    expect(store.schemaVersion()).toBe(1);
  });
});

describe('saving writes locally first and queues the change', () => {
  it('stores the entry with generated totals and puts it in the outbox', () => {
    const e = entry();
    store.saveLogEntry(e);
    const [row] = store.dayEntries('2026-10-20');
    expect(row.id).toBe(e.id);
    expect(row.kcal_total).toBeCloseTo(93);
    expect(row.fibre_g_total).toBeNull();
    expect(store.pendingCount()).toBe(1);
  });

  it('keeps one outbox item per row however often it changes', () => {
    const e = entry();
    store.saveLogEntry(e);
    store.updateLogEntry(e.id, { quantity: 200 });
    store.updateLogEntry(e.id, { meal: 'lunch' });
    expect(store.pendingCount()).toBe(1);
    const [row] = store.dayEntries('2026-10-20');
    expect(row).toMatchObject({ quantity: 200, grams: 200, meal: 'lunch' });
  });

  it('rescales grams for a serving entry when the quantity changes', () => {
    const e = buildLogEntry({ food: { kind: 'product', product: skyr, db_version: 'x' }, quantity: 1, unit: 'serving', meal: 'snack', at: t0, tz: 'UTC' });
    store.saveLogEntry(e);
    store.updateLogEntry(e.id, { quantity: 2 });
    expect(store.dayEntries('2026-10-20')[0].grams).toBe(340);
  });

  it('moves updated_at forward on every change, even within the same millisecond', () => {
    const e = entry();
    e.updated_at = now.toISOString();
    store.saveLogEntry(e);
    store.updateLogEntry(e.id, { quantity: 1 });
    const [row] = store.dayEntries('2026-10-20');
    expect(row.updated_at > e.updated_at).toBe(true);
  });

  it('deletes by tombstone: the row stays, hidden, and is queued', () => {
    const e = entry();
    store.saveLogEntry(e);
    store.tombstone('log_entries', e.id);
    expect(store.dayEntries('2026-10-20')).toEqual([]);
    const [item] = store.outboxBatch(10);
    expect(item.row.deleted_at).toBe(now.toISOString());
  });

  it('stores custom foods and weights', () => {
    const f = buildCustomFood({ name: 'Brød', brand: '', ean: '', serving_g: '', per_100_unit: 'g', nutrients: { kcal: '250' } }, t0);
    store.saveCustomFood(f);
    expect(store.customFood(f.id)).toMatchObject({ name: 'Brød', kcal: 250, protein_g: null });
    const w = buildWeightEntry({ weight_kg: 81.5, at: t0, tz: 'UTC' });
    store.saveWeight(w);
    expect(store.weights(10).map((x) => x.weight_kg)).toEqual([81.5]);
    expect(store.pendingCount()).toBe(2);
  });

  it('lists recent foods, newest first, one row per food', () => {
    store.saveLogEntry(entry(100, new Date('2026-10-19T08:00:00.000Z')));
    store.saveLogEntry(entry(150, new Date('2026-10-20T08:00:00.000Z')));
    const recents = store.recentFoods(10);
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ product_id: 'tine:skyr-naturell', source: 'tine', verified: 1 });
  });
});

describe('outbox for push', () => {
  it('gives full rows in the push encoding: booleans for flags, no totals, no server_seq', () => {
    const e = entry();
    store.saveLogEntry(e);
    const [item] = store.outboxBatch(10);
    expect(item.table).toBe('log_entries');
    expect(item.row.verified).toBe(true);
    expect(item.row).not.toHaveProperty('kcal_total');
    expect(item.row).not.toHaveProperty('server_seq');
    expect(item.row.fibre_g).toBeNull();
    expect(Object.keys(item.row)).toContain('brand');
  });

  it('clears applied and stale items, records server_seq for applied', () => {
    const a = entry(1);
    const b = entry(2);
    store.saveLogEntry(a);
    store.saveLogEntry(b);
    const sent = store.outboxBatch(10);
    store.ackPush(sent, [
      { table: 'log_entries', id: a.id, status: 'applied', server_seq: 7 },
      { table: 'log_entries', id: b.id, status: 'stale' },
    ]);
    expect(store.pendingCount()).toBe(0);
    expect(store.dayEntries('2026-10-20').find((r) => r.id === a.id)?.server_seq).toBe(7);
  });

  it('keeps an item that changed while its push was in flight', () => {
    const e = entry();
    store.saveLogEntry(e);
    const sent = store.outboxBatch(10);
    store.updateLogEntry(e.id, { quantity: 300 });
    store.ackPush(sent, [{ table: 'log_entries', id: e.id, status: 'applied', server_seq: 1 }]);
    expect(store.pendingCount()).toBe(1);
    expect(store.outboxBatch(10)[0].row.quantity).toBe(300);
  });

  it('moves a rejected row out of the outbox and records the reason', () => {
    const e = entry();
    store.saveLogEntry(e);
    store.ackPush(store.outboxBatch(10), [{ table: 'log_entries', id: e.id, status: 'rejected', reason: 'nope' }]);
    expect(store.pendingCount()).toBe(0);
    expect(store.rejected()).toEqual([expect.objectContaining({ row_id: e.id, reason: 'nope' })]);
  });

  it('leaves items without a result queued for the next try', () => {
    store.saveLogEntry(entry());
    store.ackPush(store.outboxBatch(10), []);
    expect(store.pendingCount()).toBe(1);
  });
});

describe('applying a pull page', () => {
  const serverRow = (e: LogEntryRow, patch: Record<string, unknown> = {}) => ({
    ...e,
    created_at: e.created_at.replace('Z', '+00:00'),
    updated_at: e.updated_at.replace('Z', '+00:00'),
    eaten_at: e.eaten_at.replace('Z', '+00:00'),
    verified: true,
    server_seq: 5,
    kcal_total: 999,
    ...patch,
  });

  it('inserts new rows, normalises timestamps and flags, ignores generated totals, and stores the cursor', () => {
    const e = entry();
    store.applyPullPage([{ table: 'log_entries', row: serverRow(e) }], 5);
    const [row] = store.dayEntries('2026-10-20');
    expect(row).toMatchObject({ id: e.id, updated_at: e.updated_at, eaten_at: e.eaten_at, verified: 1, server_seq: 5 });
    expect(row.kcal_total).toBeCloseTo(93);
    expect(store.cursor()).toBe(5);
    expect(store.pendingCount()).toBe(0);
  });

  it('keeps a newer local copy, and lets the server win a tie', () => {
    const e = entry();
    store.saveLogEntry(e);
    store.updateLogEntry(e.id, { quantity: 400 });
    store.applyPullPage([{ table: 'log_entries', row: serverRow(e, { quantity: 10, grams: 10 }) }], 6);
    expect(store.dayEntries('2026-10-20')[0].quantity).toBe(400);

    const local = store.dayEntries('2026-10-20')[0];
    store.applyPullPage([{ table: 'log_entries', row: serverRow({ ...e, updated_at: local.updated_at }, { quantity: 20, grams: 20 }) }], 7);
    expect(store.dayEntries('2026-10-20')[0].quantity).toBe(20);
  });

  it('applies a tombstone from the server', () => {
    const e = entry();
    store.saveLogEntry(e);
    const later = new Date(now.getTime() + 60_000).toISOString();
    store.applyPullPage([{ table: 'log_entries', row: serverRow({ ...e, updated_at: later }, { deleted_at: later }) }], 8);
    expect(store.dayEntries('2026-10-20')).toEqual([]);
  });

  it('skips unknown tables and keys instead of failing the page', () => {
    store.applyPullPage([{ table: 'unknown', row: { id: 'x' } } as never], 9);
    expect(store.cursor()).toBe(9);
  });

  it('reads goals pulled from the phone for a day', () => {
    store.applyPullPage([
      { table: 'goals', row: { id: '0192f000-0000-7000-8000-000000000001', created_at: '2026-10-01T00:00:00+00:00', updated_at: '2026-10-01T00:00:00+00:00', deleted_at: null, effective_from: '2026-10-01', goal_type: 'lose', kcal_target: 2400, protein_g_target: 180, carbs_g_target: 260, fat_g_target: 71, fibre_g_target: 30, server_seq: 1 } },
    ], 1);
    expect(store.goalFor('2026-10-20')?.kcal_target).toBe(2400);
    expect(store.goalFor('2026-09-30')).toBeNull();
  });
});
