// The synced tables of packages/contracts/log-schema.md v1, as one column list per table.
// It drives the local SQLite DDL (the same shape as the phone's log.sqlite), the push payload
// and the reading of pulled rows, so the three cannot drift apart.
// SQLite encodings from the contract: ids and timestamps are text, flags are 0/1 integers,
// real numbers are 8-byte doubles. Nutrients are nullable: NULL means unknown, never 0.
import { NUTRIENTS } from '../domain/nutrients';

export type ColumnKind = 'id' | 'text' | 'real' | 'int' | 'flag' | 'timestamp' | 'date';

export interface Column {
  name: string;
  kind: ColumnKind;
  nullable: boolean;
}

const c = (name: string, kind: ColumnKind, nullable = false): Column => ({ name, kind, nullable });
const nutrientColumns = NUTRIENTS.map((n) => c(n, 'real', true));

export const SYNC_COLUMNS: Column[] = [
  c('id', 'id'),
  c('created_at', 'timestamp'),
  c('updated_at', 'timestamp'),
  c('deleted_at', 'timestamp', true),
];

export const TABLES = {
  log_entries: [
    c('eaten_at', 'timestamp'),
    c('tz', 'text'),
    c('local_date', 'date'),
    c('meal', 'text'),
    c('quantity', 'real'),
    c('unit', 'text'),
    c('grams', 'real'),
    c('product_id', 'text', true),
    c('custom_food_id', 'id', true),
    c('name', 'text'),
    c('brand', 'text', true),
    c('source', 'text'),
    c('ean', 'text', true),
    c('db_version', 'text', true),
    c('verified', 'flag', true),
    c('per_100_unit', 'text'),
    ...nutrientColumns,
  ],
  custom_foods: [
    c('name', 'text'),
    c('brand', 'text', true),
    c('ean', 'text', true),
    c('serving_g', 'real', true),
    c('per_100_unit', 'text'),
    ...nutrientColumns,
  ],
  saved_meals: [c('name', 'text')],
  saved_meal_items: [
    c('saved_meal_id', 'id'),
    c('sort_order', 'int'),
    c('product_id', 'text', true),
    c('custom_food_id', 'id', true),
    c('quantity', 'real'),
    c('unit', 'text'),
    c('grams', 'real'),
    c('name', 'text'),
  ],
  favourites: [c('product_id', 'text', true), c('custom_food_id', 'id', true)],
  goals: [
    c('effective_from', 'date'),
    c('goal_type', 'text'),
    c('kcal_target', 'real'),
    c('protein_g_target', 'real'),
    c('carbs_g_target', 'real'),
    c('fat_g_target', 'real'),
    c('fibre_g_target', 'real'),
    c('target_weight_kg', 'real', true),
    c('pace_kg_per_week', 'real', true),
    c('sex', 'text', true),
    c('birth_year', 'int', true),
    c('height_cm', 'real', true),
    c('activity_level', 'text', true),
    c('weight_kg', 'real', true),
  ],
  weight_entries: [
    c('measured_at', 'timestamp'),
    c('tz', 'text'),
    c('local_date', 'date'),
    c('weight_kg', 'real'),
    c('source', 'text'),
    c('external_id', 'text', true),
  ],
} satisfies Record<string, Column[]>;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

export function columnsOf(table: TableName): Column[] {
  return [...SYNC_COLUMNS, ...TABLES[table]];
}

export function isTableName(name: string): name is TableName {
  return Object.hasOwn(TABLES, name);
}

const SQL_TYPE: Record<ColumnKind, string> = {
  id: 'text',
  text: 'text',
  real: 'real',
  int: 'integer',
  flag: 'integer',
  timestamp: 'text',
  date: 'text',
};

/** The local schema, version 1 (pragma user_version). */
export function localSchemaSql(): string {
  const parts: string[] = [];
  for (const table of TABLE_NAMES) {
    const cols = columnsOf(table).map(
      (col) => `  ${col.name} ${SQL_TYPE[col.kind]}${col.name === 'id' ? ' primary key' : col.nullable ? '' : ' not null'}`,
    );
    // Server-only cursor position, kept so the UI can tell what has reached the server.
    cols.push('  server_seq integer');
    if (table === 'log_entries') {
      // Generated, unrounded totals, the same formula as the server (log-schema.md).
      for (const n of NUTRIENTS) cols.push(`  ${n}_total real generated always as (${n} * grams / 100) stored`);
    }
    parts.push(`create table if not exists ${table} (\n${cols.join(',\n')}\n);`);
  }
  parts.push('create index if not exists log_entries_day on log_entries (local_date) where deleted_at is null;');
  parts.push('create index if not exists weight_entries_day on weight_entries (local_date) where deleted_at is null;');
  // The outbox: one item per changed row. `version` grows on every local change, so a push
  // result only clears the item when no newer change happened while the push was in flight.
  parts.push(`create table if not exists outbox (
  table_name text not null,
  row_id text not null,
  version integer not null,
  queued_at text not null,
  attempts integer not null default 0,
  primary key (table_name, row_id)
);`);
  parts.push(`create table if not exists outbox_rejected (
  table_name text not null,
  row_id text not null,
  reason text not null,
  rejected_at text not null
);`);
  parts.push('create table if not exists sync_state (key text primary key, value text not null);');
  return parts.join('\n');
}

export const LOCAL_SCHEMA_VERSION = 1;
