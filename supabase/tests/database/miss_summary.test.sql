begin;
select plan(3);

insert into public.misses (type, ean, app_version) values
  ('scan_not_found', '7038010000001', '0.1.0'),
  ('scan_not_found', '7038010000001', '0.1.0'),
  ('scan_not_found', '7038010000002', '0.1.0-debug'),
  ('scan_not_found', '7038010000003', null);

select is((select times from public.miss_summary where miss_key = '7038010000001'), 2::bigint, 'repeat misses of one barcode are counted together');
select is((select count(*) from public.miss_summary where miss_key = '7038010000002'), 0::bigint, 'debug-build misses are left out');
select is((select count(*) from public.miss_summary where miss_key = '7038010000003'), 1::bigint, 'a miss with no app_version still counts');

select * from finish();
rollback;
