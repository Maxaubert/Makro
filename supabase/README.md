# supabase/

Makro's backend (decision #20: Supabase free plan, Frankfurt). Everything here deploys from `master` through the Supabase GitHub integration.

- `migrations/`: schema, in order. Tables are private by default: RLS on, no grants to `anon` or `authenticated` unless a migration says so.
- `functions/submit-miss/`: anonymous, insert-only product misses (#13, #33). No user id; callers are hashed only to rate-limit (60 an hour).
- `tests/database/`: pgTAP. Fails if any public table has RLS off or if the anon key can reach the miss tables.

Read the most-missed products in the SQL editor: `select * from public.miss_summary limit 50;`

Run locally (Docker needed): `npx supabase db start`, `npx supabase test db`, `deno test supabase/functions/`.

Deploys: merging to master applies new migrations to the Frankfurt project through the Supabase GitHub integration (working directory `.`, production branch `master`).
