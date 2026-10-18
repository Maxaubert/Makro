-- ON CONFLICT (id) needs to read the id column. Column-level only: the function
-- still cannot read any miss data (ean, text, custom food, ...).
grant select (id) on public.misses to service_role;
