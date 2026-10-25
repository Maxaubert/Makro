// The app's services, made once: Supabase client, database worker, product file, sync loop.
// Screens read them through React hooks (./hooks.ts).
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { syncProductFile, type LatestJson } from '../data/productFile';
import type { ProductMeta } from '../data/products';
import { SyncScheduler, syncOnce, type SyncStatus } from '../data/sync';
import { buildMissPayload, type CustomFoodRow, type MissType } from '../domain/entry';
import { createDb, type Db } from './db';

export const APP_VERSION = `web-${__APP_VERSION__}`;

export type ProductState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; meta: ProductMeta; note?: string }
  | { status: 'error'; message: string };

export interface AppState {
  session: Session | null;
  authReady: boolean;
  products: ProductState;
  sync: SyncStatus;
  pending: number;
  /** Grows after every local write or applied pull, so screens re-read. */
  dataVersion: number;
  /** The local log could not be opened; nothing works until this is solved. */
  fatal: string | null;
}

const BUCKET = 'products';
const MISS_QUEUE_KEY = 'makro.missQueue';

export function productSourceMode(): 'fixture' | 'bucket' {
  // The fixture is served only by the dev server; a production build always uses the bucket.
  return import.meta.env.DEV && import.meta.env.VITE_PRODUCTS_SOURCE === 'fixture' ? 'fixture' : 'bucket';
}

export class App {
  readonly supabase: SupabaseClient;
  readonly db: Db;
  readonly scheduler: SyncScheduler;
  private state: AppState;
  private listeners = new Set<() => void>();
  private dbReady: Promise<unknown> | null = null;

  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see apps/web/README.md).');
    this.supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.db = createDb();
    this.scheduler = new SyncScheduler(() => this.syncNow(), { intervalMs: 3 * 60_000, debounceMs: 800 });
    this.state = {
      session: null,
      authReady: false,
      products: { status: 'loading', message: 'Opening your log' },
      sync: this.scheduler.getStatus(),
      pending: 0,
      dataVersion: 0,
      fatal: null,
    };
    this.scheduler.subscribe((sync) => this.set({ sync }));
    this.supabase.auth.onAuthStateChange((_event, session) => {
      const was = this.state.session?.user.id;
      this.set({ session, authReady: true });
      if (session && session.user.id !== was) void this.afterSignIn();
      if (!session) this.scheduler.stop();
    });
  }

  getState = (): AppState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private openDb(): Promise<unknown> {
    this.dbReady ??= this.db.init();
    return this.dbReady;
  }

  private async afterSignIn(): Promise<void> {
    try {
      await this.openDb();
      const userId = this.state.session?.user.id;
      if (!userId) return;
      await this.db.claimOwner(userId);
    } catch (e) {
      this.set({ fatal: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.set({ fatal: null });
    await this.refreshPending();
    // After a sign-out the scheduler is stopped; start() brings back the timer and the
    // reconnect listener; when it is already running, start() just syncs now.
    this.scheduler.start();
    await this.loadProducts();
  }

  /** Call after every local write: the screens re-read and a sync is scheduled. */
  async changed(): Promise<void> {
    await this.refreshPending();
    this.set({ dataVersion: this.state.dataVersion + 1 });
    this.scheduler.trigger();
  }

  private async refreshPending(): Promise<void> {
    this.set({ pending: await this.db.pendingCount() });
  }

  private async syncNow(): Promise<void> {
    if (!this.state.session) return;
    await this.openDb();
    const report = await syncOnce(this.db, async (fn, args) => {
      const { data, error } = await this.supabase.rpc(fn, args);
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data;
    });
    await this.refreshPending();
    if (report.pulled > 0 || report.pushed > 0) this.set({ dataVersion: this.state.dataVersion + 1 });
    await this.flushMisses();
  }

  async loadProducts(): Promise<void> {
    const current = await this.db.productMeta();
    if (current) this.set({ products: { status: 'ready', meta: current } });
    else this.set({ products: { status: 'loading', message: 'Downloading the food database' } });
    try {
      if (productSourceMode() === 'fixture') {
        if (!current) {
          const res = await fetch('/__fixture/products.sqlite', { cache: 'no-store' });
          if (!res.ok) throw new Error('No fixture file. Run `npm run fixture` in apps/web.');
          const meta = await this.db.installProducts(new Uint8Array(await res.arrayBuffer()), null);
          this.set({ products: { status: 'ready', meta, note: 'Fixture database (dev mode)' } });
        } else {
          this.set({ products: { status: 'ready', meta: current, note: 'Fixture database (dev mode)' } });
        }
        return;
      }
      const result = await syncProductFile({
        fetchLatest: async () => (await this.fetchFromBucket('latest.json', true).then((r) => r.json())) as LatestJson,
        fetchFile: async (path) => new Uint8Array(await (await this.fetchFromBucket(path, false)).arrayBuffer()),
        installedVersion: async () => (await this.db.productMeta())?.db_version ?? null,
        install: async (bytes, expected) => {
          await this.db.installProducts(bytes, expected);
        },
      });
      const meta = await this.db.productMeta();
      if (!meta) throw new Error('The food database did not open after download.');
      this.set({ products: { status: 'ready', meta, note: result.status === 'kept' ? result.reason : undefined } });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (current) this.set({ products: { status: 'ready', meta: current, note: message } });
      else this.set({ products: { status: 'error', message } });
    }
  }

  private async fetchFromBucket(path: string, fresh: boolean): Promise<Response> {
    const { data, error } = await this.supabase.storage.from(BUCKET).createSignedUrl(path, 120);
    if (error || !data) throw new Error(`products/${path}: ${error?.message ?? 'no signed link'}`);
    const res = await fetch(data.signedUrl, { cache: fresh ? 'no-store' : 'default' });
    if (!res.ok) throw new Error(`products/${path}: HTTP ${res.status}`);
    return res;
  }

  /** Record a miss anonymously through submit-miss. Never blocks logging; retried on the next sync. */
  async recordMiss(
    food: CustomFoodRow,
    ctx: { type: MissType; query_text: string | null; ean: string | null },
  ): Promise<void> {
    const payload = {
      id: crypto.randomUUID(),
      ...buildMissPayload(food, { ...ctx, db_version: this.state.products.status === 'ready' ? this.state.products.meta.db_version : null, app_version: APP_VERSION }),
    };
    const queue = readMissQueue();
    queue.push(payload);
    writeMissQueue(queue);
    await this.flushMisses();
  }

  private async flushMisses(): Promise<void> {
    const queue = readMissQueue();
    if (queue.length === 0) return;
    const left: unknown[] = [];
    for (const body of queue) {
      const { error } = await this.supabase.functions.invoke('submit-miss', { body: body as Record<string, unknown> });
      // A 4xx means the payload itself is refused; keeping it would retry forever.
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      if (error && !(status && status >= 400 && status < 500)) left.push(body);
    }
    writeMissQueue(left);
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }
}

function readMissQueue(): unknown[] {
  try {
    const v = JSON.parse(localStorage.getItem(MISS_QUEUE_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeMissQueue(q: unknown[]): void {
  try {
    localStorage.setItem(MISS_QUEUE_KEY, JSON.stringify(q.slice(-50)));
  } catch {
    // Storage blocked: the miss is lost, logging is unaffected.
  }
}
