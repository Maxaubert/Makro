// The sync loop (plan part B, step 3; protocol in docs/SYNC.md).
// syncOnce pushes the outbox through sync_push, then pulls through sync_pull until `more` is
// false. SyncScheduler runs it on start, on reconnect, after local saves and every few minutes,
// never two at once. The store and the RPC are injected, so both are unit-tested.
import type { OutboxItem, PulledRow, PushResult } from './logStore';

/** The sync protocol version this client speaks (separate from user_version and schema_version). */
export const SYNC_PROTOCOL = 1;

export interface SyncStore {
  outboxBatch(limit: number): Promise<OutboxItem[]>;
  ackPush(sent: OutboxItem[], results: PushResult[]): Promise<void>;
  cursor(): Promise<number>;
  applyPullPage(rows: PulledRow[], cursor: number): Promise<void>;
}

export type Rpc = (fn: 'sync_push' | 'sync_pull', args: Record<string, unknown>) => Promise<unknown>;

export interface SyncReport {
  pushed: number;
  stale: number;
  rejected: number;
  pulled: number;
}

export async function syncOnce(
  store: SyncStore,
  rpc: Rpc,
  opts: { pushBatch?: number; pullPage?: number; maxRounds?: number } = {},
): Promise<SyncReport> {
  const pushBatch = Math.min(opts.pushBatch ?? 500, 1000);
  const pullPage = Math.min(opts.pullPage ?? 500, 1000);
  const maxRounds = opts.maxRounds ?? 50;
  const report: SyncReport = { pushed: 0, stale: 0, rejected: 0, pulled: 0 };

  for (let round = 0; round < maxRounds; round++) {
    const sent = await store.outboxBatch(pushBatch);
    if (sent.length === 0) break;
    const changes: Record<string, unknown[]> = {};
    for (const item of sent) (changes[item.table] ??= []).push(item.row);
    const res = (await rpc('sync_push', { protocol: SYNC_PROTOCOL, changes })) as { results?: PushResult[] } | null;
    if (!res || !Array.isArray(res.results)) throw new Error('sync_push returned no results');
    await store.ackPush(sent, res.results);
    for (const r of res.results) {
      if (r.status === 'applied') report.pushed++;
      else if (r.status === 'stale') report.stale++;
      else if (r.status === 'rejected') report.rejected++;
    }
    // No result for anything sent means no progress; stop instead of spinning.
    if (res.results.length === 0 || sent.length < pushBatch) break;
  }

  let since = await store.cursor();
  for (let round = 0; round < maxRounds; round++) {
    const page = (await rpc('sync_pull', { protocol: SYNC_PROTOCOL, since, max: pullPage })) as {
      rows?: PulledRow[];
      cursor?: number;
      more?: boolean;
    } | null;
    if (!page || !Array.isArray(page.rows) || typeof page.cursor !== 'number') {
      throw new Error('sync_pull returned a malformed page');
    }
    if (page.cursor < since) throw new Error(`sync_pull moved the cursor back from ${since} to ${page.cursor}`);
    await store.applyPullPage(page.rows, page.cursor);
    report.pulled += page.rows.length;
    since = page.cursor;
    if (!page.more || page.rows.length === 0) break;
  }
  return report;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: Date | null;
  error: string | null;
}

interface EventTarget {
  addEventListener(name: string, fn: () => void): void;
  removeEventListener(name: string, fn: () => void): void;
}

export class SyncScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private again = false;
  private listeners = new Set<(s: SyncStatus) => void>();
  private status: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };
  private readonly onOnline = () => void this.runNow();
  private readonly onOffline = () => this.set({ state: 'offline' });

  constructor(
    private readonly run: () => Promise<unknown>,
    private readonly opts: {
      intervalMs?: number;
      debounceMs?: number;
      target?: EventTarget;
      isOnline?: () => boolean;
    } = {},
  ) {}

  start(): void {
    const target = this.opts.target ?? globalThis;
    target.addEventListener('online', this.onOnline);
    target.addEventListener('offline', this.onOffline);
    this.timer = setInterval(() => void this.runNow(), this.opts.intervalMs ?? 3 * 60_000);
    void this.runNow();
  }

  stop(): void {
    const target = this.opts.target ?? globalThis;
    target.removeEventListener('online', this.onOnline);
    target.removeEventListener('offline', this.onOffline);
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
    this.timer = null;
    this.debounce = null;
  }

  /** Ask for a sync soon (after a local save). Calls close together become one run. */
  trigger(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.runNow();
    }, this.opts.debounceMs ?? 1_000);
  }

  subscribe(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  async runNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    const online = this.opts.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    if (!online()) {
      this.set({ state: 'offline' });
      return;
    }
    this.running = true;
    this.set({ state: 'syncing', error: null });
    try {
      await this.run();
      this.set({ state: 'idle', lastSyncedAt: new Date(), error: null });
    } catch (e) {
      this.set({ state: online() ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) });
    } finally {
      this.running = false;
    }
    if (this.again) {
      this.again = false;
      await this.runNow();
    }
  }

  private set(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }
}
