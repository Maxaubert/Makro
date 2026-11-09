-- How many people log each product, for search ranking (decision 36).
-- Security definer because RLS limits log_entries to the caller's own rows. It returns only a
-- product id and two counts, and only for products at least two people have logged, so nobody
-- can see what one other person eats.
create function public.product_popularity()
returns table (product_id text, users integer, logs integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.product_id, count(distinct e.user_id)::integer as users, count(*)::integer as logs
    from public.log_entries e
   where e.deleted_at is null and e.product_id is not null
   group by e.product_id
  having count(distinct e.user_id) >= 2
   order by users desc, logs desc, e.product_id
   limit 1000
$$;

revoke all on function public.product_popularity() from public, anon;
grant execute on function public.product_popularity() to authenticated;
