-- Sync backend (#34): each user's own data, in the shape of packages/contracts/log-schema.md v1.
-- Clients write only through sync_push and read through sync_pull (docs/SYNC.md).
-- The rules live in the database, so no client can break them:
--   * user_id and server_seq are set by the server; whatever a client sends is ignored
--   * updated_at is clamped to the server clock, in milliseconds
--   * last-write-wins on updated_at; on a tie the stored copy stays
--   * server_seq comes from one counter row per user, locked for the transaction, so a pull never skips a row
--   * no DELETE grant: deleting means setting deleted_at (a tombstone)
-- Nutrients are double precision and nullable: NULL means unknown, never 0.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Per-user write counter. Not readable or writable by clients.
-- ---------------------------------------------------------------------------
create table public.sync_counters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  seq bigint not null default 0
);
alter table public.sync_counters enable row level security;
revoke all on public.sync_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The 7 synced tables. Every one starts with the same sync fields.
-- No foreign keys on reference columns (custom_food_id, saved_meal_id): a pull page may
-- deliver a child before its parent (log-schema.md).
-- ---------------------------------------------------------------------------
create table public.log_entries (
  id uuid primary key constraint log_entries_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  eaten_at timestamptz not null,
  tz text not null,
  local_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity double precision not null check (quantity >= 0),
  unit text not null check (unit in ('g', 'ml', 'piece', 'serving')),
  grams double precision not null check (grams >= 0),
  product_id text,
  custom_food_id uuid,
  name text not null,
  brand text,
  source text not null,
  ean text,
  db_version text,
  verified boolean,
  per_100_unit text not null check (per_100_unit in ('g', 'ml')),
  kcal double precision,
  protein_g double precision,
  fat_g double precision,
  sat_fat_g double precision,
  carbs_g double precision,
  sugars_g double precision,
  fibre_g double precision,
  salt_g double precision,
  -- Generated, stored, unrounded. NULL when the per-100 value is NULL (log-schema.md, decision 31 as narrowed by #50).
  kcal_total double precision generated always as (kcal * grams / 100) stored,
  protein_g_total double precision generated always as (protein_g * grams / 100) stored,
  fat_g_total double precision generated always as (fat_g * grams / 100) stored,
  sat_fat_g_total double precision generated always as (sat_fat_g * grams / 100) stored,
  carbs_g_total double precision generated always as (carbs_g * grams / 100) stored,
  sugars_g_total double precision generated always as (sugars_g * grams / 100) stored,
  fibre_g_total double precision generated always as (fibre_g * grams / 100) stored,
  salt_g_total double precision generated always as (salt_g * grams / 100) stored,
  constraint log_entries_one_food check ((product_id is null) <> (custom_food_id is null))
);

create table public.custom_foods (
  id uuid primary key constraint custom_foods_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  name text not null,
  brand text,
  ean text,
  serving_g double precision check (serving_g > 0),
  per_100_unit text not null check (per_100_unit in ('g', 'ml')),
  kcal double precision,
  protein_g double precision,
  fat_g double precision,
  sat_fat_g double precision,
  carbs_g double precision,
  sugars_g double precision,
  fibre_g double precision,
  salt_g double precision
);

create table public.saved_meals (
  id uuid primary key constraint saved_meals_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  name text not null
);

create table public.saved_meal_items (
  id uuid primary key constraint saved_meal_items_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  saved_meal_id uuid not null,
  sort_order integer not null,
  product_id text,
  custom_food_id uuid,
  quantity double precision not null check (quantity >= 0),
  unit text not null check (unit in ('g', 'ml', 'piece', 'serving')),
  grams double precision not null check (grams >= 0),
  name text not null,
  constraint saved_meal_items_one_food check ((product_id is null) <> (custom_food_id is null))
);

create table public.favourites (
  id uuid primary key constraint favourites_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  product_id text,
  custom_food_id uuid,
  constraint favourites_one_food check ((product_id is null) <> (custom_food_id is null))
);

create table public.goals (
  id uuid primary key constraint goals_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  effective_from date not null,
  goal_type text not null check (goal_type in ('lose', 'maintain', 'gain')),
  kcal_target double precision not null,
  protein_g_target double precision not null,
  carbs_g_target double precision not null,
  fat_g_target double precision not null,
  fibre_g_target double precision not null,
  target_weight_kg double precision,
  pace_kg_per_week double precision,
  sex text,
  birth_year integer,
  height_cm double precision,
  activity_level text,
  weight_kg double precision
);

create table public.weight_entries (
  id uuid primary key constraint weight_entries_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  measured_at timestamptz not null,
  tz text not null,
  local_date date not null,
  weight_kg double precision not null check (weight_kg > 0),
  source text not null check (source in ('manual', 'apple_health')),
  external_id text
);

-- The pull cursor: one sequence per user across all tables.
create unique index log_entries_user_seq on public.log_entries (user_id, server_seq);
create unique index custom_foods_user_seq on public.custom_foods (user_id, server_seq);
create unique index saved_meals_user_seq on public.saved_meals (user_id, server_seq);
create unique index saved_meal_items_user_seq on public.saved_meal_items (user_id, server_seq);
create unique index favourites_user_seq on public.favourites (user_id, server_seq);
create unique index goals_user_seq on public.goals (user_id, server_seq);
create unique index weight_entries_user_seq on public.weight_entries (user_id, server_seq);

-- Day totals group by local_date.
create index log_entries_user_day on public.log_entries (user_id, local_date) where deleted_at is null;

-- Natural keys: at most one live row per key (log-schema.md, Duplicates). sync_push tombstones the loser.
create unique index favourites_live_product on public.favourites (user_id, product_id)
  where deleted_at is null and product_id is not null;
create unique index favourites_live_custom_food on public.favourites (user_id, custom_food_id)
  where deleted_at is null and custom_food_id is not null;
create unique index goals_live_effective_from on public.goals (user_id, effective_from)
  where deleted_at is null;
create unique index weight_entries_live_external on public.weight_entries (user_id, source, external_id)
  where deleted_at is null and external_id is not null;

-- ---------------------------------------------------------------------------
-- The write trigger: server fields, clock clamp, last-write-wins, cursor.
-- Security definer only so it can bump sync_counters, which clients cannot touch.
-- ---------------------------------------------------------------------------
create function private.sync_row_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_seq bigint;
begin
  if tg_op = 'INSERT' then
    -- A signed-in client is always written as itself. Only a trusted role with no JWT may name the user.
    new.user_id := coalesce(auth.uid(), new.user_id);
    if new.user_id is null then
      raise exception 'sync: no signed-in user' using errcode = '42501';
    end if;
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;

  if new.updated_at is null then
    raise exception 'sync: updated_at is required' using errcode = '23502';
  end if;
  if not isfinite(new.updated_at) then
    raise exception 'sync: updated_at must be a finite timestamp' using errcode = '22023';
  end if;
  new.updated_at := date_trunc('milliseconds', least(new.updated_at, now()));

  -- Last-write-wins: an update that is not strictly newer is skipped (tie: the stored copy stays).
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;

  -- The per-user counter row, locked until commit, so writes for one user are serialised
  -- and server_seq is visible in commit order.
  insert into public.sync_counters (user_id) values (new.user_id) on conflict (user_id) do nothing;
  select c.seq + 1 into next_seq from public.sync_counters c where c.user_id = new.user_id for update;
  update public.sync_counters set seq = next_seq where user_id = new.user_id;
  new.server_seq := next_seq;
  return new;
end;
$$;
revoke all on function private.sync_row_write() from public;

create trigger sync_row_write before insert or update on public.log_entries for each row execute function private.sync_row_write();
create trigger sync_row_write before insert or update on public.custom_foods for each row execute function private.sync_row_write();
create trigger sync_row_write before insert or update on public.saved_meals for each row execute function private.sync_row_write();
create trigger sync_row_write before insert or update on public.saved_meal_items for each row execute function private.sync_row_write();
create trigger sync_row_write before insert or update on public.favourites for each row execute function private.sync_row_write();
create trigger sync_row_write before insert or update on public.goals for each row execute function private.sync_row_write();
create trigger sync_row_write before insert or update on public.weight_entries for each row execute function private.sync_row_write();

-- ---------------------------------------------------------------------------
-- Row-level security and grants: own rows only, no DELETE, nothing for anon.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['log_entries', 'custom_foods', 'saved_meals', 'saved_meal_items', 'favourites', 'goals', 'weight_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy "own rows: select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers for the RPCs (schema private is not exposed through the API)
-- ---------------------------------------------------------------------------

-- The sync protocol version, separate from the phone's pragma user_version. Raise the
-- maximum when the protocol changes; raise the minimum to refuse clients that are too old.
create function private.sync_check_protocol(protocol int)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  min_protocol constant int := 1;
  max_protocol constant int := 1;
begin
  if protocol is null or protocol < min_protocol then
    raise exception 'sync protocol % is not supported: this server accepts % to %. Update the app.',
      coalesce(protocol::text, 'null'), min_protocol, max_protocol using errcode = '22023';
  end if;
  if protocol > max_protocol then
    raise exception 'sync protocol % is newer than this server (it accepts % to %)',
      protocol, min_protocol, max_protocol using errcode = '22023';
  end if;
end;
$$;

-- Takes the caller's counter row FOR UPDATE for the rest of the transaction, so two pushes
-- from one user never interleave (natural-key checks stay correct).
create function private.sync_lock_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sync: no signed-in user' using errcode = '42501';
  end if;
  insert into public.sync_counters (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  perform 1 from public.sync_counters where user_id = auth.uid() for update;
end;
$$;

-- Applies one pushed row as the caller (RLS applies). Returns its result object.
create function private.sync_apply_row(tbl text, r jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rid uuid;
  ts timestamptz;
  existing jsonb;
  merged jsonb;
  cols text;
  pcols text;
  key_cond text;
  other record;
  new_seq bigint;
  tombstoned boolean := false;
begin
  if r is null or jsonb_typeof(r) <> 'object' then
    return jsonb_build_object('table', tbl, 'id', null, 'status', 'rejected', 'reason', 'a row must be a JSON object');
  end if;

  begin
    rid := (r ->> 'id')::uuid;
  exception when invalid_text_representation then
    rid := null;
  end;
  if rid is null or substr(rid::text, 15, 1) <> '7' then
    return jsonb_build_object('table', tbl, 'id', r -> 'id', 'status', 'rejected', 'reason', 'id must be a UUIDv7');
  end if;

  -- The contract format only (ISO 8601 UTC with Z). This also refuses 'epoch', 'now', infinity
  -- and zone-less text, which Postgres would otherwise read in the session time zone.
  if jsonb_typeof(r -> 'updated_at') is distinct from 'string'
     or (r ->> 'updated_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$' then
    return jsonb_build_object('table', tbl, 'id', rid, 'status', 'rejected',
      'reason', 'updated_at must be ISO 8601 UTC with a Z, like 2026-10-20T08:15:30.123Z');
  end if;
  begin
    ts := (r ->> 'updated_at')::timestamptz;
  exception when data_exception then
    ts := null;
  end;
  if ts is null then
    return jsonb_build_object('table', tbl, 'id', rid, 'status', 'rejected',
      'reason', 'updated_at must be ISO 8601 UTC with a Z, like 2026-10-20T08:15:30.123Z');
  end if;
  -- The same clamp the trigger applies, so the comparisons below match what gets stored.
  ts := date_trunc('milliseconds', least(ts, now()));

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', tbl) into existing using rid;

  -- Last-write-wins. A retry of a row already stored is a tie, so it is stale: idempotent by id.
  if existing is not null and ts <= (existing ->> 'updated_at')::timestamptz then
    return jsonb_build_object('table', tbl, 'id', rid, 'status', 'stale', 'server_seq', (existing ->> 'server_seq')::bigint);
  end if;

  merged := coalesce(existing, '{}'::jsonb) || r;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg('p.' || quote_ident(a.attname), ', ' order by a.attnum)
    into cols, pcols
  from pg_attribute a
  where a.attrelid = format('public.%I', tbl)::regclass
    and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and a.attname not in ('user_id', 'server_seq');

  key_cond := case tbl
    when 'favourites' then '(t.product_id = ($2 ->> ''product_id'') or t.custom_food_id = ($2 ->> ''custom_food_id'')::uuid)'
    when 'goals' then 't.effective_from = ($2 ->> ''effective_from'')::date'
    when 'weight_entries' then '(t.source = ($2 ->> ''source'') and t.external_id = ($2 ->> ''external_id''))'
  end;

  begin
    -- Natural-key collision: the later updated_at stays live, the other is tombstoned. Never a unique-index error.
    if key_cond is not null and jsonb_typeof(coalesce(merged -> 'deleted_at', 'null'::jsonb)) = 'null' then
      for other in execute format(
        'select t.id, t.updated_at from public.%I t where t.deleted_at is null and t.id <> $1 and %s for update', tbl, key_cond)
        using rid, merged
      loop
        if ts > other.updated_at then
          execute format('update public.%I set deleted_at = $2, updated_at = $2 where id = $1', tbl) using other.id, ts;
        else
          r := r || jsonb_build_object('deleted_at', ts);
          tombstoned := true;
        end if;
      end loop;
    end if;

    if existing is null then
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) p returning server_seq',
        tbl, cols, pcols, tbl) into new_seq using r;
    else
      -- Keys the client left out keep their stored value.
      execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(t, $1) p) where t.id = $2 returning t.server_seq',
        tbl, cols, pcols) into new_seq using r, rid;
    end if;
  exception
    when unique_violation then
      return jsonb_build_object('table', tbl, 'id', rid, 'status', 'rejected', 'reason', 'id is already taken');
    when data_exception or integrity_constraint_violation then
      return jsonb_build_object('table', tbl, 'id', rid, 'status', 'rejected', 'reason', sqlerrm);
  end;

  if new_seq is null then
    -- The trigger skipped it (only possible if a newer copy landed meanwhile).
    return jsonb_build_object('table', tbl, 'id', rid, 'status', 'stale');
  end if;

  return jsonb_build_object('table', tbl, 'id', rid, 'status', 'applied', 'server_seq', new_seq)
    || case when tombstoned then jsonb_build_object('tombstoned', true) else '{}'::jsonb end;
end;
$$;

-- Rewrites every timestamptz key of a row into the wire format of log-schema.md v1:
-- ISO 8601 UTC with milliseconds and Z ('2026-10-20T08:15:30.123Z'), whatever the session
-- time zone. to_jsonb alone would give '2026-10-20T10:15:30.12+02:00', which does not sort
-- as text against the phone's stored values.
create function private.sync_wire(r jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select r || coalesce(jsonb_object_agg(k,
      to_char((r ->> k)::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), '{}'::jsonb)
  from unnest(array['created_at', 'updated_at', 'deleted_at', 'eaten_at', 'measured_at']) k
  where jsonb_typeof(r -> k) = 'string'
$$;

revoke all on function private.sync_check_protocol(int) from public;
revoke all on function private.sync_lock_user() from public;
revoke all on function private.sync_apply_row(text, jsonb) from public;
grant execute on function private.sync_check_protocol(int) to authenticated;
grant execute on function private.sync_lock_user() to authenticated;
grant execute on function private.sync_apply_row(text, jsonb) to authenticated;
revoke all on function private.sync_wire(jsonb) from public;
grant execute on function private.sync_wire(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: sync_push(protocol, changes)
-- changes = {"<table>": [row, ...], ...}. Returns {"protocol": n, "results": [{table, id, status, server_seq?, reason?, tombstoned?}]}.
-- One transaction; status is applied, stale or rejected per row.
-- ---------------------------------------------------------------------------
create function public.sync_push(protocol int, changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Fixed order; parents first, although nothing depends on it (no foreign keys).
  synced constant text[] := array['custom_foods', 'saved_meals', 'saved_meal_items', 'log_entries', 'favourites', 'goals', 'weight_entries'];
  max_rows constant int := 1000;
  bad text;
  total int := 0;
  tbl text;
  r jsonb;
  results jsonb := '[]'::jsonb;
begin
  perform private.sync_check_protocol(protocol);
  if changes is null or jsonb_typeof(changes) <> 'object' then
    raise exception 'sync: changes must be an object of table name to rows' using errcode = '22023';
  end if;
  select k into bad from jsonb_object_keys(changes) k where k <> all (synced) limit 1;
  if bad is not null then
    raise exception 'sync: % is not a synced table', bad using errcode = '22023';
  end if;
  foreach tbl in array synced loop
    if changes ? tbl then
      if jsonb_typeof(changes -> tbl) <> 'array' then
        raise exception 'sync: changes.% must be an array', tbl using errcode = '22023';
      end if;
      total := total + jsonb_array_length(changes -> tbl);
    end if;
  end loop;
  if total > max_rows then
    raise exception 'sync: at most % rows per push (got %)', max_rows, total using errcode = '22023';
  end if;

  perform private.sync_lock_user();

  foreach tbl in array synced loop
    if changes ? tbl then
      for r in select value from jsonb_array_elements(changes -> tbl) loop
        results := results || jsonb_build_array(private.sync_apply_row(tbl, r));
      end loop;
    end if;
  end loop;

  return jsonb_build_object('protocol', protocol, 'results', results);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: sync_pull(protocol, since, max)
-- Returns {"rows": [{"table": t, "row": {...}}], "cursor": n, "more": bool}, ordered by server_seq.
-- Rows carry server_seq and the generated totals, never user_id. Tombstones are included.
-- Timestamps are in the wire format (private.sync_wire).
-- ---------------------------------------------------------------------------
create function public.sync_pull(protocol int, since bigint, max int)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  page_limit int;
  uid uuid := auth.uid();
  result jsonb;
begin
  perform private.sync_check_protocol(protocol);
  if uid is null then
    raise exception 'sync: no signed-in user' using errcode = '42501';
  end if;
  if since is null or since < 0 then
    raise exception 'sync: since must be 0 or a server_seq from an earlier pull' using errcode = '22023';
  end if;
  if max is null or max < 1 then
    raise exception 'sync: max must be at least 1' using errcode = '22023';
  end if;
  page_limit := least(max, 1000);

  with changed as (
    select 'log_entries' as tbl, t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') as row from public.log_entries t where t.user_id = uid and t.server_seq > since
    union all
    select 'custom_foods', t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') from public.custom_foods t where t.user_id = uid and t.server_seq > since
    union all
    select 'saved_meals', t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') from public.saved_meals t where t.user_id = uid and t.server_seq > since
    union all
    select 'saved_meal_items', t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') from public.saved_meal_items t where t.user_id = uid and t.server_seq > since
    union all
    select 'favourites', t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') from public.favourites t where t.user_id = uid and t.server_seq > since
    union all
    select 'goals', t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') from public.goals t where t.user_id = uid and t.server_seq > since
    union all
    select 'weight_entries', t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') from public.weight_entries t where t.user_id = uid and t.server_seq > since
  ),
  page as (
    select c.tbl, c.server_seq, c.row, row_number() over (order by c.server_seq) as n
    from (select * from changed order by server_seq limit page_limit + 1) c
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('table', p.tbl, 'row', p.row) order by p.server_seq) from page p where p.n <= page_limit), '[]'::jsonb),
    'cursor', coalesce((select p.server_seq from page p where p.n <= page_limit order by p.server_seq desc limit 1), since),
    'more', (select count(*) from page) > page_limit
  ) into result;

  return result;
end;
$$;

revoke all on function public.sync_push(int, jsonb) from public, anon;
revoke all on function public.sync_pull(int, bigint, int) from public, anon;
grant execute on function public.sync_push(int, jsonb) to authenticated;
grant execute on function public.sync_pull(int, bigint, int) to authenticated;
