import { beforeEach, describe, expect, it } from 'vitest';
import { buildCustomFood, buildGoal, buildLogEntry, buildWeightEntry, type LogEntryRow } from '../domain/entry';
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

describe('loggedDays', () => {
  it('lists each day with a live entry once, newest first', () => {
    store.saveLogEntry(entry(150, new Date('2026-10-18T08:00:00.000Z')));
    store.saveLogEntry(entry(150, new Date('2026-10-20T08:00:00.000Z')));
    store.saveLogEntry(entry(100, new Date('2026-10-20T12:00:00.000Z')));
    expect(store.loggedDays()).toEqual(['2026-10-20', '2026-10-18']);
  });

  it('leaves out a day whose only entry was deleted', () => {
    const gone = entry(150, new Date('2026-10-19T08:00:00.000Z'));
    store.saveLogEntry(gone);
    store.tombstone('log_entries', gone.id);
    expect(store.loggedDays()).toEqual([]);
  });
});

describe('your data', () => {
  it('exports live rows of every table', () => {
    store.saveLogEntry(entry());
    const gone = entry(100);
    store.saveLogEntry(gone);
    store.tombstone('log_entries', gone.id);
    store.saveWeight(buildWeightEntry({ weight_kg: 80, at: t0, tz: 'UTC' }));
    const out = store.exportAll();
    expect(out.log_entries).toHaveLength(1);
    expect(out.weight_entries).toHaveLength(1);
    expect(out.goals).toEqual([]);
  });
  it('wipes everything on this device', () => {
    store.saveLogEntry(entry());
    store.markSetupDone('user-1');
    store.claimOwner('user-1');
    store.wipe();
    expect(store.dayEntries('2026-10-20')).toEqual([]);
    expect(store.pendingCount()).toBe(0);
    expect(store.setupDoneFor()).toBeNull();
    expect(store.claimOwner('user-2')).toBe('claimed');
  });
});

describe('changing a goal after onboarding (#73)', () => {
  const change = (kcal: number, at: Date) =>
    buildGoal({
      targets: { kcal_target: kcal, protein_g_target: 163, carbs_g_target: 258, fat_g_target: 63, fibre_g_target: 30 },
      goal_type: 'lose', target_weight_kg: 78, pace_kg_per_week: 0.5, sex: 'male', birth_year: 1996, height_cm: 182, activity_level: 'active', weight_kg: 81.5, at, tz: 'UTC',
    });
  const later = new Date('2026-10-25T08:00:00.000Z');
  const liveGoals = () => store.exportAll().goals;

  it('adds a row from today, so past days keep their target', () => {
    store.saveGoal(change(2250, t0));
    store.saveGoalChange(change(2100, later), null);
    expect(liveGoals()).toHaveLength(2);
    expect(store.goalFor('2026-10-24')?.kcal_target).toBe(2250);
    expect(store.goalFor('2026-10-25')?.kcal_target).toBe(2100);
    expect(store.goalFor('2026-10-30')?.kcal_target).toBe(2100);
  });
  it('updates the row when one exists for today, with a later updated_at, and queues it once', () => {
    const first = change(2250, later);
    store.saveGoal(first);
    now = new Date('2026-10-25T09:00:00.000Z');
    store.saveGoalChange(change(2100, now), null);
    const rows = liveGoals();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first.id, created_at: first.created_at, kcal_target: 2100, updated_at: '2026-10-25T09:00:00.000Z' });
    expect(store.outboxBatch(10).filter((o) => o.table === 'goals')).toHaveLength(1);
  });
  it('wins over the old row even with a slow clock', () => {
    const first = change(2250, later);
    store.saveGoal(first);
    now = new Date('2026-10-25T07:00:00.000Z');
    store.saveGoalChange(change(2100, later), null);
    expect(Date.parse(String(liveGoals()[0].updated_at))).toBeGreaterThan(Date.parse(first.updated_at));
  });
  it('does not reuse a deleted row for today', () => {
    const first = change(2250, later);
    store.saveGoal(first);
    store.tombstone('goals', first.id);
    const next = change(2100, later);
    store.saveGoalChange(next, null);
    expect(liveGoals()).toHaveLength(1);
    expect(liveGoals()[0].id).toBe(next.id);
  });
  it('saves a changed weight with the goal, in one go', () => {
    store.saveGoalChange(change(2100, later), buildWeightEntry({ weight_kg: 80, at: later, tz: 'UTC' }));
    expect(store.weights(5).map((w) => w.weight_kg)).toEqual([80]);
    expect(liveGoals()).toHaveLength(1);
  });
  it('writes nothing if the weight cannot be saved', () => {
    expect(() => store.saveGoalChange(change(2100, later), { ...buildWeightEntry({ weight_kg: 80, at: later, tz: 'UTC' }), measured_at: 'nonsense' })).toThrow();
    expect(liveGoals()).toEqual([]);
  });
  it('reads the latest live goal with all its inputs', () => {
    expect(store.latestGoal()).toBeNull();
    store.saveGoal(change(2250, t0));
    const newest = change(2100, later);
    store.saveGoal(newest);
    expect(store.latestGoal()).toMatchObject({ id: newest.id, kcal_target: 2100, goal_type: 'lose', sex: 'male', birth_year: 1996, height_cm: 182, activity_level: 'active', weight_kg: 81.5, target_weight_kg: 78, pace_kg_per_week: 0.5 });
    store.tombstone('goals', newest.id);
    expect(store.latestGoal()?.kcal_target).toBe(2250);
  });
});

describe('first-run setup', () => {
  const goal = () =>
    buildGoal({
      targets: { kcal_target: 2250, protein_g_target: 163, carbs_g_target: 258, fat_g_target: 63, fibre_g_target: 30 },
      goal_type: 'lose', target_weight_kg: 78, pace_kg_per_week: 0.5, sex: 'male', birth_year: 1996, height_cm: 182, activity_level: 'active', weight_kg: 81.5, at: t0, tz: 'UTC',
    });
  it('saves a goal that the day screens read and that syncs', () => {
    const g = goal();
    expect(g).toMatchObject({ effective_from: '2026-10-20', goal_type: 'lose', kcal_target: 2250, sex: 'male', birth_year: 1996 });
    store.saveGoal(g);
    expect(store.goalFor('2026-10-20')?.kcal_target).toBe(2250);
    expect(store.goalFor('2026-10-19')).toBeNull();
    expect(store.pendingCount()).toBe(1);
  });
  it('remembers which account finished setup', () => {
    expect(store.setupDoneFor()).toBeNull();
    store.markSetupDone('user-1');
    expect(store.setupDoneFor()).toBe('user-1');
  });
});

describe('popularity', () => {
  it('counts your live log entries per product', () => {
    store.saveLogEntry(entry());
    store.saveLogEntry(entry(200));
    const gone = entry(100);
    store.saveLogEntry(gone);
    store.tombstone('log_entries', gone.id);
    expect(store.productCounts()).toEqual([{ product_id: skyr.id, n: 2 }]);
  });
  it('stores only well-formed global counts, at most 1000', () => {
    const good = { product_id: 'a', users: 2, logs: 5 };
    store.savePopularity([
      good,
      { product_id: 'x'.repeat(1025), users: 2, logs: 5 },
      { product_id: 'b', users: -1, logs: 5 },
      { product_id: 'c', users: 2, logs: Number.NaN },
      { product_id: 7 as unknown as string, users: 2, logs: 5 },
    ]);
    expect(store.popularity()).toEqual([good]);
    store.savePopularity(Array.from({ length: 1500 }, (_, i) => ({ product_id: String(i), users: 2, logs: 1 })));
    expect(store.popularity()).toHaveLength(1000);
  });
  it('keeps the global counts and knows how old they are', () => {
    expect(store.popularity()).toEqual([]);
    expect(store.popularityStale(1000)).toBe(true);
    store.savePopularity([{ product_id: 'a', users: 2, logs: 5 }]);
    expect(store.popularity()).toEqual([{ product_id: 'a', users: 2, logs: 5 }]);
    expect(store.popularityStale(1000)).toBe(false);
    now = new Date(now.getTime() + 1001);
    expect(store.popularityStale(1000)).toBe(true);
  });
});

describe('local schema', () => {
  it('has the eight synced tables, the outbox and user_version 2', () => {
    expect(store.schemaVersion()).toBe(2);
    for (const t of ['log_entries', 'custom_foods', 'saved_meals', 'saved_meal_items', 'favourites', 'goals', 'weight_entries', 'daily_supplements', 'outbox']) {
      expect(store.hasTable(t), t).toBe(true);
    }
  });
  it('migrates twice without harm', () => {
    store.migrate();
    expect(store.schemaVersion()).toBe(2);
  });
  it('upgrades a version 1 file: entries keep their rows and get daily_supplement_id (#52)', async () => {
    const sql = await memoryDb();
    const old = new LogStore(sql);
    old.migrate();
    old.saveLogEntry(entry());
    sql.run('alter table log_entries drop column daily_supplement_id');
    sql.run('drop table daily_supplements');
    sql.run('pragma user_version = 1');
    old.migrate();
    expect(old.schemaVersion()).toBe(2);
    expect(old.hasTable('daily_supplements')).toBe(true);
    expect(old.dayEntries('2026-10-20')[0]).toMatchObject({ daily_supplement_id: null });
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

  describe('weights', () => {
    const measured = new Date('2026-10-19T06:30:00.000Z');
    const saved = (kg = 81.5, at = measured) => {
      const w = buildWeightEntry({ weight_kg: kg, at, tz: 'Europe/Oslo', now });
      store.saveWeight(w);
      return w;
    };

    it('lists the whole history oldest first, without deleted rows', () => {
      const later = saved(82, new Date('2026-10-20T06:30:00.000Z'));
      const first = saved(81);
      const gone = saved(90, new Date('2026-10-18T06:30:00.000Z'));
      store.tombstone('weight_entries', gone.id);
      expect(store.weightHistory().map((w) => w.id)).toEqual([first.id, later.id]);
    });

    it('edits the value, keeps the day and queues the row with a newer updated_at', () => {
      const w = saved();
      now = new Date(now.getTime() + 60_000);
      store.updateWeight(w.id, { weight_kg: 80.9 });
      const [row] = store.weightHistory();
      expect(row).toMatchObject({ weight_kg: 80.9, measured_at: w.measured_at, local_date: '2026-10-19', tz: 'Europe/Oslo' });
      expect(row.updated_at).toBe(now.toISOString());
      expect(store.outboxBatch(10)[0].row.weight_kg).toBe(80.9);
    });

    it('re-stamps the day only when the user moves the measurement', () => {
      const w = saved();
      const moved = new Date('2026-10-16T23:30:00.000Z');
      store.updateWeight(w.id, { moved: { at: moved, tz: 'Europe/Oslo' } });
      expect(store.weightHistory()[0]).toMatchObject({ weight_kg: 81.5, measured_at: moved.toISOString(), local_date: '2026-10-17', tz: 'Europe/Oslo' });
    });

    it('does not touch the row for an edit that changes nothing', () => {
      const w = saved();
      now = new Date(now.getTime() + 60_000);
      store.updateWeight(w.id, {});
      expect(store.weightHistory()[0].updated_at).toBe(w.updated_at);
      expect(store.outboxBatch(10)[0].version).toBe(1);
    });

    it('refuses a bad value, and a row that is gone', () => {
      const w = saved();
      expect(() => store.updateWeight(w.id, { weight_kg: 0 })).toThrow();
      expect(() => store.updateWeight(w.id, { weight_kg: Number.NaN })).toThrow();
      expect(() => store.updateWeight('missing', { weight_kg: 80 })).toThrow();
      store.tombstone('weight_entries', w.id);
      expect(() => store.updateWeight(w.id, { weight_kg: 80 })).toThrow();
    });

    it('deletes by tombstone, and the tombstone is what gets pushed', () => {
      const w = saved();
      now = new Date(now.getTime() + 60_000);
      store.tombstone('weight_entries', w.id);
      expect(store.weightHistory()).toEqual([]);
      expect(store.outboxBatch(10)[0].row.deleted_at).toBe(now.toISOString());
    });

    it('gives the goal target and type for the distance to goal', () => {
      store.saveGoal(buildGoal({
        targets: { kcal_target: 2000, protein_g_target: 160, carbs_g_target: 200, fat_g_target: 70, fibre_g_target: 30 },
        goal_type: 'lose', target_weight_kg: 78, pace_kg_per_week: 0.5, sex: 'male', birth_year: 1996, height_cm: 182, activity_level: 'active', weight_kg: 81.5, at: t0, tz: 'UTC',
      }));
      expect(store.goalFor('2026-10-20')).toMatchObject({ target_weight_kg: 78, goal_type: 'lose' });
    });
  });

  it('lists recent foods, newest first, one row per food', () => {
    store.saveLogEntry(entry(100, new Date('2026-10-19T08:00:00.000Z')));
    store.saveLogEntry(entry(150, new Date('2026-10-20T08:00:00.000Z')));
    const recents = store.recentFoods(10);
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ product_id: 'tine:skyr-naturell', source: 'tine', verified: 1 });
  });

  it('remembers the amount and unit last logged for a food', () => {
    expect(store.lastPortion('product', ['tine:skyr-naturell'])).toBeNull();
    store.saveLogEntry(entry(100, new Date('2026-10-19T08:00:00.000Z')));
    store.saveLogEntry(entry(180, new Date('2026-10-20T08:00:00.000Z')));
    expect(store.lastPortion('product', ['tine:skyr-naturell'])).toEqual({ quantity: 180, unit: 'g' });
    // A product merged into another keeps its history: the old id still counts.
    expect(store.lastPortion('product', ['new:skyr', 'tine:skyr-naturell'])).toEqual({ quantity: 180, unit: 'g' });
    store.tombstone('log_entries', store.dayEntries('2026-10-20')[0].id);
    expect(store.lastPortion('product', ['tine:skyr-naturell'])).toEqual({ quantity: 100, unit: 'g' });
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

  it('keeps a newer local copy that is waiting to push, and lets the server win a tie', () => {
    const e = entry();
    store.saveLogEntry(e);
    store.updateLogEntry(e.id, { quantity: 400 });
    store.applyPullPage([{ table: 'log_entries', row: serverRow(e, { quantity: 10, grams: 10 }) }], 6);
    expect(store.dayEntries('2026-10-20')[0].quantity).toBe(400);

    const local = store.dayEntries('2026-10-20')[0];
    store.applyPullPage([{ table: 'log_entries', row: serverRow({ ...e, updated_at: local.updated_at }, { quantity: 20, grams: 20 }) }], 7);
    expect(store.dayEntries('2026-10-20')[0].quantity).toBe(20);
  });

  it('takes the server copy of a synced row even when the local clock ran ahead', () => {
    // The browser clock is 10 minutes fast: the server stored least(client updated_at, now()).
    now = new Date('2026-10-20T09:10:00.000Z');
    const e = entry();
    e.updated_at = now.toISOString();
    store.saveLogEntry(e);
    store.ackPush(store.outboxBatch(10), [{ table: 'log_entries', id: e.id, status: 'applied', server_seq: 5 }]);
    const clamped = '2026-10-20T09:00:00.000Z';
    store.applyPullPage([{ table: 'log_entries', row: serverRow({ ...e, updated_at: clamped }, { server_seq: 5 }) }], 5);
    expect(store.dayEntries('2026-10-20')[0].updated_at).toBe(clamped);

    // Another device edits it at 09:05, between the server value and the old local value.
    const other = '2026-10-20T09:05:00.000Z';
    store.applyPullPage([{ table: 'log_entries', row: serverRow({ ...e, updated_at: other }, { quantity: 30, grams: 30, server_seq: 6 }) }], 6);
    expect(store.dayEntries('2026-10-20')[0]).toMatchObject({ quantity: 30, updated_at: other, server_seq: 6 });
  });

  it('takes an older server copy of a row with nothing waiting to push', () => {
    const e = entry();
    store.saveLogEntry(e);
    store.ackPush(store.outboxBatch(10), [{ table: 'log_entries', id: e.id, status: 'applied', server_seq: 5 }]);
    const earlier = new Date(Date.parse(e.updated_at) - 60_000).toISOString();
    store.applyPullPage([{ table: 'log_entries', row: serverRow({ ...e, updated_at: earlier }, { deleted_at: earlier, server_seq: 6 }) }], 6);
    expect(store.dayEntries('2026-10-20')).toEqual([]);
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

describe('one account per local log', () => {
  it('claims an empty log for the first user', () => {
    expect(store.claimOwner('user-a')).toBe('claimed');
    expect(store.claimOwner('user-a')).toBe('same');
  });

  it('clears a fully synced log when another user signs in', () => {
    store.claimOwner('user-a');
    store.applyPullPage([], 12);
    store.saveLogEntry(entry());
    store.ackPush(store.outboxBatch(10), [{ table: 'log_entries', id: store.outboxBatch(10)[0].id, status: 'applied', server_seq: 1 }]);
    expect(store.claimOwner('user-b')).toBe('switched');
    expect(store.dayEntries('2026-10-20')).toEqual([]);
    expect(store.cursor()).toBe(0);
  });

  it('refuses to hand unsynced changes to another user', () => {
    store.claimOwner('user-a');
    store.saveLogEntry(entry());
    expect(() => store.claimOwner('user-b')).toThrow(/not synced/);
    expect(store.pendingCount()).toBe(1);
  });
});

describe('a day confirmed as complete (#27, device only)', () => {
  it('is not complete until confirmed, and only that day is', () => {
    expect(store.isDayComplete('2026-10-20')).toBe(false);
    store.markDayComplete('2026-10-20');
    expect(store.isDayComplete('2026-10-20')).toBe(true);
    expect(store.isDayComplete('2026-10-21')).toBe(false);
  });
  it('can be confirmed twice', () => {
    store.markDayComplete('2026-10-20');
    store.markDayComplete('2026-10-20');
    expect(store.isDayComplete('2026-10-20')).toBe(true);
  });
  it('never reaches the outbox', () => {
    store.markDayComplete('2026-10-20');
    expect(store.pendingCount()).toBe(0);
    expect(store.outboxBatch(10)).toEqual([]);
  });
  it('is forgotten when another account takes over this device', () => {
    store.claimOwner('user-1');
    store.markDayComplete('2026-10-20');
    store.claimOwner('user-2');
    expect(store.isDayComplete('2026-10-20')).toBe(false);
  });
  it('stays for the same account', () => {
    store.claimOwner('user-1');
    store.markDayComplete('2026-10-20');
    store.claimOwner('user-1');
    expect(store.isDayComplete('2026-10-20')).toBe(true);
  });
  it('is wiped with everything else on the device', () => {
    store.markDayComplete('2026-10-20');
    store.wipe();
    expect(store.isDayComplete('2026-10-20')).toBe(false);
  });
});
