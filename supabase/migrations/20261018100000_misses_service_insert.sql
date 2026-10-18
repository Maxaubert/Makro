-- auto_expose_new_tables is off, so the function's role needs an explicit grant.
-- Insert only: the function can add a miss but never read or change one.
grant insert on public.misses to service_role;
