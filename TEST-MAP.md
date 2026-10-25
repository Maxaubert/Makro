# Test map

Every test suite in the repo: what it guards, where it lives, how to run it. Extend an existing suite before adding a new one, and add a row here when you add one.

| Suite | Guards | Location | Command | Runs in |
|---|---|---|---|---|
| Database (pgTAP) | RLS is on for every public table; the anon key can't reach the miss tables; the function role can insert and upsert a miss but not read it; the products bucket is private and read-only for signed-in users; product ids up to 1024 characters fit in a miss | `supabase/tests/database/` | `npx supabase@2.121.0 test db` | GitHub Actions on PRs touching `supabase/` |
| Edge Functions (Deno) | `submit-miss` payload validation, including the log-schema v1 nutrient keys and long product ids | `supabase/functions/**/*_test.ts` | `deno test supabase/functions/` | GitHub Actions on PRs touching `supabase/` |

## Planned

| Suite | Guards | Issue |
|---|---|---|
| Swift package tests (Swift Testing, `swift test`) | Domain logic, maths, search normalisation, persistence | #21 |
| Golden files | Portion maths, totals with unknowns, goal maths, Norwegian search results | #32 |
| Voice test set | Product and quantity accuracy of voice logging (90% gate) | #35 |
| App UI tests | Core flows on the simulator | #21 |
