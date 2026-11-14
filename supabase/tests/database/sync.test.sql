-- Sync backend (#34): the 7 synced tables, the write trigger, sync_push and sync_pull.
-- The rules under test are in docs/SYNC.md and packages/contracts/log-schema.md (v1).
begin;
select plan(90);

-- ---------------------------------------------------------------------------
-- Helpers (rolled back with the test)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, anon;

-- A UUIDv7-shaped id: version nibble 7, variant 8.
create function tests.v7(n int) returns text language sql immutable as $$
  select format('01900000-0000-7000-8000-%s', lpad(n::text, 12, '0'))
$$;

-- A full, valid row for each table. extra overrides any field.
create function tests.row(tbl text, id text, updated text, extra jsonb default '{}') returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', id, 'created_at', '2026-10-20T08:00:00.000Z', 'updated_at', updated, 'deleted_at', null)
    || case tbl
      when 'log_entries' then jsonb_build_object(
        'eaten_at', '2026-10-20T08:00:00.000Z', 'tz', 'Europe/Oslo', 'local_date', '2026-10-20',
        'meal', 'breakfast', 'quantity', 150, 'unit', 'g', 'grams', 150,
        'product_id', 'p:7038010000000', 'custom_food_id', null,
        'name', 'Skyr', 'brand', 'Q', 'source', 'matvaretabellen', 'ean', '7038010000000',
        'db_version', '2026.10.20', 'verified', true, 'per_100_unit', 'g',
        'kcal', 60, 'protein_g', 11, 'fat_g', 0.2, 'sat_fat_g', 0.1,
        'carbs_g', 3.6, 'sugars_g', 3.6, 'fibre_g', null, 'salt_g', 0.1)
      when 'custom_foods' then jsonb_build_object(
        'name', 'Grandma bread', 'brand', null, 'ean', null, 'serving_g', 40, 'per_100_unit', 'g',
        'kcal', 250, 'protein_g', null, 'fat_g', null, 'sat_fat_g', null,
        'carbs_g', null, 'sugars_g', null, 'fibre_g', null, 'salt_g', null)
      when 'saved_meals' then jsonb_build_object('name', 'Breakfast usual')
      when 'saved_meal_items' then jsonb_build_object(
        'saved_meal_id', tests.v7(9999), 'sort_order', 1, 'product_id', 'p:7038010000000',
        'custom_food_id', null, 'quantity', 2, 'unit', 'piece', 'grams', 120, 'name', 'Egg')
      when 'favourites' then jsonb_build_object('product_id', 'p:7038010000000', 'custom_food_id', null)
      when 'goals' then jsonb_build_object(
        'effective_from', '2026-10-20', 'goal_type', 'lose', 'kcal_target', 2200,
        'protein_g_target', 160, 'carbs_g_target', 220, 'fat_g_target', 70, 'fibre_g_target', 30,
        'target_weight_kg', 80, 'pace_kg_per_week', 0.5, 'sex', null, 'birth_year', 1995,
        'height_cm', 182, 'activity_level', null, 'weight_kg', 86.4)
      when 'weight_entries' then jsonb_build_object(
        'measured_at', '2026-10-20T07:00:00.000Z', 'tz', 'Europe/Oslo', 'local_date', '2026-10-20',
        'weight_kg', 86.4, 'source', 'manual', 'external_id', null)
    end
    || extra
$$;

-- Push one row and return its result object.
create function tests.push(tbl text, r jsonb) returns jsonb language sql as $$
  select public.sync_push(1, jsonb_build_object(tbl, jsonb_build_array(r))) -> 'results' -> 0
$$;

-- Act as a signed-in user, the way PostgREST does.
create function tests.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- The same, for setup steps whose result is not under test.
create function tests.put(tbl text, r jsonb) returns void language sql as $$
  select null::void from (select tests.push(tbl, r)) x
$$;

grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local'),
  ('cccccccc-0000-4000-8000-000000000003', 'c@test.local');

-- ---------------------------------------------------------------------------
-- Structure, grants and anon (as postgres)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_tables where schemaname = 'public' and tablename in
    ('log_entries', 'custom_foods', 'saved_meals', 'saved_meal_items', 'favourites', 'goals', 'weight_entries', 'sync_counters')
    and rowsecurity),
  8::bigint, 'the 7 synced tables and sync_counters exist with row level security on');

select is(
  (select count(*) from unnest(array['log_entries', 'custom_foods', 'saved_meals', 'saved_meal_items', 'favourites', 'goals', 'weight_entries']) t
    where has_table_privilege('authenticated', 'public.' || t, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')),
  0::bigint, 'signed-in users have no DELETE or TRUNCATE grant on any synced table');

select is(
  (select count(*) from unnest(array['log_entries', 'custom_foods', 'saved_meals', 'saved_meal_items', 'favourites', 'goals', 'weight_entries', 'sync_counters']) t
    where has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE')),
  0::bigint, 'anon has no privilege on any synced table');

select is(
  (select count(*) from unnest(array['SELECT', 'INSERT', 'UPDATE']) p
    where has_table_privilege('authenticated', 'public.sync_counters', p)),
  0::bigint, 'signed-in users cannot read or write sync_counters directly');

select is(
  (select prosecdef from pg_proc where oid = 'public.sync_push(int, jsonb)'::regprocedure)
  or (select prosecdef from pg_proc where oid = 'public.sync_pull(int, bigint, int)'::regprocedure),
  false, 'sync_push and sync_pull run as the caller (security invoker)');

set local role anon;
select throws_ok($$select 1 from public.log_entries$$, '42501', null, 'anon cannot read log_entries');
select throws_ok($$select 1 from public.weight_entries$$, '42501', null, 'anon cannot read weight_entries');
select throws_ok($$select public.sync_push(1, '{}')$$, '42501', null, 'anon cannot call sync_push');
select throws_ok($$select public.sync_pull(1, 0, 10)$$, '42501', null, 'anon cannot call sync_pull');
reset role;

-- ---------------------------------------------------------------------------
-- Protocol version and input checks
-- ---------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok($$select public.sync_push(0, '{}')$$, '22023', 'sync protocol 0 is not supported: this server accepts 1 to 2. Update the app.', 'push refuses an old protocol version');
select throws_ok($$select public.sync_pull(0, 0, 10)$$, '22023', 'sync protocol 0 is not supported: this server accepts 1 to 2. Update the app.', 'pull refuses an old protocol version');
select throws_ok($$select public.sync_push(99, '{}')$$, '22023', null, 'push refuses an unknown newer protocol version');
select throws_ok($$select public.sync_push(1, '{"misses": []}')$$, '22023', null, 'push refuses a table that is not synced');
select is(tests.push('log_entries', tests.row('log_entries', '01900000-0000-4000-8000-000000000001', '2026-10-20T08:00:00.000Z')) ->> 'status',
  'rejected', 'an id that is not UUIDv7 is rejected');
select is(tests.push('log_entries', tests.row('log_entries', tests.v7(2), '2026-10-20T08:00:00.000Z', '{"meal": "brunch"}')) ->> 'status',
  'rejected', 'a row that breaks a check is rejected, not raised');
select is(tests.push('log_entries', tests.row('log_entries', tests.v7(3), '2026-10-20T08:00:00.000Z', '{"product_id": null}')) ->> 'status',
  'rejected', 'a log entry needs exactly one of product_id and custom_food_id');
-- updated_at must be the contract format (ISO 8601 UTC with Z) and finite.
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(4), 'epoch')) ->> 'status', 'rejected', 'updated_at ''epoch'' is rejected');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(5), '-infinity')) ->> 'status', 'rejected', 'updated_at ''-infinity'' is rejected');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(6), 'now')) ->> 'status', 'rejected', 'updated_at ''now'' is rejected');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(7), '2026-10-20 08:00:00')) ->> 'status', 'rejected', 'an updated_at without a Z (no zone) is rejected');
select throws_ok($$insert into public.custom_foods (id, created_at, updated_at, name, per_100_unit)
  values ('01900000-0000-7000-8000-000000000008', now(), '-infinity', 'x', 'g')$$,
  '22023', null, 'the trigger refuses a non-finite updated_at on a direct write');

-- ---------------------------------------------------------------------------
-- Server fields from a client are ignored
-- ---------------------------------------------------------------------------
select is(tests.push('log_entries', tests.row('log_entries', tests.v7(10), '2026-10-20T08:00:00.000Z',
  '{"user_id": "bbbbbbbb-0000-4000-8000-000000000002", "server_seq": 999}')) ->> 'status', 'applied', 'a row carrying user_id and server_seq is applied');
select is((select user_id from public.log_entries where id = tests.v7(10)::uuid), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'user_id is the caller, not the value sent');
select isnt((select server_seq from public.log_entries where id = tests.v7(10)::uuid), 999::bigint, 'server_seq comes from the counter, not the value sent');
select throws_ok($$insert into public.log_entries (id, created_at, updated_at, eaten_at, tz, local_date, meal, quantity, unit, grams, product_id, name, source, per_100_unit, kcal_total)
  values ('01900000-0000-7000-8000-000000000011', now(), now(), now(), 'Europe/Oslo', '2026-10-20', 'lunch', 1, 'g', 1, 'p:1', 'x', 'x', 'g', 5)$$,
  '428C9', null, 'a client cannot write a generated total');
update public.log_entries set user_id = 'bbbbbbbb-0000-4000-8000-000000000002', updated_at = '2026-10-21T08:00:00Z' where id = tests.v7(10)::uuid;
select is((select user_id from public.log_entries where id = tests.v7(10)::uuid), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'a direct update cannot move a row to another user');

-- ---------------------------------------------------------------------------
-- Last-write-wins (user A, one custom food)
-- ---------------------------------------------------------------------------
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T10:00:00.000Z')) ->> 'status', 'applied', 'a new row is applied');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T10:00:00.000Z')) ->> 'status', 'stale', 'a retry of the same push is idempotent (tie, server copy kept)');
select is((select count(*) from public.custom_foods where id = tests.v7(20)::uuid), 1::bigint, 'the retry did not create a second row');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T11:00:00.000Z', '{"name": "newer"}')) ->> 'status', 'applied', 'a newer edit is applied');
select is((select name from public.custom_foods where id = tests.v7(20)::uuid), 'newer', 'the newer edit is stored');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T10:30:00.000Z', '{"name": "older"}')) ->> 'status', 'stale', 'an older edit is stale');
select is((select name from public.custom_foods where id = tests.v7(20)::uuid), 'newer', 'the older edit changed nothing');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T11:00:00.000Z', '{"name": "tie"}')) ->> 'status', 'stale', 'an edit with the same updated_at is stale');
select is((select name from public.custom_foods where id = tests.v7(20)::uuid), 'newer', 'on a tie the server copy wins');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T12:00:00.000Z', '{"name": "newer", "deleted_at": "2026-10-20T12:00:00.000Z"}')) ->> 'status', 'applied', 'a newer tombstone is applied');
select isnt((select deleted_at from public.custom_foods where id = tests.v7(20)::uuid), null, 'the tombstone wins when newer');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T11:30:00.000Z', '{"name": "edit before delete"}')) ->> 'status', 'stale', 'an older edit after a tombstone is stale');
select isnt((select deleted_at from public.custom_foods where id = tests.v7(20)::uuid), null, 'an older edit does not revive the row');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-20T13:00:00.000Z', '{"name": "revived"}')) ->> 'status', 'applied', 'a newer edit that clears deleted_at is applied');
select is((select deleted_at is null and name = 'revived' from public.custom_foods where id = tests.v7(20)::uuid), true, 'a newer edit after a tombstone revives the row');
-- The trigger enforces the same rule on a direct write.
update public.custom_foods set name = 'direct older', updated_at = '2026-10-20T09:00:00Z' where id = tests.v7(20)::uuid;
select is((select name from public.custom_foods where id = tests.v7(20)::uuid), 'revived', 'the trigger skips an older direct update too');

-- ---------------------------------------------------------------------------
-- Clock clamp, millisecond precision
-- ---------------------------------------------------------------------------
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(30), '2099-01-01T00:00:00.000Z')) ->> 'status', 'applied', 'a row from a clock in the future is applied');
select is((select updated_at from public.custom_foods where id = tests.v7(30)::uuid), date_trunc('milliseconds', now()), 'a future updated_at is clamped to the server clock, in milliseconds');
select tests.put('custom_foods', tests.row('custom_foods', tests.v7(31), '2026-10-20T08:15:30.123456Z'));
select is((select updated_at from public.custom_foods where id = tests.v7(31)::uuid), '2026-10-20T08:15:30.123Z'::timestamptz, 'updated_at is stored with millisecond precision');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(31), '2026-10-20T08:15:30.123900Z', '{"name": "same ms"}')) ->> 'status', 'stale', 'an edit within the same millisecond is a tie');

-- ---------------------------------------------------------------------------
-- Generated totals
-- ---------------------------------------------------------------------------
select tests.put('log_entries', tests.row('log_entries', tests.v7(40), '2026-10-20T08:00:00.000Z', '{"grams": 150}'));
select is((select kcal_total from public.log_entries where id = tests.v7(40)::uuid), 90::double precision, 'kcal_total = kcal * grams / 100');
select is((select fibre_g_total from public.log_entries where id = tests.v7(40)::uuid), null, 'a NULL per-100 value gives a NULL total, never 0');
select is(tests.push('log_entries', tests.row('log_entries', tests.v7(41), '2026-10-20T08:00:00.000Z',
  '{"kcal": null, "protein_g": null, "fat_g": null, "sat_fat_g": null, "carbs_g": null, "sugars_g": null, "fibre_g": null, "salt_g": null, "kcal_total": 999}')) ->> 'status',
  'applied', 'a pushed row carrying a total is applied');
select is((select num_nonnulls(kcal_total, protein_g_total, fat_g_total, sat_fat_g_total, carbs_g_total, sugars_g_total, fibre_g_total, salt_g_total)
  from public.log_entries where id = tests.v7(41)::uuid), 0, 'all 8 totals stay NULL when the per-100 values are unknown, and a pushed total is ignored');
select tests.put('log_entries', tests.row('log_entries', tests.v7(40), '2026-10-20T09:00:00.000Z', '{"grams": 200, "quantity": 200}'));
select is((select kcal_total from public.log_entries where id = tests.v7(40)::uuid), 120::double precision, 'editing grams recomputes the totals');
-- Decision 42: a food stored per portion. 2 portions of a 621 kcal Whopper: grams = 200, so the total is 1242 kcal.
select is(tests.push('log_entries', tests.row('log_entries', tests.v7(42), '2026-10-20T08:00:00.000Z',
  '{"quantity": 2, "unit": "portion", "grams": 200, "per_100_unit": "portion", "kcal": 621}')) ->> 'status', 'applied', 'a per-portion entry is accepted');
select is((select kcal_total from public.log_entries where id = tests.v7(42)::uuid), 1242::double precision, 'per-portion total = printed value times portions');

-- nutrition/portion.json (packages/contracts, #51), copied unchanged until a runner reads the file.
create temp table portion_cases on commit drop as
select c ->> 'id' as case_id, c -> 'input' -> 'per100g' as per100, (c -> 'input' ->> 'grams')::double precision as grams, c -> 'expected' as expected
from jsonb_array_elements($json$
[
  {"id": "portion-basic", "input": {"per100g": {"kcal": 250, "protein_g": 10, "fat_g": 8, "carbs_g": 30, "fibre_g": 4}, "grams": 150},
   "expected": {"kcal": 375, "protein_g": 15, "fat_g": 12, "carbs_g": 45, "fibre_g": 6}},
  {"id": "portion-unknown-stays-null", "input": {"per100g": {"kcal": 250, "protein_g": null, "fat_g": 8, "carbs_g": 30, "fibre_g": null}, "grams": 150},
   "expected": {"kcal": 375, "protein_g": null, "fat_g": 12, "carbs_g": 45, "fibre_g": null}},
  {"id": "portion-real-zero-stays-zero", "input": {"per100g": {"kcal": 250, "protein_g": 0, "fat_g": 0, "carbs_g": 30, "fibre_g": 0}, "grams": 150},
   "expected": {"kcal": 375, "protein_g": 0, "fat_g": 0, "carbs_g": 45, "fibre_g": 0}},
  {"id": "portion-zero-grams", "input": {"per100g": {"kcal": 250, "protein_g": null, "fat_g": 8, "carbs_g": 30, "fibre_g": 4}, "grams": 0},
   "expected": {"kcal": 0, "protein_g": null, "fat_g": 0, "carbs_g": 0, "fibre_g": 0}},
  {"id": "portion-small-fraction", "input": {"per100g": {"kcal": 0.4, "protein_g": 0.4, "fat_g": 0.4, "carbs_g": 0.4, "fibre_g": 0.4}, "grams": 30},
   "expected": {"kcal": 0.12, "protein_g": 0.12, "fat_g": 0.12, "carbs_g": 0.12, "fibre_g": 0.12}},
  {"id": "portion-over-100-grams", "input": {"per100g": {"kcal": 52, "protein_g": 0.3, "fat_g": 0.2, "carbs_g": 14, "fibre_g": 2.4}, "grams": 250},
   "expected": {"kcal": 130, "protein_g": 0.75, "fat_g": 0.5, "carbs_g": 35, "fibre_g": 6}}
]
$json$::jsonb) as c;
grant select on portion_cases to authenticated;

select tests.put('log_entries', tests.row('log_entries', tests.v7(500 + n), '2026-10-20T08:00:00.000Z',
  per100 || jsonb_build_object('sat_fat_g', null, 'sugars_g', null, 'salt_g', null, 'grams', grams, 'quantity', grams, 'source', case_id)))
from (select *, row_number() over (order by case_id)::int as n from portion_cases) pc;

select is((select count(*) from portion_cases), 6::bigint, 'portion.json has the 6 cases this test was written against');

-- A known value must match within 1e-9; an expected null must be null; never 0 for null.
select is(
  (select count(*) from portion_cases pc
     join public.log_entries le on le.source = pc.case_id
     cross join lateral (values
       ('kcal', le.kcal_total), ('protein_g', le.protein_g_total), ('fat_g', le.fat_g_total),
       ('carbs_g', le.carbs_g_total), ('fibre_g', le.fibre_g_total)) v(nutrient, got)
     where le.user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
       and not (case when jsonb_typeof(pc.expected -> v.nutrient) = 'null' then v.got is null
                     else v.got is not null and abs(v.got - (pc.expected ->> v.nutrient)::double precision) < 1e-9 end)),
  0::bigint, 'every portion.json case matches the generated totals');
select is((select count(*) from public.log_entries le join portion_cases pc on le.source = pc.case_id), 6::bigint, 'every portion.json case was logged');

-- ---------------------------------------------------------------------------
-- Natural-key collisions (user A)
-- ---------------------------------------------------------------------------
select is(tests.push('favourites', tests.row('favourites', tests.v7(60), '2026-10-20T08:00:00.000Z', '{"product_id": "p:fav"}')) ->> 'status', 'applied', 'first favourite applied');
select is(tests.push('favourites', tests.row('favourites', tests.v7(61), '2026-10-20T09:00:00.000Z', '{"product_id": "p:fav"}')) ->> 'status', 'applied', 'a second favourite for the same product does not fail');
select is((select array_agg(id::text order by id) from public.favourites where product_id = 'p:fav' and deleted_at is null), array[tests.v7(61)], 'the later favourite is live');
select isnt((select deleted_at from public.favourites where id = tests.v7(60)::uuid), null, 'the earlier favourite is tombstoned');
select is(tests.push('favourites', tests.row('favourites', tests.v7(62), '2026-10-20T08:30:00.000Z', '{"product_id": "p:fav"}')) ->> 'status', 'applied', 'an older duplicate favourite is applied as a tombstone');
select is((select (select count(*) from public.favourites where product_id = 'p:fav' and deleted_at is null)::text || ':' || (select (deleted_at is not null)::text from public.favourites where id = tests.v7(62)::uuid)),
  '1:true', 'the older duplicate is the one tombstoned, one live row remains');
select tests.put('goals', tests.row('goals', tests.v7(63), '2026-10-20T08:00:00.000Z'));
select tests.put('goals', tests.row('goals', tests.v7(64), '2026-10-20T09:00:00.000Z', '{"kcal_target": 2100}'));
select is((select array_agg(kcal_target) from public.goals where effective_from = '2026-10-20' and deleted_at is null), array[2100::double precision], 'goals: one live row per effective_from, the later wins');
select tests.put('weight_entries', tests.row('weight_entries', tests.v7(65), '2026-10-20T08:00:00.000Z', '{"source": "apple_health", "external_id": "hk-1"}'));
select tests.put('weight_entries', tests.row('weight_entries', tests.v7(66), '2026-10-20T07:00:00.000Z', '{"source": "apple_health", "external_id": "hk-1"}'));
select is((select array_agg(id::text) from public.weight_entries where external_id = 'hk-1' and deleted_at is null), array[tests.v7(65)], 'weight: one live row per source and external_id, the later wins');
select tests.put('weight_entries', tests.row('weight_entries', tests.v7(67), '2026-10-20T08:00:00.000Z'));
select tests.put('weight_entries', tests.row('weight_entries', tests.v7(68), '2026-10-20T09:00:00.000Z'));
select is((select count(*) from public.weight_entries where id in (tests.v7(67)::uuid, tests.v7(68)::uuid) and external_id is null and deleted_at is null),
  2::bigint, 'weight entries without an external id are not deduplicated');
select tests.put('favourites', tests.row('favourites', tests.v7(160), '2026-10-20T08:00:00.000Z', jsonb_build_object('product_id', null, 'custom_food_id', tests.v7(20))));
select tests.put('favourites', tests.row('favourites', tests.v7(161), '2026-10-20T09:00:00.000Z', jsonb_build_object('product_id', null, 'custom_food_id', tests.v7(20))));
select is((select array_agg(id::text) from public.favourites where custom_food_id = tests.v7(20)::uuid and deleted_at is null), array[tests.v7(161)],
  'favourites: one live row per custom_food_id, the later wins');
-- Reviving the tombstoned goal (63) with a newer edit tombstones the live goal (64) with the same key.
select tests.put('goals', tests.row('goals', tests.v7(63), '2026-10-20T10:00:00.000Z'));
select is((select array_agg(id::text) from public.goals where effective_from = '2026-10-20' and deleted_at is null), array[tests.v7(63)],
  'reviving a tombstoned row tombstones the live row it collides with');

-- ---------------------------------------------------------------------------
-- Two users: B sees and changes nothing of A's (A has rows in all 7 tables)
-- ---------------------------------------------------------------------------
select tests.put('saved_meals', tests.row('saved_meals', tests.v7(70), '2026-10-20T08:00:00.000Z'));
select tests.put('saved_meal_items', tests.row('saved_meal_items', tests.v7(71), '2026-10-20T08:00:00.000Z', jsonb_build_object('saved_meal_id', tests.v7(70))));
select is(
  (select count(distinct t) from (
     select 'log_entries' t from public.log_entries union all select 'custom_foods' from public.custom_foods
     union all select 'saved_meals' from public.saved_meals union all select 'saved_meal_items' from public.saved_meal_items
     union all select 'favourites' from public.favourites union all select 'goals' from public.goals
     union all select 'weight_entries' from public.weight_entries) x),
  7::bigint, 'user A has rows in all 7 tables');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select is(
  (select count(*) from (
     select 1 from public.log_entries union all select 1 from public.custom_foods
     union all select 1 from public.saved_meals union all select 1 from public.saved_meal_items
     union all select 1 from public.favourites union all select 1 from public.goals
     union all select 1 from public.weight_entries) x),
  0::bigint, 'user B sees none of A''s rows in any table');
select is(public.sync_pull(1, 0, 1000) -> 'rows', '[]'::jsonb, 'user B pulls nothing of A''s');
update public.log_entries set name = 'hacked', updated_at = '2026-10-25T00:00:00Z';
update public.custom_foods set name = 'hacked', updated_at = '2026-10-25T00:00:00Z';
update public.saved_meals set name = 'hacked', updated_at = '2026-10-25T00:00:00Z';
update public.saved_meal_items set name = 'hacked', updated_at = '2026-10-25T00:00:00Z';
update public.favourites set deleted_at = now(), updated_at = '2026-10-25T00:00:00Z';
update public.goals set kcal_target = 1, updated_at = '2026-10-25T00:00:00Z';
update public.weight_entries set weight_kg = 1, updated_at = '2026-10-25T00:00:00Z';
select throws_ok($$delete from public.log_entries$$, '42501', null, 'user B cannot delete (no DELETE grant)');
select is(tests.push('custom_foods', tests.row('custom_foods', tests.v7(20), '2026-10-25T00:00:00.000Z', '{"name": "hijack"}')) ->> 'status',
  'rejected', 'user B cannot push over A''s row by reusing its id');
select is(tests.push('log_entries', tests.row('log_entries', tests.v7(80), '2026-10-20T08:00:00.000Z')) ->> 'status', 'applied', 'user B can write own rows');

select tests.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select count(*) from (
     select 1 from public.log_entries where name = 'hacked' union all select 1 from public.custom_foods where name in ('hacked', 'hijack')
     union all select 1 from public.saved_meals where name = 'hacked' union all select 1 from public.saved_meal_items where name = 'hacked'
     union all select 1 from public.favourites where updated_at = '2026-10-25T00:00:00Z' union all select 1 from public.goals where kcal_target = 1
     union all select 1 from public.weight_entries where weight_kg = 1) x),
  0::bigint, 'none of B''s updates changed A''s rows');
select is((select count(*) from public.log_entries where id = tests.v7(80)::uuid), 0::bigint, 'user A cannot see B''s row');

-- ---------------------------------------------------------------------------
-- Cursor: user C, two pushes, then pull everything and page through it
-- ---------------------------------------------------------------------------
select tests.as_user('cccccccc-0000-4000-8000-000000000003');
select is(jsonb_array_length(public.sync_push(1, jsonb_build_object(
  'log_entries', jsonb_build_array(tests.row('log_entries', tests.v7(90), '2026-10-20T08:00:00.000Z'), tests.row('log_entries', tests.v7(91), '2026-10-20T08:00:00.000Z')),
  'weight_entries', jsonb_build_array(tests.row('weight_entries', tests.v7(92), '2026-10-20T08:00:00.000Z')))) -> 'results'), 3, 'first push returns one result per row');
select null::void from public.sync_push(1, jsonb_build_object(
  'custom_foods', jsonb_build_array(tests.row('custom_foods', tests.v7(93), '2026-10-20T08:00:00.000Z')),
  'log_entries', jsonb_build_array(tests.row('log_entries', tests.v7(90), '2026-10-20T09:00:00.000Z', '{"grams": 10}'))));

create temp table c_pull on commit drop as select public.sync_pull(1, 0, 1000) as p;
select is((select array_agg((r -> 'row' ->> 'server_seq')::bigint) from c_pull, jsonb_array_elements(p -> 'rows') r),
  array[2, 3, 4, 5]::bigint[], 'a pull after two pushes returns every live version in server_seq order (seq 1 was superseded by 5)');
select is((select array_agg(r -> 'row' ->> 'id' order by (r -> 'row' ->> 'server_seq')::bigint) from c_pull, jsonb_array_elements(p -> 'rows') r),
  array[tests.v7(91), tests.v7(92), tests.v7(93), tests.v7(90)], 'each row appears once, at its latest version');
select is((select p -> 'cursor' from c_pull), '5'::jsonb, 'the cursor is the last server_seq returned');
select is((select p -> 'more' from c_pull), 'false'::jsonb, 'more is false when everything was returned');
select is((select count(*) from c_pull, jsonb_array_elements(p -> 'rows') r where r -> 'row' ? 'user_id'), 0::bigint, 'pulled rows do not carry user_id');
select is((select r -> 'table' from c_pull, jsonb_array_elements(p -> 'rows') r where r -> 'row' ->> 'id' = tests.v7(92)), '"weight_entries"'::jsonb, 'each pulled row names its table');

select is(
  (with p1 as (select public.sync_pull(1, 0, 2) p),
        p2 as (select public.sync_pull(1, (select (p ->> 'cursor')::bigint from p1), 2) p),
        p3 as (select public.sync_pull(1, (select (p ->> 'cursor')::bigint from p2), 2) p)
   select format('%s/%s/%s|%s/%s/%s|%s',
     (select p ->> 'cursor' from p1), (select p ->> 'cursor' from p2), (select p ->> 'cursor' from p3),
     (select p ->> 'more' from p1), (select p ->> 'more' from p2), (select p ->> 'more' from p3),
     (select jsonb_array_length(p -> 'rows') from p3))),
  '3/5/5|true/false/false|0', 'paging with max returns pages in order, with no gaps, until more is false');
select throws_ok($$select public.sync_pull(1, 0, 0)$$, '22023', null, 'pull refuses max below 1');

-- ---------------------------------------------------------------------------
-- Wire format: pulled timestamps are ISO 8601 UTC with milliseconds and Z, whatever the session time zone
-- ---------------------------------------------------------------------------
set local timezone = 'Europe/Oslo';
select tests.put('log_entries', tests.row('log_entries', tests.v7(95), '2026-10-20T08:15:30.120Z',
  '{"created_at": "2026-10-20T08:15:30.12Z", "eaten_at": "2026-10-20T08:15:30.12Z", "deleted_at": "2026-10-20T08:15:30.120Z"}'));
create temp table c_wire on commit drop as select r -> 'row' as w from jsonb_array_elements(public.sync_pull(1, 0, 1000) -> 'rows') r;
select is((select format('%s|%s|%s', w ->> 'created_at', w ->> 'updated_at', w ->> 'eaten_at') from c_wire where w ->> 'id' = tests.v7(90)),
  '2026-10-20T08:00:00.000Z|2026-10-20T09:00:00.000Z|2026-10-20T08:00:00.000Z', 'whole-second timestamps keep .000 and Z, not +00:00 or +02:00');
select is((select format('%s|%s|%s', w ->> 'created_at', w ->> 'updated_at', w ->> 'deleted_at') from c_wire where w ->> 'id' = tests.v7(95)),
  '2026-10-20T08:15:30.120Z|2026-10-20T08:15:30.120Z|2026-10-20T08:15:30.120Z', 'trailing zeros in milliseconds are kept');
select is((select w ->> 'measured_at' from c_wire where w ->> 'id' = tests.v7(92)), '2026-10-20T07:00:00.000Z', 'measured_at uses the wire format');
select is((select count(*) from c_wire, unnest(array['created_at', 'updated_at', 'deleted_at', 'eaten_at', 'measured_at']) k
  where jsonb_typeof(w -> k) = 'string' and w ->> k !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'),
  0::bigint, 'every pulled timestamp matches YYYY-MM-DDTHH:MM:SS.mmmZ');
select is((select w ->> 'deleted_at' is not null from c_wire where w ->> 'id' = tests.v7(95)), true, 'a pull includes tombstones');
select is((select (w -> 'kcal_total')::text || '|' || jsonb_typeof(w -> 'fibre_g_total') from c_wire where w ->> 'id' = tests.v7(90)),
  '6|null', 'a pull includes the generated totals, NULL when unknown');

select * from finish();
rollback;
