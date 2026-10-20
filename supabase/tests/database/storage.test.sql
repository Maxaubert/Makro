begin;
select plan(7);

select is((select public from storage.buckets where id = 'products'), false, 'the products bucket is private');

-- A file as the release upload would leave it.
insert into storage.objects (bucket_id, name) values ('products', 'products.sqlite.gz');

set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'products'), 0::bigint, 'anon cannot see the product files');

set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'products'), 1::bigint, 'a signed-in user can see the product files');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('products', 'evil.sqlite.gz')$$, '42501', null, 'a signed-in user cannot upload to the bucket');

update storage.objects set name = 'renamed' where bucket_id = 'products';
select is((select count(*) from storage.objects where bucket_id = 'products' and name = 'products.sqlite.gz'), 1::bigint, 'a signed-in user cannot rename the files (deleting is blocked by Storage itself)');

reset role;
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'signed-in users read the product database'), 1::bigint, 'the read policy exists');
select is((select file_size_limit from storage.buckets where id = 'products'), 52428800::bigint, 'the bucket limits a file to 50 MB');

select * from finish();
rollback;
