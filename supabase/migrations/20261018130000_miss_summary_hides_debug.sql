-- Debug builds send app_version ending in -debug (client contract in supabase/README.md).
-- Keep their misses out of the summary so test scans never look like real gaps.
create or replace view public.miss_summary with (security_invoker = true) as
select
  type,
  miss_key,
  count(*) as times,
  min(created_at) as first_seen,
  max(created_at) as last_seen,
  (array_agg(query_text order by created_at desc))[1] as sample_text,
  array_remove(array_agg(distinct language), null) as languages
from public.misses
where coalesce(app_version, '') not like '%-debug'
group by type, miss_key
order by count(*) desc;
