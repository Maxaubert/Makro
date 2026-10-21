# Test map

Every test suite in the repo: what it guards, where it lives, how to run it. Extend an existing suite before adding a new one, and add a row here when you add one.

| Suite | Guards | Location | Command | Runs in |
|---|---|---|---|---|
| Database (pgTAP) | RLS is on for every public table; the anon key can't reach the miss tables; the function role can insert and upsert a miss but not read it; the products bucket is private and read-only for signed-in users | `supabase/tests/database/` | `npx supabase@2.121.0 test db` | GitHub Actions on PRs touching `supabase/` |
| Edge Functions (Deno) | `submit-miss` payload validation | `supabase/functions/**/*_test.ts` | `deno test supabase/functions/` | GitHub Actions on PRs touching `supabase/` |
| Voice scorer (unittest) | The scorer that measures the 90% voice gate: one-to-one item matching, units, missing output, the gate and the breakdown | `eval/voice/test_score.py` | `python -I -m unittest discover -s eval/voice` | GitHub Actions on PRs touching `eval/` |

## Planned

| Suite | Guards | Issue |
|---|---|---|
| Swift package tests (Swift Testing, `swift test`) | Domain logic, maths, search normalisation, persistence | #21 |
| Golden files | Portion maths, totals with unknowns, goal maths, Norwegian search results | #32 |
| Voice test set (the real lines) | Product and quantity accuracy of voice logging, 90% gate. The scorer exists; the 100 to 200 lines do not yet | #35 |
| App UI tests | Core flows on the simulator | #21 |
