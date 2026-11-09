-- The server sets the withdrawal time, so a client cannot backdate the consent record (#15).
create function private.consents_stamp_withdrawal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null then
    new.withdrawn_at := now();
  end if;
  return new;
end
$$;

create trigger consents_stamp_withdrawal before update on public.consents
  for each row execute function private.consents_stamp_withdrawal();

alter table public.consents
  add constraint consents_withdrawn_after_granted check (withdrawn_at is null or withdrawn_at >= granted_at);
