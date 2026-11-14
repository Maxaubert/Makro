-- Daily supplements (#52, docs/plans/2026-11-14-daily-supplements.md, log-schema.md).
-- A new synced table, the 'supplements' meal, a natural key so a day has one entry per supplement,
-- and sync protocol 2. A protocol 1 client neither sends nor receives supplements.

-- ---------------------------------------------------------------------------
-- The table: same sync fields, trigger, RLS and grants as the other synced tables.
-- ---------------------------------------------------------------------------
create table public.daily_supplements (
  id uuid primary key constraint daily_supplements_id_uuidv7 check (substr(id::text, 15, 1) = '7'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  server_seq bigint not null,
  product_id text,
  custom_food_id uuid,
  name text not null,
  quantity double precision not null check (quantity >= 0),
  unit text not null check (unit in ('g', 'ml', 'piece', 'serving', 'portion')),
  grams double precision not null check (grams >= 0),
  sort_order integer not null default 0,
  start_date date not null,
  stopped_on date,
  constraint daily_supplements_one_food check ((product_id is null) <> (custom_food_id is null))
);
create unique index daily_supplements_user_seq on public.daily_supplements (user_id, server_seq);
create trigger sync_row_write before insert or update on public.daily_supplements for each row execute function private.sync_row_write();

alter table public.daily_supplements enable row level security;
revoke all on public.daily_supplements from anon, authenticated;
grant select, insert, update on public.daily_supplements to authenticated;
create policy "own rows: select" on public.daily_supplements for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.daily_supplements for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.daily_supplements for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- log_entries: the supplements meal, the link, and one live entry per supplement and day.
-- ---------------------------------------------------------------------------
alter table public.log_entries drop constraint if exists log_entries_meal_check;
alter table public.log_entries add constraint log_entries_meal_check
  check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'supplements'));
alter table public.log_entries add column daily_supplement_id uuid;
create unique index log_entries_live_supplement_day on public.log_entries (user_id, daily_supplement_id, local_date)
  where deleted_at is null and daily_supplement_id is not null;

-- ---------------------------------------------------------------------------
-- Protocol 2.
-- ---------------------------------------------------------------------------
create or replace function private.sync_check_protocol(protocol int)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  min_protocol constant int := 1;
  max_protocol constant int := 2;
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

-- As in 20261025000000_sync.sql, plus the log_entries natural key (daily_supplement_id + local_date).
create or replace function private.sync_apply_row(tbl text, r jsonb)
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
  ts := date_trunc('milliseconds', least(ts, now()));

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', tbl) into existing using rid;

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
    when 'log_entries' then '(t.daily_supplement_id = ($2 ->> ''daily_supplement_id'')::uuid and t.local_date = ($2 ->> ''local_date'')::date)'
  end;

  begin
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
    return jsonb_build_object('table', tbl, 'id', rid, 'status', 'stale');
  end if;

  return jsonb_build_object('table', tbl, 'id', rid, 'status', 'applied', 'server_seq', new_seq)
    || case when tombstoned then jsonb_build_object('tombstoned', true) else '{}'::jsonb end;
end;
$$;

-- As before; protocol 2 also takes daily_supplements, protocol 1 refuses it and supplement entries.
create or replace function public.sync_push(protocol int, changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  synced text[] := array['custom_foods', 'saved_meals', 'saved_meal_items', 'daily_supplements', 'log_entries', 'favourites', 'goals', 'weight_entries'];
  max_rows constant int := 1000;
  bad text;
  total int := 0;
  tbl text;
  r jsonb;
  results jsonb := '[]'::jsonb;
begin
  perform private.sync_check_protocol(protocol);
  if protocol < 2 then
    synced := array_remove(synced, 'daily_supplements');
  end if;
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
        if protocol < 2 and tbl = 'log_entries' and (r ->> 'meal' = 'supplements' or r ? 'daily_supplement_id') then
          results := results || jsonb_build_array(jsonb_build_object('table', tbl, 'id', r -> 'id', 'status', 'rejected',
            'reason', 'supplement entries need sync protocol 2'));
        else
          results := results || jsonb_build_array(private.sync_apply_row(tbl, r));
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('protocol', protocol, 'results', results);
end;
$$;

-- As before; protocol 2 also returns daily_supplements, protocol 1 sees neither them nor supplement entries.
create or replace function public.sync_pull(protocol int, since bigint, max int)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  page_limit int;
  uid uuid := auth.uid();
  v2 boolean;
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
  v2 := protocol >= 2;

  with changed as (
    select 'log_entries' as tbl, t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id' - case when v2 then '' else 'daily_supplement_id' end) as row
      from public.log_entries t where t.user_id = uid and t.server_seq > since and (v2 or t.meal <> 'supplements')
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
    union all
    select 'daily_supplements', t.server_seq, private.sync_wire(to_jsonb(t) - 'user_id') from public.daily_supplements t where v2 and t.user_id = uid and t.server_seq > since
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
