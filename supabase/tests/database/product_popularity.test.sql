-- product_popularity(): how many people log each product, for search ranking (decision 36).
begin;
select plan(10);

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.log_row(n int, product text, deleted text default null) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', format('01900000-0000-7000-8000-%s', lpad(n::text, 12, '0')),
    'created_at', '2026-10-20T08:00:00.000Z', 'updated_at', '2026-10-20T08:00:00.000Z', 'deleted_at', deleted,
    'eaten_at', '2026-10-20T08:00:00.000Z', 'tz', 'Europe/Oslo', 'local_date', '2026-10-20',
    'meal', 'breakfast', 'quantity', 150, 'unit', 'g', 'grams', 150,
    'product_id', product, 'custom_food_id', null,
    'name', 'Skyr', 'brand', 'Q', 'source', 'matvaretabellen', 'ean', null,
    'db_version', '2026.10.20', 'verified', true, 'per_100_unit', 'g',
    'kcal', 60, 'protein_g', 11, 'fat_g', 0.2, 'sat_fat_g', 0.1,
    'carbs_g', 3.6, 'sugars_g', 3.6, 'fibre_g', null, 'salt_g', 0.1)
$$;

create function tests.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'a@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'b@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'c@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'd@example.test');

-- Taking part is a choice: users 1, 2 and 3 opted in, user 4 did not.
insert into public.consents (user_id, kind, text_version) values
  ('00000000-0000-4000-8000-000000000001', 'popularity', '1'),
  ('00000000-0000-4000-8000-000000000002', 'popularity', '1'),
  ('00000000-0000-4000-8000-000000000003', 'popularity', '1');

set local role authenticated;
select tests.as_user('00000000-0000-4000-8000-000000000001');
select public.sync_push(1, jsonb_build_object('log_entries', jsonb_build_array(
  tests.log_row(1, 'p:shared'), tests.log_row(2, 'p:shared'),
  tests.log_row(3, 'p:alone'),
  tests.log_row(4, 'p:pair'),
  tests.log_row(5, 'p:deleted-later'),
  tests.log_row(6, repeat('x', 1025)))));

select tests.as_user('00000000-0000-4000-8000-000000000002');
select public.sync_push(1, jsonb_build_object('log_entries', jsonb_build_array(
  tests.log_row(7, 'p:shared'),
  tests.log_row(8, 'p:pair'),
  tests.log_row(9, 'p:deleted-later', '2026-10-20T08:00:00.000Z'),
  tests.log_row(10, repeat('x', 1025)))));

select tests.as_user('00000000-0000-4000-8000-000000000003');
select public.sync_push(1, jsonb_build_object('log_entries', jsonb_build_array(
  tests.log_row(11, 'p:shared'),
  tests.log_row(12, repeat('x', 1025)))));

select tests.as_user('00000000-0000-4000-8000-000000000004');
select public.sync_push(1, jsonb_build_object('log_entries', jsonb_build_array(
  tests.log_row(13, 'p:shared'), tests.log_row(14, 'p:opted-out'))));

select tests.as_user('00000000-0000-4000-8000-000000000001');
select is((select users from public.product_popularity() where product_id = 'p:shared'), 3, 'counts distinct people');
select is((select logs from public.product_popularity() where product_id = 'p:shared'), 4, 'counts every log of the product, and none from someone who did not opt in');
select is((select count(*) from public.product_popularity() where product_id = 'p:opted-out'), 0::bigint, 'a product only a non-participant logged never appears');
select is((select count(*) from public.product_popularity() where product_id = 'p:alone'), 0::bigint, 'a product only one person logs stays private');
select is((select count(*) from public.product_popularity() where product_id = 'p:pair'), 0::bigint, 'your own logs do not count toward the floor, so you cannot test what one other person ate');
select is((select count(*) from public.product_popularity() where product_id = 'p:deleted-later'), 0::bigint, 'deleted entries do not count');
select is((select count(*) from public.product_popularity() where char_length(product_id) > 1024), 0::bigint, 'over-long product ids are left out');
select is(pg_get_function_result('public.product_popularity()'::regprocedure),
  'TABLE(product_id text, users integer, logs integer)', 'returns only the product and two counts, never who logged it');

reset role;
select ok((select prosecdef from pg_proc where oid = 'public.product_popularity()'::regprocedure), 'runs as definer, since RLS hides other people''s rows');

set local role anon;
select throws_ok($$select * from public.product_popularity()$$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
