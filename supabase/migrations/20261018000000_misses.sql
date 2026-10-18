-- Product misses (#13, #33): anonymous, insert-only through the submit-miss Edge Function.
-- No user id anywhere. Nothing here is reachable with the anon or authenticated key.

create table public.misses (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('scan_not_found', 'search_no_match', 'voice_no_match', 'photo_custom', 'wrong_value')),
  ean text check (ean ~ '^[0-9]{8,14}$'),
  query_text text check (char_length(query_text) <= 200),
  language text check (language ~ '^[a-z]{2}(-[A-Za-z]{2})?$'),
  custom_food jsonb check (octet_length(custom_food::text) <= 4096),
  db_version text check (char_length(db_version) <= 40),
  product_id text check (char_length(product_id) <= 40),
  country text check (country ~ '^[A-Z]{2}$'),
  app_version text check (char_length(app_version) <= 20),
  created_at timestamptz not null default now(),
  -- what we count repeats by: the barcode, else the normalised text
  miss_key text generated always as (coalesce(ean, lower(btrim(regexp_replace(query_text, '\s+', ' ', 'g'))))) stored,
  check (ean is not null or query_text is not null)
);

create index misses_type_key_idx on public.misses (type, miss_key);

alter table public.misses enable row level security;
revoke all on public.misses from anon, authenticated;

-- Max reads this in the SQL editor: the most-missed products first.
create view public.miss_summary with (security_invoker = true) as
select
  type,
  miss_key,
  count(*) as times,
  min(created_at) as first_seen,
  max(created_at) as last_seen,
  (array_agg(query_text order by created_at desc))[1] as sample_text,
  array_remove(array_agg(distinct language), null) as languages
from public.misses
group by type, miss_key
order by count(*) desc;

revoke all on public.miss_summary from anon, authenticated;

-- Rate limit: hits per hashed caller per hour. The caller is never stored in the clear.
create table public.miss_rate_limit (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (bucket, window_start)
);

alter table public.miss_rate_limit enable row level security;
revoke all on public.miss_rate_limit from anon, authenticated;

create function public.miss_rate_check(p_bucket text, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := date_trunc('hour', now());
  n int;
begin
  delete from public.miss_rate_limit where window_start < now() - interval '2 hours';
  insert into public.miss_rate_limit (bucket, window_start) values (p_bucket, w)
  on conflict (bucket, window_start) do update set hits = public.miss_rate_limit.hits + 1
  returning hits into n;
  return n <= p_max;
end;
$$;

revoke all on function public.miss_rate_check(text, int) from public, anon, authenticated;
grant execute on function public.miss_rate_check(text, int) to service_role;
