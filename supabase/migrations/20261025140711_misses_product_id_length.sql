-- Product ids are unbounded in the products-db contract; 15,083 ids in db-2026.10.18 are longer
-- than 40 characters (the longest is 184). Keep a generous cap only to stop abuse of the
-- anonymous endpoint. Matches PRODUCT_ID_MAX in supabase/functions/submit-miss/validate.ts.
alter table public.misses drop constraint misses_product_id_check;
alter table public.misses add constraint misses_product_id_check check (char_length(product_id) <= 1024);
