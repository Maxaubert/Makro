import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLogEntry, type LogEntryRow } from '../domain/entry';
import { LogStore, type PushResult } from './logStore';
import type { Product } from './products';
import { SyncScheduler, syncOnce, SYNC_PROTOCOL, type Rpc, type SyncStore } from './sync';
import { memoryDb } from './testing';

const skyr: Product = {
  id: 'tine:skyr-naturell', name: 'Skyr Naturell', brand: 'Tine', pack_size: null, ean: null, serving_g: 170,
  per_100_unit: 'g', source: 'tine', source_name: 'Tine', source_kind: 'brand', verified: true, data_quality: [],
  nutrients: { kcal: 62, protein_g: 11, fat_g: 0.2, sat_fat_g: 0.1, carbs_g: 4, sugars_g: 4, fibre_g: null, salt_g: 0.1 },
};
const entry = (q: number, at = new Date('2026-10-20T08:00:00.000Z')): LogEntryRow =>
  buildLogEntry({ food: { kind: 'product', product: skyr, db_version: 'v' }, quantity: q, unit: 'g', meal: 'lunch', at, tz: 'UTC' });

/** A small in-memory stand-in for sync_push / sync_pull with the rules of docs/SYNC.md. */
class FakeServer {
  seq = 0;
  rows = new Map<string, { table: string; row: Record<string, unknown>; seq: number }>();
  calls: string[] = [];
  failNext = 0;

  rpc: Rpc = async (fn, args) => {
    this.calls.push(fn);
    if (this.failNext > 0) {
      this.failNext--;
      throw new TypeError('Failed to fetch');
    }
    if (args.protocol !== SYNC_PROTOCOL) throw new Error('bad protocol');
    if (fn === 'sync_push') {
      const results: PushResult[] = [];
      for (const [table, rows] of Object.entries(args.changes as Record<string, Record<string, unknown>[]>)) {
        for (const row of rows) {
          const id = String(row.id);
          if (row.quantity === -1) {
            results.push({ table, id, status: 'rejected', reason: 'quantity_check' });
            continue;
          }
          const cur = this.rows.get(id);
          if (cur && Date.parse(String(cur.row.updated_at)) >= Date.parse(String(row.updated_at))) {
            results.push({ table, id, status: 'stale' });
            continue;
          }
          this.seq++;
          // The server sends timestamps back as Postgres prints them.
          this.rows.set(id, { table, row: { ...row, updated_at: String(row.updated_at).replace('Z', '+00:00') }, seq: this.seq });
          results.push({ table, id, status: 'applied', server_seq: this.seq });
        }
      }
      return { protocol: 1, results };
    }
    const since = Number(args.since);
    const max = Number(args.max);
    const all = [...this.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, max);
    return {
      rows: page.map((r) => ({ table: r.table, row: { ...r.row, server_seq: r.seq } })),
      cursor: page.length ? page[page.length - 1].seq : since,
      more: all.length > max,
    };
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

async function device(clock = () => new Date('2026-10-20T09:00:00.000Z')) {
  const s = new LogStore(await memoryDb(), clock);
  s.migrate();
  return s;
}

describe('syncOnce', () => {
  it('pushes the outbox, then pulls, and the second device sees the row', async () => {
    const server = new FakeServer();
    const a = await device();
    const b = await device();
    const e = entry(150);
    a.saveLogEntry(e);

    const ra = await syncOnce(asyncStore(a), server.rpc);
    expect(ra).toMatchObject({ pushed: 1, pulled: 1, rejected: 0 });
    expect(a.pendingCount()).toBe(0);

    await syncOnce(asyncStore(b), server.rpc);
    expect(b.dayEntries('2026-10-20').map((r) => r.id)).toEqual([e.id]);
    expect(b.dayEntries('2026-10-20')[0].server_seq).toBe(1);
  });

  it('pushes in batches until the outbox is empty', async () => {
    const server = new FakeServer();
    const a = await device();
    for (let i = 0; i < 5; i++) a.saveLogEntry(entry(i + 1));
    const r = await syncOnce(asyncStore(a), server.rpc, { pushBatch: 2, pullPage: 2 });
    expect(r.pushed).toBe(5);
    expect(server.calls.filter((c) => c === 'sync_push')).toHaveLength(3);
    expect(a.pendingCount()).toBe(0);
  });

  it('pages through pulls with the cursor until more is false', async () => {
    const server = new FakeServer();
    const a = await device();
    for (let i = 0; i < 5; i++) a.saveLogEntry(entry(i + 1));
    await syncOnce(asyncStore(a), server.rpc);
    const b = await device();
    const r = await syncOnce(asyncStore(b), server.rpc, { pullPage: 2 });
    expect(r.pulled).toBe(5);
    expect(b.cursor()).toBe(5);
    expect(server.calls.filter((c) => c === 'sync_pull').length).toBeGreaterThanOrEqual(3);
  });

  it('drops a stale row from the outbox and takes the server copy on pull', async () => {
    const server = new FakeServer();
    const a = await device();
    const b = await device();
    const e = entry(100);
    a.saveLogEntry(e);
    await syncOnce(asyncStore(a), server.rpc);
    // b has an older copy of the same row queued (same updated_at): the server keeps its own.
    b.saveLogEntry({ ...e, quantity: 999, grams: 999 });
    const r = await syncOnce(asyncStore(b), server.rpc);
    expect(r.stale).toBe(1);
    expect(b.pendingCount()).toBe(0);
    expect(b.dayEntries('2026-10-20')[0].quantity).toBe(100);
  });

  it('is idempotent: retrying after a lost response duplicates nothing', async () => {
    const server = new FakeServer();
    const a = await device();
    a.saveLogEntry(entry(100));
    const sent = a.outboxBatch(10);
    // The push reached the server, but the response was lost: the outbox still holds the row.
    await server.rpc('sync_push', { protocol: SYNC_PROTOCOL, changes: { log_entries: sent.map((s) => s.row) } });
    const r = await syncOnce(asyncStore(a), server.rpc);
    expect(r.stale).toBe(1);
    expect(server.rows.size).toBe(1);
    expect(a.pendingCount()).toBe(0);
  });

  it('keeps everything queued when the network fails, and succeeds later', async () => {
    const server = new FakeServer();
    const a = await device();
    a.saveLogEntry(entry(100));
    server.failNext = 1;
    await expect(syncOnce(asyncStore(a), server.rpc)).rejects.toThrow(/Failed to fetch/);
    expect(a.pendingCount()).toBe(1);
    await syncOnce(asyncStore(a), server.rpc);
    expect(a.pendingCount()).toBe(0);
  });

  it('counts rejected rows and moves them aside', async () => {
    const server = new FakeServer();
    const a = await device();
    a.saveLogEntry({ ...entry(1), quantity: -1 });
    const r = await syncOnce(asyncStore(a), server.rpc);
    expect(r.rejected).toBe(1);
    expect(a.rejected()).toHaveLength(1);
  });

  it('refuses a malformed push response instead of clearing the outbox', async () => {
    const a = await device();
    a.saveLogEntry(entry(1));
    await expect(syncOnce(asyncStore(a), async () => ({ nope: true }))).rejects.toThrow(/sync_push/);
    expect(a.pendingCount()).toBe(1);
  });
});

describe('SyncScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function env() {
    const listeners: Record<string, () => void> = {};
    return {
      listeners,
      target: {
        addEventListener: (name: string, fn: () => void) => (listeners[name] = fn),
        removeEventListener: (name: string) => delete listeners[name],
      },
    };
  }

  it('runs on start, on reconnect and on a timer', async () => {
    const run = vi.fn(async () => undefined);
    const e = env();
    const s = new SyncScheduler(run, { intervalMs: 60_000, target: e.target, isOnline: () => true });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    e.listeners.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    s.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('starts again after a stop (sign out, then sign in), and a second start only runs once more', async () => {
    const run = vi.fn(async () => undefined);
    const e = env();
    const s = new SyncScheduler(run, { intervalMs: 60_000, target: e.target, isOnline: () => true });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    s.stop();
    expect(s.isStarted()).toBe(false);
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
    e.listeners.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(5);
    s.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(5);
  });

  it('never runs two syncs at once, and runs once more when asked during a run', async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((r) => (release = r)));
    const s = new SyncScheduler(run, { intervalMs: 60_000, debounceMs: 0, target: env().target, isOnline: () => true });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    s.trigger();
    s.trigger();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    s.stop();
  });

  it('skips runs while offline and reports errors without throwing', async () => {
    let online = false;
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    const states: string[] = [];
    const s = new SyncScheduler(run, { intervalMs: 60_000, target: env().target, isOnline: () => online });
    s.subscribe((st) => states.push(st.state));
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    expect(states).toContain('offline');
    online = true;
    s.trigger();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe('error');
    s.stop();
  });
});
