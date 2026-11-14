-- Daily supplements (#52): the daily_supplements table, the supplements meal and sync protocol 2.
-- Rules: packages/contracts/log-schema.md (daily_supplements, Duplicates).
begin;
select plan(20);

create schema tests;
grant usage on schema tests to authenticated, anon;
create function tests.v7(n int) returns text language sql immutable as $$
  select format('01900000-0000-7000-8000-%s', lpad(n::text, 12, '0'))
$$;
create function tests.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function tests.supp(id text, updated text, extra jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('id', id, 'created_at', '2026-11-14T08:00:00.000Z', 'updated_at', updated, 'deleted_at', null,
    'product_id', 'p:creatine', 'custom_food_id', null, 'name', 'Creatine', 'quantity', 5, 'unit', 'g', 'grams', 5,
    'sort_order', 0, 'start_date', '2026-11-14', 'stopped_on', null) || extra
$$;
create function tests.entry(id text, updated text, extra jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('id', id, 'created_at', '2026-11-14T08:00:00.000Z', 'updated_at', updated, 'deleted_at', null,
    'eaten_at', '2026-11-14T08:00:00.000Z', 'tz', 'Europe/Oslo', 'local_date', '2026-11-14',
    'meal', 'supplements', 'quantity', 5, 'unit', 'g', 'grams', 5, 'product_id', 'p:creatine', 'custom_food_id', null,
    'name', 'Creatine', 'brand', null, 'source', 'apex-no', 'ean', null, 'db_version', '2026.11.19', 'verified', false,
    'per_100_unit', 'g', 'kcal', null, 'protein_g', null, 'fat_g', null, 'sat_fat_g', null, 'carbs_g', null,
    'sugars_g', null, 'fibre_g', null, 'salt_g', null, 'daily_supplement_id', tests.v7(1)) || extra
$$;
create function tests.push(protocol int, tbl text, r jsonb) returns jsonb language sql as $$
  select public.sync_push(protocol, jsonb_build_object(tbl, jsonb_build_array(r))) -> 'results' -> 0
$$;
grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local');

-- Structure and grants (as postgres)
select has_table('public', 'daily_supplements', 'daily_supplements exists');
select is((select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'daily_supplements'), true, 'RLS is on');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and table_name = 'daily_supplements' and grantee = 'anon'), 0, 'anon has no grant');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and table_name = 'daily_supplements' and grantee = 'authenticated' and privilege_type = 'DELETE'), 0, 'no DELETE grant');
select has_column('public', 'log_entries', 'daily_supplement_id', 'log_entries has daily_supplement_id');

-- Protocol 2 pushes a supplement; protocol 1 does not know the table
select tests.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(tests.push(2, 'daily_supplements', tests.supp(tests.v7(1), '2026-11-14T08:00:00.000Z')) ->> 'status', 'applied', 'protocol 2 pushes a daily supplement');
select throws_ok($$select public.sync_push(1, jsonb_build_object('daily_supplements', '[]'::jsonb))$$, '22023', null, 'protocol 1 cannot push daily_supplements');
select throws_ok($$select public.sync_push(3, '{}')$$, '22023', null, 'protocol 3 is newer than the server');
select is(tests.push(2, 'log_entries', tests.entry(tests.v7(10), '2026-11-14T08:00:00.000Z')) ->> 'status', 'applied', 'a supplements entry is accepted');
select is(tests.push(2, 'daily_supplements', tests.supp(tests.v7(2), '2026-11-14T08:00:00.000Z', '{"unit": "portion", "grams": 100, "quantity": 1}')) ->> 'status', 'applied', 'a per-portion food can be a supplement');
select is(tests.push(2, 'daily_supplements', tests.supp(tests.v7(3), '2026-11-14T08:00:00.000Z', '{"custom_food_id": "01900000-0000-7000-8000-000000000099"}')) ->> 'status', 'rejected', 'exactly one of product_id and custom_food_id');
select is(tests.push(2, 'log_entries', tests.entry(tests.v7(11), '2026-11-14T08:00:00.000Z', '{"meal": "elevenses", "daily_supplement_id": null}')) ->> 'status', 'rejected', 'an unknown meal is refused');

-- Natural key: one live entry per supplement and day; the later one wins
select is(tests.push(2, 'log_entries', tests.entry(tests.v7(12), '2026-11-14T09:00:00.000Z')) ->> 'status', 'applied', 'a second device makes the same day''s entry');
select is((select count(*)::int from public.log_entries where daily_supplement_id = tests.v7(1)::uuid and local_date = '2026-11-14' and deleted_at is null), 1, 'only one live entry for the supplement that day');
select isnt((select deleted_at from public.log_entries where id = tests.v7(10)::uuid), null, 'the older entry is tombstoned');
select is(tests.push(2, 'log_entries', tests.entry(tests.v7(13), '2026-11-14T10:00:00.000Z', '{"local_date": "2026-11-15"}')) ->> 'status', 'applied', 'the next day gets its own entry');

-- Pulls: protocol 2 sees supplements, protocol 1 sees none of them
select ok((select bool_or(r ->> 'table' = 'daily_supplements') from jsonb_array_elements(public.sync_pull(2, 0, 1000) -> 'rows') r), 'protocol 2 pulls daily_supplements');
select ok((select coalesce(bool_and(r ->> 'table' <> 'daily_supplements' and r -> 'row' ->> 'meal' is distinct from 'supplements'), true) from jsonb_array_elements(public.sync_pull(1, 0, 1000) -> 'rows') r), 'protocol 1 pulls no supplements and no supplement entries');

-- Own rows only
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select is((select count(*)::int from public.daily_supplements), 0, 'user B sees none of A''s supplements');
select is(jsonb_array_length(public.sync_pull(2, 0, 1000) -> 'rows'), 0, 'user B pulls nothing of A''s');

select * from finish();
rollback;
