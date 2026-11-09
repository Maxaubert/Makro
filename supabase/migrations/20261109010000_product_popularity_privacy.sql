-- Tighten product_popularity() (decision 37). The caller's own logs no longer count toward the
-- floor: at least 2 OTHER people must have logged a product, so nobody can log a food and read
-- back whether one specific other person logged it too. Over-long ids are left out, so one row
-- cannot grow every client's cache.
create or replace function public.product_popularity()
returns table (product_id text, users integer, logs integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.product_id, count(distinct e.user_id)::integer as users, count(*)::integer as logs
    from public.log_entries e
   where e.deleted_at is null and e.product_id is not null and char_length(e.product_id) <= 1024
   group by e.product_id
  having count(distinct e.user_id) filter (where e.user_id is distinct from (select auth.uid())) >= 2
   order by users desc, logs desc, e.product_id
   limit 1000
$$;

revoke all on function public.product_popularity() from public, anon;
grant execute on function public.product_popularity() to authenticated;
