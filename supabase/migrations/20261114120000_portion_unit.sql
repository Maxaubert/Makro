-- Decision 42: foods stored per portion (restaurants that print values per portion and no weight, such as Burger King
-- Norway). A log entry for such a food has unit 'portion' and snapshot per_100_unit 'portion'; grams holds 100 per
-- portion, so the generated totals (value * grams / 100) are the printed per-portion values times the portions.
-- Only the check constraints widen; no column and no generated total changes.

alter table public.log_entries drop constraint if exists log_entries_unit_check;
alter table public.log_entries add constraint log_entries_unit_check
  check (unit in ('g', 'ml', 'piece', 'serving', 'portion'));

alter table public.log_entries drop constraint if exists log_entries_per_100_unit_check;
alter table public.log_entries add constraint log_entries_per_100_unit_check
  check (per_100_unit in ('g', 'ml', 'portion'));

alter table public.saved_meal_items drop constraint if exists saved_meal_items_unit_check;
alter table public.saved_meal_items add constraint saved_meal_items_unit_check
  check (unit in ('g', 'ml', 'piece', 'serving', 'portion'));
