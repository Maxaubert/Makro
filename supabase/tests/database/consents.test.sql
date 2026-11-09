-- consents: who agreed to what, and when they withdrew (#15, #67).
begin;
select plan(11);

create schema tests;
grant usage on schema tests to authenticated, anon;
create function tests.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.test');

select ok((select relrowsecurity from pg_class where oid = 'public.consents'::regclass), 'RLS is on');

set local role authenticated;
select tests.as_user('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.consents (kind, text_version) values ('health_data', '2026-11-09')$$, 'a user records their consent');
select is((select user_id::text from public.consents where kind = 'health_data'), '00000000-0000-4000-8000-00000000000a', 'it belongs to that user');
select throws_ok($$insert into public.consents (kind, text_version) values ('health_data', '2026-11-09')$$, '23505', null, 'only one active consent of a kind');
select throws_ok($$insert into public.consents (kind, text_version) values ('marketing', '1')$$, '23514', null, 'unknown kinds are refused');
select throws_ok($$insert into public.consents (kind, text_version, granted_at) values ('popularity', '1', '2000-01-01')$$, '42501', null, 'the server sets granted_at');

select tests.as_user('00000000-0000-4000-8000-00000000000b');
select is((select count(*) from public.consents), 0::bigint, 'nobody sees another user''s consent');

select tests.as_user('00000000-0000-4000-8000-00000000000a');
update public.consents set withdrawn_at = now() where kind = 'health_data' and withdrawn_at is null;
select isnt((select withdrawn_at from public.consents where kind = 'health_data'), null, 'withdrawing stamps the row');
update public.consents set withdrawn_at = null where kind = 'health_data';
select isnt((select withdrawn_at from public.consents where kind = 'health_data'), null, 'a withdrawal cannot be undone by editing it');
select lives_ok($$insert into public.consents (kind, text_version) values ('health_data', '2026-11-10')$$, 'consent can be given again after withdrawing');

reset role;
set local role anon;
select throws_ok($$select * from public.consents$$, '42501', null, 'anon has no access');

select * from finish();
rollback;
