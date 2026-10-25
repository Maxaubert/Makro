# Test map

Every test suite in the repo: what it guards, where it lives, how to run it. Extend an existing suite before adding a new one, and add a row here when you add one.

| Suite | Guards | Location | Command | Runs in |
|---|---|---|---|---|
| Database (pgTAP) | RLS is on for every public table; the anon key can't reach the miss tables; the function role can insert and upsert a miss but not read it; the products bucket is private and read-only for signed-in users | `supabase/tests/database/` | `npx supabase@2.121.0 test db` | GitHub Actions on PRs touching `supabase/` |
| Sync (pgTAP, #34) | The 7 synced tables: two-user RLS, no anon access, no DELETE grant, server fields ignored, last-write-wins with tombstones, millisecond clock clamp, gap-free cursor and paging, natural-key collisions tombstone the loser, generated totals match `nutrition/portion.json` (cases copied into the test), old protocol refused | `supabase/tests/database/sync.test.sql` | `npx supabase@2.121.0 test db` (on Windows, pipe the file into `psql` in the `supabase_db_Makro` container) | GitHub Actions on PRs touching `supabase/` |
| Edge Functions (Deno) | `submit-miss` payload validation | `supabase/functions/**/*_test.ts` | `deno test supabase/functions/` | GitHub Actions on PRs touching `supabase/` |
| Web unit and golden files (Vitest) | Search normalisation, portion maths, display rounding, totals with unknowns and grams per unit against `packages/contracts/` (`search/normalise.json`, `nutrition/portion.json`, `display.json`, `totals.json`, `grams.json`); UUIDv7; `local_date` and `tz` | `apps/web/src/**/*.test.ts` | `npm test` in `apps/web` | GitHub Actions on PRs touching `apps/web/` or `packages/contracts/` |
| Web smoke (Playwright) | App shell loads; the full local-Supabase flow arrives in B5 | `apps/web/tests/e2e/` | `npm run test:e2e` in `apps/web` | local only for now |

## Planned

| Suite | Guards | Issue |
|---|---|---|
| Swift package tests (Swift Testing, `swift test`) | Domain logic, maths, search normalisation, persistence | #21 |
| Golden files | Portion maths, totals with unknowns, goal maths, Norwegian search results | #32 |
| Voice test set | Product and quantity accuracy of voice logging (90% gate) | #35 |
| App UI tests | Core flows on the simulator | #21 |
