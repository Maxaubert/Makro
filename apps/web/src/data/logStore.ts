// The local log store: a SQLite file in OPFS with the log-schema v1 tables and an outbox.
// Every save lands here first, so logging works without a connection (rule 5, decision 8).
// The sync loop (sync.ts) drains the outbox through sync_push and applies sync_pull pages.
import type { CustomFoodRow, FavouriteRow, FoodKey, GoalWriteRow, LogEntryRow, Meal, SavedMealItemRow, SavedMealRow, WeightEntryRow } from '../domain/entry';
import { MEALS } from '../domain/entry';
import type { AmountUnit } from '../domain/grams';
import type { Nutrient } from '../domain/nutrients';
import { columnsOf, isTableName, localSchemaSql, LOCAL_SCHEMA_VERSION, TABLE_NAMES, type Column, type TableName } from './logSchema';
import type { Sql, SqlValue } from './sql';

export type LocalLogEntry = LogEntryRow & { server_seq: number | null } & Record<`${Nutrient}_total`, number | null>;
export type PushRow = Record<string, string | number | boolean | null>;

export interface PopularityRow {
  product_id: string;
  users: number;
  logs: number;
}

const MAX_POPULARITY_ROWS = 1000;
const isCount = (n: unknown): boolean => Number.isInteger(n) && (n as number) >= 0;
/** Counts come from other people's logs, so only well-formed rows are kept. */
const validPopularity = (r: PopularityRow): boolean =>
  typeof r.product_id === 'string' && r.product_id.length > 0 && r.product_id.length <= 1024 && isCount(r.users) && isCount(r.logs);

export interface OutboxItem {
  table: TableName;
  id: string;
  version: number;
  row: PushRow;
}

export interface PushResult {
  table: string;
  id: string | null;
  status: 'applied' | 'stale' | 'rejected';
  server_seq?: number;
  reason?: string;
  tombstoned?: boolean;
}

export interface PulledRow {
  table: string;
  row: Record<string, unknown>;
}

export interface RecentFood {
  product_id: string | null;
  custom_food_id: string | null;
  name: string;
  brand: string | null;
  source: string;
  verified: 0 | 1 | null;
  per_100_unit: 'g' | 'ml';
  kcal: number | null;
  last_eaten_at: string;
}

export interface GoalRow {
  effective_from: string;
  kcal_target: number;
  protein_g_target: number;
  carbs_g_target: number;
  fat_g_target: number;
  fibre_g_target: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItemRow[];
}

export class LogStore {
  constructor(
    private readonly sql: Sql,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  migrate(): void {
    this.sql.tx(() => {
      this.sql.run(localSchemaSql());
      this.sql.run(`pragma user_version = ${LOCAL_SCHEMA_VERSION}`);
    });
  }

  schemaVersion(): number {
    return Number(this.sql.get<{ user_version: number }>('pragma user_version')?.user_version ?? 0);
  }

  hasTable(name: string): boolean {
    return !!this.sql.get("select 1 from sqlite_master where type = 'table' and name = ?", [name]);
  }

  // ---- writes (local first, then queued) -------------------------------------------------

  /** Insert or replace a full row and queue it for push, in one transaction. */
  save(table: TableName, row: Record<string, unknown>): void {
    const cols = columnsOf(table);
    this.sql.tx(() => {
      this.sql.run(
        `insert or replace into ${table} (${cols.map((c) => c.name).join(', ')}, server_seq)
         values (${cols.map(() => '?').join(', ')}, (select server_seq from ${table} where id = ?))`,
        [...cols.map((c) => toLocal(c, row[c.name])), String(row.id)],
      );
      this.enqueue(table, String(row.id));
    });
  }

  saveLogEntry(row: LogEntryRow): void {
    this.save('log_entries', row as unknown as Record<string, unknown>);
  }

  saveCustomFood(row: CustomFoodRow): void {
    this.save('custom_foods', row as unknown as Record<string, unknown>);
  }

  saveWeight(row: WeightEntryRow): void {
    this.save('weight_entries', row as unknown as Record<string, unknown>);
  }

  saveGoal(row: GoalWriteRow): void {
    this.save('goals', row as unknown as Record<string, unknown>);
  }

  /** Several entries at once: a whole meal is logged or none of it. */
  saveLogEntries(rows: LogEntryRow[]): void {
    this.sql.tx(() => {
      for (const row of rows) this.saveLogEntry(row);
    });
  }

  /** One live row per food (log-schema.md, Duplicates), so a double tap adds nothing. */
  addFavourite(row: FavouriteRow): void {
    this.sql.tx(() => {
      const kind = row.product_id !== null ? 'product' : 'custom';
      if (this.isFavourite(kind, [(row.product_id ?? row.custom_food_id) as string])) return;
      this.save('favourites', row as unknown as Record<string, unknown>);
    });
  }

  /** Remove a food from favourites under any of its ids, a merged product's old ids included. */
  removeFavourites(kind: 'product' | 'custom', ids: string[]): void {
    this.sql.tx(() => {
      for (const { id } of this.liveFavourites(kind, ids)) this.tombstone('favourites', id);
    });
  }

  /** A saved meal and its items, in one transaction. */
  saveSavedMeal(meal: SavedMealRow, items: SavedMealItemRow[]): void {
    this.sql.tx(() => {
      this.save('saved_meals', meal as unknown as Record<string, unknown>);
      for (const item of items) this.save('saved_meal_items', item as unknown as Record<string, unknown>);
    });
  }

  /** Without foreign keys the server does not cascade, so every item gets a tombstone too (log-schema.md). */
  deleteSavedMeal(id: string): void {
    this.sql.tx(() => {
      this.tombstone('saved_meals', id);
      for (const item of this.savedMealItems(id)) this.tombstone('saved_meal_items', item.id);
    });
  }

  /** Every live row, for the user's own download of their data. */
  exportAll(): Record<TableName, Record<string, SqlValue>[]> {
    const out = {} as Record<TableName, Record<string, SqlValue>[]>;
    for (const t of TABLE_NAMES) out[t] = this.sql.all<Record<string, SqlValue>>(`select * from ${t} where deleted_at is null`);
    return out;
  }

  /** Forget everything on this device, after the account is deleted. */
  wipe(): void {
    this.sql.tx(() => {
      for (const t of TABLE_NAMES) this.sql.run(`delete from ${t}`);
      this.sql.run('delete from outbox');
      this.sql.run('delete from outbox_rejected');
      this.sql.run('delete from sync_state');
    });
  }

  /** The account that finished first-run setup on this device, if any. */
  setupDoneFor(): string | null {
    return this.sql.get<{ value: string }>("select value from sync_state where key = 'setup_done_for'")?.value ?? null;
  }

  markSetupDone(userId: string): void {
    this.sql.run("insert into sync_state (key, value) values ('setup_done_for', ?) on conflict (key) do update set value = excluded.value", [userId]);
  }

  /** Edit the amount or meal of an entry. grams follows the amount; the snapshot stays. */
  updateLogEntry(id: string, patch: { quantity?: number; meal?: Meal }): void {
    this.sql.tx(() => {
      const row = this.sql.get<LocalLogEntry>('select * from log_entries where id = ?', [id]);
      if (!row) throw new Error(`no entry ${id}`);
      const next: Record<string, unknown> = { ...row };
      if (patch.meal !== undefined) {
        if (!MEALS.includes(patch.meal)) throw new Error(`unknown meal: ${patch.meal}`);
        next.meal = patch.meal;
      }
      if (patch.quantity !== undefined) {
        if (!Number.isFinite(patch.quantity) || patch.quantity < 0) throw new Error('amount must be 0 or more');
        const perUnit =
          row.unit === 'g' || row.unit === 'ml' ? 1 : row.quantity > 0 ? row.grams / row.quantity : null;
        if (perUnit === null) throw new Error('cannot rescale an entry with no amount; log it again');
        next.quantity = patch.quantity;
        next.grams = patch.quantity * perUnit;
      }
      next.updated_at = this.nextUpdatedAt(row.updated_at);
      this.save('log_entries', next);
    });
  }

  /** Delete by tombstone: set deleted_at (rows are never removed, log-schema.md). */
  tombstone(table: TableName, id: string): void {
    this.sql.tx(() => {
      const row = this.sql.get<Record<string, unknown>>(`select * from ${table} where id = ?`, [id]);
      if (!row || row.deleted_at) return;
      const ts = this.nextUpdatedAt(String(row.updated_at));
      this.save(table, { ...row, updated_at: ts, deleted_at: ts });
    });
  }

  private enqueue(table: TableName, id: string): void {
    this.sql.run(
      `insert into outbox (table_name, row_id, version, queued_at) values (?, ?, 1, ?)
       on conflict (table_name, row_id) do update set version = version + 1, queued_at = excluded.queued_at`,
      [table, id, this.clock().toISOString()],
    );
  }

  /** Now, but always later than the previous updated_at, so the server sees the edit as newer. */
  private nextUpdatedAt(previous: string): string {
    const now = this.clock().getTime();
    const prev = Date.parse(previous);
    return new Date(Number.isFinite(prev) && prev >= now ? prev + 1 : now).toISOString();
  }

  // ---- reads ------------------------------------------------------------------------------

  dayEntries(localDate: string): LocalLogEntry[] {
    return this.sql.all<LocalLogEntry>(
      'select * from log_entries where local_date = ? and deleted_at is null order by eaten_at, id',
      [localDate],
    );
  }

  logEntry(id: string): LocalLogEntry | null {
    return this.sql.get<LocalLogEntry>('select * from log_entries where id = ?', [id]) ?? null;
  }

  recentFoods(limit: number): RecentFood[] {
    return this.sql.all<RecentFood>(
      `select product_id, custom_food_id, name, brand, source, verified, per_100_unit, kcal, eaten_at as last_eaten_at
         from (select *, row_number() over (partition by coalesce(product_id, 'c:' || custom_food_id) order by eaten_at desc) as n
                 from log_entries where deleted_at is null)
        where n = 1 order by eaten_at desc limit ?`,
      [limit],
    );
  }

  /** Newest favourite first. Duplicates are possible until a sync settles them. */
  favourites(): FoodKey[] {
    return this.sql.all<FoodKey>('select product_id, custom_food_id from favourites where deleted_at is null order by created_at desc, id desc');
  }

  isFavourite(kind: 'product' | 'custom', ids: string[]): boolean {
    return this.liveFavourites(kind, ids).length > 0;
  }

  private liveFavourites(kind: 'product' | 'custom', ids: string[]): { id: string }[] {
    if (ids.length === 0) return [];
    const col = kind === 'product' ? 'product_id' : 'custom_food_id';
    return this.sql.all<{ id: string }>(`select id from favourites where ${col} in (${ids.map(() => '?').join(', ')}) and deleted_at is null`, ids);
  }

  /** Saved meals with at least one live item, newest first. */
  savedMeals(): SavedMeal[] {
    const meals = this.sql.all<{ id: string; name: string }>('select id, name from saved_meals where deleted_at is null order by created_at desc, id desc');
    return meals.map((m) => ({ ...m, items: this.savedMealItems(m.id) })).filter((m) => m.items.length > 0);
  }

  savedMeal(id: string): SavedMeal | null {
    const meal = this.sql.get<{ id: string; name: string }>('select id, name from saved_meals where id = ? and deleted_at is null', [id]);
    return meal ? { ...meal, items: this.savedMealItems(id) } : null;
  }

  private savedMealItems(savedMealId: string): SavedMealItemRow[] {
    return this.sql.all<SavedMealItemRow>('select * from saved_meal_items where saved_meal_id = ? and deleted_at is null order by sort_order, id', [savedMealId]);
  }

  /** The newest snapshot held for a food. A deleted entry still counts, but only after every live one. */
  latestSnapshot(key: FoodKey): LocalLogEntry | null {
    const [col, id] = key.product_id !== null ? ['product_id', key.product_id] : ['custom_food_id', key.custom_food_id];
    return (
      this.sql.get<LocalLogEntry>(`select * from log_entries where ${col} = ? order by deleted_at is not null, eaten_at desc, id desc limit 1`, [id]) ?? null
    );
  }

  /** How many live entries each product has, for ranking search. */
  productCounts(): { product_id: string; n: number }[] {
    return this.sql.all<{ product_id: string; n: number }>(
      'select product_id, count(*) as n from log_entries where deleted_at is null and product_id is not null group by product_id order by product_id',
    );
  }

  /** The last downloaded counts across all users; empty until the first download. */
  popularity(): PopularityRow[] {
    const v = this.sql.get<{ value: string }>("select value from sync_state where key = 'popularity'")?.value;
    return v ? (JSON.parse(v) as PopularityRow[]) : [];
  }

  popularityStale(maxAgeMs: number): boolean {
    const at = this.sql.get<{ value: string }>("select value from sync_state where key = 'popularity_at'")?.value;
    return at === undefined || this.clock().getTime() - Number(at) > maxAgeMs;
  }

  savePopularity(rows: PopularityRow[]): void {
    const put = "insert into sync_state (key, value) values (?, ?) on conflict (key) do update set value = excluded.value";
    this.sql.tx(() => {
      this.sql.run(put, ['popularity', JSON.stringify(rows.filter(validPopularity).slice(0, MAX_POPULARITY_ROWS))]);
      this.sql.run(put, ['popularity_at', String(this.clock().getTime())]);
    });
  }

  /** The amount and unit of the newest live entry for a food, so the portion screen can start there. */
  lastPortion(kind: 'product' | 'custom', ids: string[]): { quantity: number; unit: AmountUnit } | null {
    if (ids.length === 0) return null;
    const col = kind === 'product' ? 'product_id' : 'custom_food_id';
    return (
      this.sql.get<{ quantity: number; unit: AmountUnit }>(
        `select quantity, unit from log_entries where ${col} in (${ids.map(() => '?').join(', ')}) and deleted_at is null order by eaten_at desc, id desc limit 1`,
        ids,
      ) ?? null
    );
  }

  customFood(id: string): CustomFoodRow | null {
    return this.sql.get<CustomFoodRow>('select * from custom_foods where id = ?', [id]) ?? null;
  }

  customFoods(): CustomFoodRow[] {
    return this.sql.all<CustomFoodRow>('select * from custom_foods where deleted_at is null order by name, id');
  }

  weights(limit: number): (WeightEntryRow & { server_seq: number | null })[] {
    return this.sql.all('select * from weight_entries where deleted_at is null order by measured_at desc, id desc limit ?', [limit]);
  }

  /** The goal in force on a day (written by the phone; the web never sets goals). */
  goalFor(localDate: string): GoalRow | null {
    return (
      this.sql.get<GoalRow>(
        `select effective_from, kcal_target, protein_g_target, carbs_g_target, fat_g_target, fibre_g_target
           from goals where deleted_at is null and effective_from <= ? order by effective_from desc limit 1`,
        [localDate],
      ) ?? null
    );
  }

  pendingCount(): number {
    return Number(this.sql.get<{ n: number }>('select count(*) as n from outbox')?.n ?? 0);
  }

  rejected(): { table_name: string; row_id: string; reason: string; rejected_at: string }[] {
    return this.sql.all('select * from outbox_rejected order by rejected_at desc');
  }

  // ---- sync -------------------------------------------------------------------------------

  /** The oldest queued changes as full rows in the push encoding. */
  outboxBatch(limit: number): OutboxItem[] {
    const items = this.sql.all<{ table_name: string; row_id: string; version: number }>(
      'select table_name, row_id, version from outbox order by queued_at, table_name, row_id limit ?',
      [limit],
    );
    const out: OutboxItem[] = [];
    for (const it of items) {
      if (!isTableName(it.table_name)) continue;
      const row = this.sql.get<Record<string, SqlValue>>(`select * from ${it.table_name} where id = ?`, [it.row_id]);
      if (!row) continue;
      out.push({ table: it.table_name, id: it.row_id, version: Number(it.version), row: toPush(columnsOf(it.table_name), row) });
    }
    return out;
  }

  /** Apply sync_push results to the items that were sent. */
  ackPush(sent: OutboxItem[], results: PushResult[]): void {
    const byKey = new Map(results.map((r) => [`${r.table}/${r.id}`, r]));
    this.sql.tx(() => {
      for (const item of sent) {
        const r = byKey.get(`${item.table}/${item.id}`);
        if (!r) {
          this.sql.run('update outbox set attempts = attempts + 1 where table_name = ? and row_id = ?', [item.table, item.id]);
          continue;
        }
        if (r.status === 'applied' && typeof r.server_seq === 'number') {
          this.sql.run(`update ${item.table} set server_seq = ? where id = ?`, [r.server_seq, item.id]);
        }
        if (r.status === 'rejected') {
          this.sql.run('insert into outbox_rejected (table_name, row_id, reason, rejected_at) values (?, ?, ?, ?)', [
            item.table,
            item.id,
            r.reason ?? 'rejected',
            this.clock().toISOString(),
          ]);
        }
        // Clear only if nothing changed since this version was read.
        this.sql.run('delete from outbox where table_name = ? and row_id = ? and version = ?', [item.table, item.id, item.version]);
      }
    });
  }

  /**
   * One local log belongs to one account. A different account may take over only a log with
   * nothing left to sync; the old rows are then cleared (they are safe on the server).
   */
  claimOwner(userId: string): 'claimed' | 'same' | 'switched' {
    return this.sql.tx(() => {
      const owner = this.sql.get<{ value: string }>("select value from sync_state where key = 'owner'")?.value;
      if (owner === userId) return 'same';
      if (owner !== undefined && this.pendingCount() > 0) {
        throw new Error(
          'This browser holds changes from another account that are not synced yet. Sign in with that account first.',
        );
      }
      if (owner !== undefined) {
        for (const t of TABLE_NAMES) this.sql.run(`delete from ${t}`);
        this.sql.run('delete from outbox_rejected');
        this.sql.run("delete from sync_state where key = 'pull_cursor'");
      }
      this.sql.run(
        "insert into sync_state (key, value) values ('owner', ?) on conflict (key) do update set value = excluded.value",
        [userId],
      );
      return owner === undefined ? 'claimed' : 'switched';
    });
  }

  cursor(): number {
    const v = this.sql.get<{ value: string }>("select value from sync_state where key = 'pull_cursor'");
    return v ? Number(v.value) : 0;
  }

  /**
   * One sync_pull page and its cursor, in one transaction (SYNC.md). The server copy wins unless
   * this row has a change waiting in the outbox and the local copy is later (server wins ties).
   * A row with nothing to push always takes the server copy: the server clamps updated_at to its
   * own clock, so comparing against a local updated_at from a fast clock would skip later edits
   * for good once the cursor moves past them.
   */
  applyPullPage(rows: PulledRow[], cursor: number): void {
    this.sql.tx(() => {
      for (const { table, row } of rows) {
        if (!isTableName(table) || typeof row?.id !== 'string') continue;
        const cols = columnsOf(table);
        const incoming = cols.map((c) => toLocal(c, row[c.name]));
        const updatedAt = incoming[cols.findIndex((c) => c.name === 'updated_at')] as string;
        const local = this.sql.get<{ updated_at: string; pending: number }>(
          `select t.updated_at, exists (select 1 from outbox o where o.table_name = ? and o.row_id = t.id) as pending
             from ${table} t where t.id = ?`,
          [table, row.id],
        );
        if (local && Number(local.pending) === 1 && local.updated_at > updatedAt) continue;
        this.sql.run(
          `insert or replace into ${table} (${cols.map((c) => c.name).join(', ')}, server_seq) values (${cols.map(() => '?').join(', ')}, ?)`,
          [...incoming, row.server_seq === undefined || row.server_seq === null ? null : Number(row.server_seq)],
        );
      }
      this.sql.run(
        "insert into sync_state (key, value) values ('pull_cursor', ?) on conflict (key) do update set value = excluded.value",
        [String(cursor)],
      );
    });
  }
}

/** A value in the local SQLite encoding. Timestamps become ISO 8601 UTC with ms and Z. */
function toLocal(col: Column, v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  switch (col.kind) {
    case 'timestamp': {
      const ms = Date.parse(String(v));
      if (!Number.isFinite(ms)) throw new Error(`${col.name}: not a timestamp: ${String(v)}`);
      return new Date(ms).toISOString();
    }
    case 'date':
      return String(v).slice(0, 10);
    case 'flag':
      return v === true || v === 1 || v === '1' ? 1 : 0;
    case 'real':
    case 'int':
      return Number(v);
    default:
      return String(v);
  }
}

/** A local row in the push encoding: every contract column, flags as booleans. */
function toPush(cols: Column[], row: Record<string, SqlValue>): PushRow {
  const out: PushRow = {};
  for (const c of cols) {
    const v = row[c.name];
    if (v === null || v === undefined) out[c.name] = null;
    else if (c.kind === 'flag') out[c.name] = Number(v) === 1;
    else if (c.kind === 'real' || c.kind === 'int') out[c.name] = Number(v);
    else out[c.name] = String(v);
  }
  return out;
}

