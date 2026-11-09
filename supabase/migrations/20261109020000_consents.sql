-- Who agreed to what, and when they withdrew (#15, #67). A withdrawal is one-way: giving consent
-- again adds a new row, so the history can show what was agreed and when (GDPR Art. 7(1)).
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('health_data', 'popularity')),
  text_version text not null check (char_length(text_version) between 1 and 40),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create unique index consents_one_active on public.consents (user_id, kind) where withdrawn_at is null;

alter table public.consents enable row level security;

create policy consents_select_own on public.consents for select to authenticated
  using (user_id = (select auth.uid()));
create policy consents_insert_own on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()) and withdrawn_at is null);
create policy consents_withdraw_own on public.consents for update to authenticated
  using (user_id = (select auth.uid()) and withdrawn_at is null)
  with check (user_id = (select auth.uid()) and withdrawn_at is not null);

grant select on public.consents to authenticated;
grant insert (kind, text_version) on public.consents to authenticated;
grant update (withdrawn_at) on public.consents to authenticated;

-- Popularity counts only people who chose to take part. Everything else is as in 20261109010000.
create or replace function public.product_popularity()
returns table (product_id text, users integer, logs integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.product_id, count(distinct e.user_id)::integer as users, count(*)::integer as logs
    from public.log_entries e
    join public.consents c on c.user_id = e.user_id and c.kind = 'popularity' and c.withdrawn_at is null
   where e.deleted_at is null and e.product_id is not null and char_length(e.product_id) <= 1024
   group by e.product_id
  having count(distinct e.user_id) filter (where e.user_id is distinct from (select auth.uid())) >= 2
   order by users desc, logs desc, e.product_id
   limit 1000
$$;

revoke all on function public.product_popularity() from public, anon;
grant execute on function public.product_popularity() to authenticated;
