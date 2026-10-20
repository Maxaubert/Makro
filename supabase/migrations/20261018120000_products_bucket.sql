-- Private bucket for the product database files (#46).
-- Signed-in users can read; nobody but the service role (the release upload) can write.
-- The free plan limits a file to 50 MB, so we store the gzipped files (about 14 MB and 5 MB).
insert into storage.buckets (id, name, public, file_size_limit)
values ('products', 'products', false, 52428800)
on conflict (id) do nothing;

create policy "signed-in users read the product database"
on storage.objects for select to authenticated
using (bucket_id = 'products');
