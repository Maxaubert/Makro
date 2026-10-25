begin;
select plan(2);

select lives_ok(
  $$insert into public.misses (type, ean, product_id) values ('wrong_value', '7038010000001', repeat('x', 184))$$,
  'a 184-character product id is stored (the longest id in db-2026.10.18)');
select throws_ok(
  $$insert into public.misses (type, ean, product_id) values ('wrong_value', '7038010000001', repeat('x', 1025))$$,
  '23514', null, 'a product id over 1024 characters is refused');

select * from finish();
rollback;
