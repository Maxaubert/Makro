// The app's services, made once: Supabase client, database worker, product file, sync loop.
// Screens read them through React hooks (./hooks.ts).
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { syncProductFile, type LatestJson } from '../data/productFile';
import type { ProductMeta } from '../data/products';
import { SyncScheduler, syncOnce, type SyncStatus } from '../data/sync';
import { buildMissPayload, type CustomFoodRow, type GoalWriteRow, type MissType, type WeightEntryRow } from '../domain/entry';
import { createDb, type Db } from './db';
import { flushMissQueue } from './misses';
import { guardOwner, ownerReady } from './owner';
import { CONSENT_TEXT_VERSION, resolveSetup, type SetupState } from './setup';

export const APP_VERSION = `web-${__APP_VERSION__}`;

export type ProductState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; meta: ProductMeta; note?: string }
  | { status: 'error'; message: string };

export interface AppState {
  session: Session | null;
  authReady: boolean;
  /** The user the local log is claimed for. Data screens and syncs wait until it equals the session user. */
  owner: string | null;
  /** First-run consent and goal. The app opens only when this is done. */
  setup: SetupState;
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

const CHECKING: SetupState = { status: 'checking', hasConsent: false, hasGoal: false };

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
      owner: null,
      setup: CHECKING,
      products: { status: 'loading', message: 'Opening your log' },
      sync: this.scheduler.getStatus(),
      pending: 0,
      dataVersion: 0,
      fatal: null,
    };
    this.scheduler.subscribe((sync) => this.set({ sync }));
    this.supabase.auth.onAuthStateChange((_event, session) => {
      const was = this.state.session?.user.id;
      const changedUser = session?.user.id !== was;
      // A different (or no) user: forget the claim first, so no screen or sync uses the old log.
      this.set(changedUser ? { session, authReady: true, owner: null, setup: CHECKING } : { session, authReady: true });
      if (!session) this.scheduler.stop();
      else if (changedUser) void this.afterSignIn();
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
      // The user may have changed while the claim ran; that sign-in starts its own claim.
      if (this.state.session?.user.id !== userId) return;
      this.set({ fatal: null, owner: userId, dataVersion: this.state.dataVersion + 1 });
    } catch (e) {
      this.set({ fatal: e instanceof Error ? e.message : String(e) });
      return;
    }
    await this.refreshPending();
    await this.checkSetup();
    await this.loadProducts();
  }

  /** Decide whether first-run setup is needed. Nothing syncs until it is done. */
  async checkSetup(): Promise<void> {
    const userId = this.state.session?.user.id;
    if (!userId) return;
    this.set({ setup: CHECKING });
    const setup = await resolveSetup({ userId, doneFor: await this.db.setupDoneFor(), fetchFacts: () => this.setupFacts() });
    if (this.state.session?.user.id !== userId) return;
    this.set({ setup });
    if (setup.status === 'done') await this.afterSetup(userId);
  }

  private async setupFacts() {
    const [consent, goal] = await Promise.all([
      this.supabase.from('consents').select('id').eq('kind', 'health_data').is('withdrawn_at', null).limit(1),
      this.supabase.from('goals').select('id').is('deleted_at', null).limit(1),
    ]);
    if (consent.error) throw new Error(consent.error.message);
    if (goal.error) throw new Error(goal.error.message);
    return { hasConsent: consent.data.length > 0, hasGoal: goal.data.length > 0 };
  }

  private async afterSetup(userId: string): Promise<void> {
    await this.db.markSetupDone(userId);
    // After a sign-out the scheduler is stopped; start() brings back the timer and the
    // reconnect listener; when it is already running, start() just syncs now.
    this.scheduler.start();
  }

  /** Record explicit consent. Already having an active one counts as success. */
  async giveConsent(choice: { popularity: boolean }): Promise<void> {
    const kinds = choice.popularity ? ['health_data', 'popularity'] : ['health_data'];
    for (const kind of kinds) {
      const { error } = await this.supabase.from('consents').insert({ kind, text_version: CONSENT_TEXT_VERSION });
      if (error && error.code !== '23505') throw new Error(`Could not save your choice. Check your connection and try again. (${error.message})`);
    }
    this.set({ setup: { ...this.state.setup, hasConsent: true } });
  }

  /** Whether the optional popularity consent is active; null when that cannot be checked. */
  async popularityOn(): Promise<boolean | null> {
    const { data, error } = await this.supabase.from('consents').select('id').eq('kind', 'popularity').is('withdrawn_at', null).limit(1);
    return error ? null : data.length > 0;
  }

  async setPopularity(on: boolean): Promise<void> {
    if (on) {
      const { error } = await this.supabase.from('consents').insert({ kind: 'popularity', text_version: CONSENT_TEXT_VERSION });
      if (error && error.code !== '23505') throw new Error(error.message);
      return;
    }
    // The server replaces the time with its own (consents_stamp_withdrawal).
    const { error } = await this.supabase.from('consents').update({ withdrawn_at: new Date().toISOString() }).eq('kind', 'popularity').is('withdrawn_at', null);
    if (error) throw new Error(error.message);
  }

  /** Everything Makro holds about the user, as JSON text. */
  async exportData(): Promise<string> {
    const rows = await this.db.exportAll();
    const { data: consents, error } = await this.supabase.from('consents').select('kind, text_version, granted_at, withdrawn_at');
    if (error) throw new Error(`Could not reach the server for your consent history. (${error.message})`);
    return JSON.stringify({ exported_at: new Date().toISOString(), email: this.state.session?.user.email ?? null, consents, ...rows }, null, 2);
  }

  /** Withdraw consent: delete the account and its data on the server, then on this device. */
  async deleteAccount(): Promise<void> {
    const { error } = await this.supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) throw new Error(`Nothing was deleted. Check your connection and try again. (${error.message})`);
    this.scheduler.stop();
    await this.db.wipe();
    localStorage.removeItem(MISS_QUEUE_KEY);
    await this.supabase.auth.signOut({ scope: 'local' });
  }

  /** Save the first goal and weight (null when a goal already exists) and open the app. */
  async finishSetup(first: { goal: GoalWriteRow; weight: WeightEntryRow } | null): Promise<void> {
    const userId = this.state.session?.user.id;
    if (!userId) return;
    if (first) {
      await this.db.saveGoal(first.goal);
      await this.db.saveWeight(first.weight);
    }
    await this.refreshPending();
    await this.afterSetup(userId);
    this.set({ setup: { status: 'done', hasConsent: true, hasGoal: true }, dataVersion: this.state.dataVersion + 1 });
    window.location.hash = '#/today';
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
    const runOwner = this.state.owner;
    if (!runOwner || !ownerReady(this.state.session?.user.id ?? null, runOwner)) return;
    await this.openDb();
    const current = () => ({ session: this.state.session?.user.id ?? null, owner: this.state.owner });
    // Every RPC, and every result, is checked against the user this run started for.
    const report = await syncOnce(this.db, guardOwner(current, runOwner, async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await this.supabase.rpc(fn, args);
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data;
    }));
    await this.refreshPending();
    if (report.pulled > 0 || report.pushed > 0) this.set({ dataVersion: this.state.dataVersion + 1 });
    await this.flushMisses();
    await this.refreshPopularity();
  }

  /** Counts across all users, at most once a day. Only a ranking hint, so a failure is ignored. */
  private async refreshPopularity(): Promise<void> {
    try {
      if (!(await this.db.popularityStale(24 * 60 * 60_000))) return;
      const { data, error } = await this.supabase.rpc('product_popularity');
      if (!error && Array.isArray(data)) await this.db.savePopularity(data);
    } catch {
      // Search works without it.
    }
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
    await flushMissQueue({ read: readMissQueue as () => { id?: string }[], write: writeMissQueue }, async (body) => {
      const { error } = await this.supabase.functions.invoke('submit-miss', { body: body as Record<string, unknown> });
      return error;
    });
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
