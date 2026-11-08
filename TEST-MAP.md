# Test map

Every test suite in the repo: what it guards, where it lives, how to run it. Extend an existing suite before adding a new one, and add a row here when you add one.

| Suite | Guards | Location | Command | Runs in |
|---|---|---|---|---|
| Database (pgTAP) | RLS is on for every public table; the anon key can't reach the miss tables; the function role can insert and upsert a miss but not read it; the products bucket is private and read-only for signed-in users; product ids up to 1024 characters fit in a miss | `supabase/tests/database/` | `npx supabase@2.121.0 test db` | GitHub Actions on PRs touching `supabase/` |
| Sync (pgTAP, #34) | The 7 synced tables: two-user RLS, no anon access, no DELETE grant, server fields ignored, last-write-wins with tombstones, millisecond clock clamp, gap-free cursor and paging, natural-key collisions tombstone the loser, generated totals match `nutrition/portion.json` (cases copied into the test), old protocol refused | `supabase/tests/database/sync.test.sql` | `npx supabase@2.121.0 test db` (on Windows, pipe the file into `psql` in the `supabase_db_Makro` container) | GitHub Actions on PRs touching `supabase/` |
| Edge Functions (Deno) | `submit-miss` payload validation, including the log-schema v1 nutrient keys and long product ids | `supabase/functions/**/*_test.ts` | `deno test supabase/functions/` | GitHub Actions on PRs touching `supabase/` |
| Web unit and golden files (Vitest) | Search normalisation, portion maths, display rounding, totals with unknowns and grams per unit against `packages/contracts/` (`search/normalise.json`, `nutrition/portion.json`, `display.json`, `totals.json`, `grams.json`); UUIDv7; `local_date` and `tz`; entry snapshots and the v1 miss payload (null never becomes 0); canonical barcodes (`products-db.md` cases, until `search/barcode.json` lands); product file checks (both sha256 values, `schema_version` 2 or newer, re-download only on a newer `db_version`, a failed install keeps the old file); FTS search, ranking, id redirects and barcode lookup on the fixture `products.sqlite`; the local log store and outbox (coalescing, in-flight edits, stale and rejected results, pull pages (server copy wins unless a change is waiting to push, fast-clock case), one account per log); the sync loop and scheduler (batching, paging, retries, offline, restart after sign-out); the miss payload against the repo's `submit-miss` validator | `apps/web/src/**/*.test.ts` | `npm test` in `apps/web` | GitHub Actions on PRs touching `apps/web/` or `packages/contracts/` |
| Web sync against Postgres (Vitest) | The web LogStore and sync loop against the real `sync_push` / `sync_pull`: entries, custom foods and weights round-trip between two devices, server totals keep NULL, tombstones travel | `apps/web/src/data/sync.integration.test.ts` | `npm run test:local` in `apps/web` (local stack running, after `db reset`) | local only (needs Docker) |
| Web smoke (Playwright) | Sign-in screen; then against the local stack and the fixture DB: sign in with an email code, search skyr, log 150 g, totals (unknown fibre shows ?), go offline, log, back online, both rows in Postgres with server totals | `apps/web/tests/e2e/` | `npm run test:e2e` in `apps/web` (local stack running) | local only (needs Docker) |

## Planned

| Suite | Guards | Issue |
|---|---|---|
| Swift package tests (Swift Testing, `swift test`) | Domain logic, maths, search normalisation, persistence | #21 |
| Golden files | Portion maths, totals with unknowns, display rounding, goal maths (Swift only); search normalisation (Swift and Python); search results (Swift) | #32 |
| Voice test set | Product and quantity accuracy of voice logging (90% gate) | #35 |
| App UI tests | Core flows on the simulator | #21 |
