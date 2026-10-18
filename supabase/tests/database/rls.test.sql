begin;
select plan(9);

-- Every table in public must have RLS on (#33).
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint,
  'every public table has row level security enabled'
);

-- The anon and authenticated keys cannot touch the miss tables at all.
set local role anon;
select throws_ok($$select 1 from public.misses$$, '42501', null, 'anon cannot read misses');
select throws_ok($$insert into public.misses (type, ean) values ('scan_not_found', '7038010000000')$$, '42501', null, 'anon cannot insert misses directly');
select throws_ok($$select 1 from public.miss_summary$$, '42501', null, 'anon cannot read the summary');
select throws_ok($$select public.miss_rate_check('x', 1)$$, '42501', null, 'anon cannot call the rate limiter');

set local role authenticated;
select throws_ok($$select 1 from public.misses$$, '42501', null, 'signed-in users cannot read misses');

-- The function runs as service_role: it can insert a miss, and only insert.
set local role service_role;
select lives_ok($$insert into public.misses (type, ean) values ('scan_not_found', '7038010000000')$$, 'service_role can insert a miss');
select throws_ok($$select 1 from public.misses$$, '42501', null, 'service_role cannot read misses');

reset role;
-- The table itself rejects a row with no barcode and no text.
select throws_ok($$insert into public.misses (type) values ('scan_not_found')$$, '23514', null, 'a miss needs an ean or text');

select * from finish();
rollback;
