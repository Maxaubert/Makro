# supabase/

Makro's backend (decision #20: Supabase free plan, Frankfurt, project ref `qhzytbcqzaauzckafhsj`).

- `migrations/`: schema, in order. Tables are private by default: RLS on, no grants to `anon` or `authenticated` unless a migration says so.
- `functions/submit-miss/`: anonymous, insert-only product misses (#13, #33). No user id; callers are hashed only to rate-limit.
- Sync (#34): the 7 per-user tables and the `sync_push` / `sync_pull` RPCs. Protocol and rules: `docs/SYNC.md`.
- `tests/database/`: pgTAP. Fails if any public table has RLS off, if the anon key can reach the miss tables, or if the products bucket is not private.

Read the most-missed products in the SQL editor: `select * from public.miss_summary limit 50;` (debug builds are left out).

Run locally (Docker needed): `npx supabase@2.121.0 db start`, `npx supabase@2.121.0 test db`, `deno test supabase/functions/`.

## How things deploy

- **Migrations** deploy when a PR merges to `master`, through the Supabase GitHub integration (working directory `.`, production branch `master`).
- **Edge Functions do not deploy from the integration.** Observed on 2026-10-18: merging a change to `submit-miss` left the deployed version unchanged. The `deploy-functions` workflow deploys them on every merge that touches `supabase/functions/`. It needs the repo secret `SUPABASE_ACCESS_TOKEN` (a Supabase personal access token); without it the job skips itself.

## Miss ingest: client contract (for the app's miss queue, slice 4 / #24)

`POST https://qhzytbcqzaauzckafhsj.supabase.co/functions/v1/submit-miss`, JSON body, no auth header needed. Browsers: the preflight and CORS headers are answered only for `https://makro-steel.vercel.app` and `http://localhost:5174` (`functions/submit-miss/handler.ts`, #72).

| Field | Required | Notes |
|---|---|---|
| `type` | yes | `scan_not_found`, `search_no_match`, `voice_no_match`, `wrong_value`, or `photo_custom` (reserved: photos are out of the MVP) |
| `id` | send always | A UUID you generate once per miss. Retrying with the same id never creates a duplicate. |
| `ean` or `query_text` | one of them | `ean` is 8 to 14 digits; `query_text` is at most 200 characters |
| `language`, `country`, `app_version` | no | `nb`, `NO`, `0.1.0`. A debug build must send an `app_version` ending in `-debug`; those misses are kept out of the summary. |
| `db_version`, `product_id` | for `wrong_value` | Which database release and product |
| `custom_food` | no | `{ name, brand, per100: { kcal, protein, carbs, fat, fibre }, serving_g }`. A missing value is `null`, never 0. The key names will be aligned with the shared vocabulary in #40. |

Unknown fields are dropped. There is no user id field, on purpose.

| Response | Meaning | What the app does |
|---|---|---|
| 201 | Stored (or already stored) | Remove it from the queue |
| 400 | The body is invalid | Drop it, do not retry |
| 405, 413 | Wrong method, body over 8 KB | Drop it, do not retry |
| 429 | Over 60 requests an hour from this address | Keep it, retry later |
| 500 | Server error | Keep it, retry later with a growing delay |

**Offline flush:** the limit is 60 an hour per address, so a queue longer than 60 takes more than an hour to flush. Send at most one miss every 5 seconds, stop on a 429 until the next hour, and the app never waits on the queue (accuracy rule 5: logging never blocks).

**Checked on 2026-10-18:** the limit works (60 accepted, the 61st gets 429), and a made-up `x-forwarded-for` header does not change which bucket a caller lands in. Not yet verified: that two different callers get separate buckets. Test from a second network.
