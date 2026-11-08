// The real sync_push / sync_pull of the local Supabase stack, driven by the real LogStore.
// Runs only when MAKRO_LOCAL_SUPABASE=1, with the local keys in the environment
// (see apps/web/README.md: `npm run test:local`). Never point it at the hosted project.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCustomFood, buildLogEntry, buildWeightEntry } from '../domain/entry';
import { LogStore } from './logStore';
import type { Product } from './products';
import { syncOnce, type Rpc, type SyncStore } from './sync';
import { memoryDb } from './testing';

const enabled = process.env.MAKRO_LOCAL_SUPABASE === '1';
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

const skyr: Product = {
  id: 'tine:skyr-naturell', name: 'Skyr Naturell', brand: 'Tine', pack_size: '450 g', ean: '7038010012345',
  serving_g: 170, per_100_unit: 'g', source: 'tine', source_name: 'Tine', source_kind: 'brand', verified: true,
  data_quality: [],
  nutrients: { kcal: 62, protein_g: 11, fat_g: 0.2, sat_fat_g: 0.1, carbs_g: 4, sugars_g: 4, fibre_g: null, salt_g: 0.1 },
};

async function signedInClient(admin: SupabaseClient, email: string): Promise<SupabaseClient> {
  const password = `pw-${crypto.randomUUID()}`;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return client;
}

function rpcOf(client: SupabaseClient): Rpc {
  return async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
}

function asyncStore(s: LogStore): SyncStore {
  return {
    outboxBatch: async (n) => s.outboxBatch(n),
    ackPush: async (sent, results) => s.ackPush(sent, results),
    cursor: async () => s.cursor(),
    applyPullPage: async (rows, cursor) => s.applyPullPage(rows, cursor),
  };
}

describe.runIf(enabled)('sync against the local Supabase', () => {
  let admin: SupabaseClient;
  beforeAll(() => {
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  });

  it('pushes entries, custom foods and weights, and a second device pulls the same rows', async () => {
    const client = await signedInClient(admin, `sync-${Date.now()}@example.test`);
    const now = new Date();
    const a = new LogStore(await memoryDb(), () => now);
    a.migrate();
    const food = buildCustomFood({ name: 'Mormors brød', brand: '', ean: '', serving_g: '', per_100_unit: 'g', nutrients: { kcal: '250' } }, now);
    a.saveCustomFood(food);
    const e1 = buildLogEntry({ food: { kind: 'product', product: skyr, db_version: '2026.10.25' }, quantity: 150, unit: 'g', meal: 'breakfast', at: now, tz: 'Europe/Oslo' });
    const e2 = buildLogEntry({ food: { kind: 'custom', food }, quantity: 80, unit: 'g', meal: 'lunch', at: now, tz: 'Europe/Oslo' });
    a.saveLogEntry(e1);
    a.saveLogEntry(e2);
    a.saveWeight(buildWeightEntry({ weight_kg: 81.5, at: now, tz: 'Europe/Oslo' }));

    const r = await syncOnce(asyncStore(a), rpcOf(client));
    expect(r).toMatchObject({ pushed: 4, rejected: 0 });
    expect(a.pendingCount()).toBe(0);

    // The server computed the totals; null stays null.
    const { data } = await client.from('log_entries').select('id, kcal_total, fibre_g_total, verified').eq('id', e1.id).single();
    expect(data?.kcal_total).toBeCloseTo(93);
    expect(data?.fibre_g_total).toBeNull();
    expect(data?.verified).toBe(true);

    const b = new LogStore(await memoryDb(), () => now);
    b.migrate();
    await syncOnce(asyncStore(b), rpcOf(client), { pullPage: 2 });
    const day = b.dayEntries(e1.local_date);
    expect(day.map((x) => x.id).sort()).toEqual([e1.id, e2.id].sort());
    expect(day.find((x) => x.id === e1.id)).toMatchObject({ eaten_at: e1.eaten_at, verified: 1, fibre_g: null });
    expect(b.customFood(food.id)?.protein_g).toBeNull();
    expect(b.weights(5)[0].weight_kg).toBe(81.5);
  });

  it('a tombstone and an edit travel through the server', async () => {
    const client = await signedInClient(admin, `sync2-${Date.now()}@example.test`);
    let now = new Date();
    const a = new LogStore(await memoryDb(), () => now);
    a.migrate();
    const e = buildLogEntry({ food: { kind: 'product', product: skyr, db_version: 'v' }, quantity: 100, unit: 'g', meal: 'snack', at: now, tz: 'UTC' });
    a.saveLogEntry(e);
    await syncOnce(asyncStore(a), rpcOf(client));
    now = new Date(now.getTime() + 5);
    a.tombstone('log_entries', e.id);
    const r = await syncOnce(asyncStore(a), rpcOf(client));
    expect(r.pushed).toBe(1);
    const { data } = await client.from('log_entries').select('deleted_at').eq('id', e.id).single();
    expect(data?.deleted_at).not.toBeNull();
  });
});
