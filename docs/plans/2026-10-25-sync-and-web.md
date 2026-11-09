# Sync backend (#34) and web client (#46): spec and plan

Date: 2026-10-25. Author: Max (with Claude). Status: **approved by Max 2026-10-25** (hosting: Vercel). Building has started; real logging waits for Nima's yes on decision 34 (#58) and the contracts (#47, #50, #51).

Goal: Max logs his food daily from a browser (PC and phone), into the same rows the iPhone app will use later, so nothing is migrated when the app arrives.

Built on: `packages/contracts/log-schema.md` v1 (#50), `packages/contracts/products-db.md` (#47), golden files (#51), decision 34 (#58), product file v1 (`schema_version` 2, nutrition-data#6, merged).

---

## Part A: the sync backend (#34)

### What it is
Supabase tables for each user's own data, plus two functions: **push** (send my changes) and **pull** (give me what changed since my last pull). Every client (web now, phone later) uses only these.

### Tables (one migration, exactly the v1 contract)
`log_entries`, `custom_foods`, `saved_meals`, `saved_meal_items`, `favourites`, `goals`, `weight_entries`.

Every table has the sync fields from the contract:
- `id` uuid (UUIDv7, made by the client; a `CHECK` that the version nibble is 7)
- `created_at`, `updated_at`, `deleted_at`
- `user_id` (server only, `default auth.uid()`)
- `server_seq` (server only)

Nutrients are `double precision`, nullable. `log_entries` has the eight stored generated totals (`kcal * grams / 100` and so on), never written by a client.

### Rules, enforced in the database (so no client can break them)
A `BEFORE INSERT OR UPDATE` trigger on every table:
1. **Server fields:** sets `user_id = auth.uid()` and ignores any `user_id` or `server_seq` the client sent.
2. **Clock clamp:** `updated_at = least(client value, date_trunc('milliseconds', now()))`.
3. **Last-write-wins:** an update whose `updated_at` is not later than the stored one is skipped (on a tie the server copy wins). Deleting means setting `deleted_at`, so the same rule applies. Clients get no `DELETE` grant.
4. **Gap-free cursor:** `server_seq` comes from a per-user counter row (`sync_counters`), taken with `SELECT ... FOR UPDATE` inside the transaction. Writes for one user are serialised, so a pull "after seq N" can never skip a row.

Row-level security on every table, policy `user_id = auth.uid()` for select, insert and update. No grants to `anon`.

### Functions (run as the signed-in user, not the service role)
- `sync_push(protocol int, changes jsonb) returns jsonb`: applies a batch of rows across tables in one transaction and returns, per row, `applied` or `stale`. It is idempotent by `id`, so a retry after a dropped connection is safe.
  - **Natural-key collisions** (favourites, goals per `effective_from`, weight `source` + `external_id`): the later `updated_at` wins and the loser is tombstoned in the same transaction. A push never fails on a unique index.
- `sync_pull(protocol int, since bigint, max int) returns jsonb`: returns the rows with `server_seq > since`, ordered, across all tables, plus the new cursor and `more: true|false`.
- `protocol` is a **sync protocol version**, separate from the phone's `pragma user_version`. The server refuses one that is too old, with a clear error.

### Sign-in (decision 34)
- **Email one-time code.** Hosted Auth and `supabase/config.toml` get `enable_signup = false`, so nobody can create an account. Max invites Nima from the Supabase dashboard.
- Signed-in users are therefore exactly the two of you, so the products bucket (#48) stays readable only by you two.
- Supabase's built-in email sender allows only a few mails an hour. That's enough for two people; a custom SMTP comes before the friend beta.

### Tests (pgTAP, test first)
- Two-user RLS: user B sees and changes nothing of user A's, in every table.
- `anon` has no access, and every table has RLS on (the existing check covers new tables).
- Server fields from a client are ignored.
- Last-write-wins: newer wins, older is `stale`, a tie keeps the server copy, a tombstone wins when newer, and an edit after a tombstone revives the row only when newer.
- Clock clamp, with millisecond precision.
- Cursor: two pushes, then a pull returns everything in order with no gaps, and paging with `max` works.
- Natural-key collision: two favourites for one product leave one live and one tombstoned, with no error.
- Generated totals: NULL stays NULL, and the per-100 formula matches the cases in `nutrition/portion.json`, copied into the test until #51 lands.
- An old protocol version is refused.

### Docs
`docs/SYNC.md` covers the conflict rule, clock, cursor, tombstones (kept forever in the MVP), RPC names and signatures, the protocol version and idempotency. It also notes that #34's done condition is now "the web client syncs and the two-user tests pass" (decision 34).

### Not in this part
Account deletion with the Apple revoke (slice 10, before the friend beta). No Apple sign-in yet.

---

## Part B: the web client (`apps/web`, #46)

### Stack
The same stack Max already runs in Dashboard-react, so there's nothing new to learn:
- Vite, React 18, TypeScript, Tailwind 4, `@supabase/supabase-js`, Vitest, Playwright
- Plus `@sqlite.org/sqlite-wasm`: real SQLite with FTS5 in the browser, the same engine as the phone
- Plus `vite-plugin-pwa`: installable, works offline

Each new dependency gets a reason in the PR (AGENTS.md).

### How it works
1. **Sign in** with an email code.
2. **Product file:** downloaded once from the private bucket with a short-lived signed link. The client checks the sha256 and refuses `schema_version` below 2. The file is kept in the browser's private storage (OPFS, through the `opfs-sahpool` VFS). It's 43.8 MB unpacked and 11.9 MB to download, and it's fetched again only when a newer `db_version` is published.
   - **Installing it on the phone's home screen** (PWA) keeps Safari from deleting it after 7 days of no use.
3. **Local log store:** a second SQLite file in OPFS with the same tables as `log.sqlite`, plus an **outbox**. Every save goes there first, so logging works without signal (rule 5, decision 8). A sync loop pushes the outbox and pulls changes whenever there's a connection, on app start, and every few minutes.
4. **Search:** the same FTS5 query and the same Norwegian normalisation as the phone, checked by `search/normalise.json`.
5. **Saving an entry:** the snapshot is copied from the product (name, brand, source, verified, `db_version`, per-100 values, `per_100_unit`). `grams` comes from the amount: g = as entered, ml = 1:1 (shown as approximate), piece/serving = quantity × `serving_g`. Portion and display numbers come from TypeScript code that must pass `nutrition/portion.json` and `display.json` (decision 34). The server computes the stored totals.
6. **Not found:** becomes a custom food immediately (`custom_foods` row) and an anonymous miss through `submit-miss` with the v1 payload (#57).

### Screens (from the B Night canvas; no screen without a design there)
| Screen | v1 content |
|---|---|
| Sign in | Email, 6-digit code |
| Today | Half-ring kcal gauge and macro rings with the day's totals. A target shows only if a `goals` row exists (written by the phone later). Unknown values are counted and shown, never as 0. |
| Diary | Entries per meal (breakfast, lunch, dinner, snack); edit amount, move meal, delete (tombstone) |
| Add food: search | Search box, results with source and verified badge (rule 4), recents |
| Add food: portion | Amount + unit (g, ml, piece, serving), live kcal and macros for that portion |
| Type the code | Type a barcode by hand (browsers on iPhone can't scan), canonical lookup |
| Not in database / custom food | Name, brand, per-100 values (empty = unknown), unit g or ml |
| Weight | Add weight, simple list. The bar chart comes later. |

The layout is the phone column from the canvas. On a PC it's a centred column at first; a wider dashboard layout comes later.

**Out of v1:** setting goals (goal maths are Swift only), saved meals, voice, photos, the camera scanner and light mode.

### Tests (test first)
- Vitest:
  - golden-file runners for `search/normalise.json`, `nutrition/portion.json` and `display.json`
  - grams resolution per unit
  - snapshot building (null never becomes 0)
  - the outbox (queue, retry, idempotent ids, stale results)
  - UUIDv7 generation
  - `local_date` and `tz` from the browser's time zone
- A Playwright smoke test against the local Supabase: sign in, search "skyr", log 150 g, see the totals, then go offline, log, come back online and see it synced.
- A GitHub Actions job for `apps/web` (lint, typecheck, Vitest), and rows in `TEST-MAP.md`.

### Hosting
Vercel, like Dashboard-react: static files only, while all data stays in Supabase in Frankfurt. The deploy waits until real logging is approved.

### Product file into the bucket
- nutrition-data's release workflow gets a step that uploads both files and `checksums.txt` to the bucket.
- **The billing block** stops releases from running. Until it's fixed, a small script in nutrition-data builds locally and uploads with the service key, which is kept only in Max's local environment and never in a file.

---

## Plan and order

| # | Task | PR | Depends on |
|---|---|---|---|
| A1 | Migration: the 7 tables, sync fields, generated totals, RLS, triggers, counter, no `DELETE` grant | Makro, #34 | – |
| A2 | `sync_push` / `sync_pull` with protocol check and collision handling | same PR | A1 |
| A3 | pgTAP suite (above), `docs/SYNC.md`, sign-up off in `config.toml` | same PR | A1–A2 |
| B0 | Product file to the bucket: release step plus local upload script | nutrition-data | – |
| B1 | `apps/web` skeleton: Vite/React/TS/Tailwind, PWA, CI job, B Night tokens | Makro, #46 | – |
| B2 | Golden-file runners + portion/grams/display + normalisation in TS | same PR | B1 |
| B3 | Local stores in OPFS (product file download + checks, log db + outbox) and sync loop | same PR | A2, B1 |
| B4 | Screens: sign in, search, portion, type the code, custom food + miss, Today, Diary, Weight (impeccable for the UI) | same PR or a follow-up | B2, B3 |
| B5 | Playwright smoke test, TEST-MAP, README for `apps/web` | same PR | B4 |

Two Makro PRs (#34, then #46) and one nutrition-data PR. Each Makro PR waits for Nima's review before merge (AGENTS.md). All work is tested against the local Supabase in Docker; nothing reaches the hosted project before merge, because pushing to master deploys migrations.

**Day one of real logging** = #58, #47, #50, #51 approved by Nima, and the #34 and #46 PRs merged. Then: turn sign-up off on the hosted project, invite Nima, upload the product file and deploy to Vercel.

## Risks and choices to confirm
- **The contracts may still change in Nima's review.** Then only code changes; no real data exists yet.
- **AGENTS.md vs generated columns:** the total columns are SQL maths. #50 asks Nima to accept this one formula, and the plan assumes he does.
- **`portion.json` covers per-100 × grams, but not quantity × `serving_g`.** Grams-resolution cases are added to the golden files in the same PR.
- **Hosting on Vercel** (a US company, static files only). The alternative is Cloudflare Pages. The data never leaves Supabase Frankfurt either way.

## Hosted setup done (2026-11-08)
- Hosted Auth: public sign-up is off. Max's user (aubert@post.com) was created by hand in the dashboard and is confirmed. Nima is not invited yet (Max's call).
- Email templates cannot be edited without a custom SMTP server, so the built-in "Magic link or OTP" mail has a sign-in link and no 6-digit code. The web client (#60) only verifies a code today. Before the first real sign-in: either set the project's Site URL to the Vercel address so the link signs in (supabase-js reads the session from the URL), or set up SMTP and add `{{ .Token }}` to the template.
- Product file v1 is in the bucket: `db-2026.11.08` (schema_version 2, 116,033 products, sha256 of products.sqlite `460fcb12…81cd9`). It was built and uploaded locally with the release-db steps because the loftspace org had used its included Actions minutes for November ($12 of $12). The secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in loftspace/nutrition-data, so the workflow works again once Actions can run.
- Merged on 2026-11-08: #59 (sync backend), #57 (submit-miss v1) and #60 (web client). Both migrations are live on the hosted project. `submit-miss` v18 was deployed by hand (verify_jwt off) because deploy-functions could not run.
- Web app: https://makro-steel.vercel.app (Vercel project `makro`, account max01230aub-7964). Deployed from a local `npm run build` of `apps/web/dist` with `VITE_SUPABASE_URL` and the anon key; no Git integration yet, so redeploy by hand after changes. The Supabase Site URL points there, so the default sign-in mail's link logs in.
- 2026-11-08: Maxaubert/Makro made public (Max's call) so GitHub Actions run free. The web CI rerun passed right after. loftspace/nutrition-data is still private and still blocked until the minutes reset.
- 2026-11-08, after Max's first logging: #61 (foods count, recents first, last amount) and #62 (last amount through redirects) merged and deployed. Product database db-2026.11.08-2 (loftspace/nutrition-data#8: flavour families, tidy names; 116,033 → 103,425 products) released locally and uploaded to the bucket. Use `YYYY.MM.DD-N` for a second release on one day: `upload_to_bucket.py` rejects `YYYY.MM.DD.N`.
- 2026-11-08, later: Max asked for product lines ("Protein Melk" = "YT Proteinmelk", Kakao is a flavour). loftspace/nutrition-data#9 merged; db-2026.11.08-3 released and uploaded (101,903 products). Range 10%, same brand needed when names differ; 7,109 Jev calls in total for families (two approved batches).
- 2026-11-08, sweep after Max found two YT Proteinpudding rows: loftspace/nutrition-data#10 (salt gap 0.5 g, names compared as word sets, empty listings fold into their product). db-2026.11.08-4 released and uploaded (96,528 products). About 3,100 same-name groups stay apart because their sources disagree by more than 25%.
- 2026-11-08, after Max asked for a Haiku pass: loftspace/nutrition-data#11 (Haiku read every branded row, unsure groups checked by Sonnet; unverified rows with no macros or with a verified twin dropped; names without sizes). db-2026.11.08-5 released and uploaded (60,474 products).
- 2026-11-08: loftspace/nutrition-data#12 (unverified shop duplicates absorbed into verified families; unverified rows without kcal dropped). db-2026.11.08-6 released and uploaded via the Supabase CLI token, no dashboard (59,549 products).
- 2026-11-08: loftspace/nutrition-data#13: `data/curated.json`, a fixed product list applied before all other rules (YT by hand: 14 products from 124 rows; dairy built with Gemini via `agy`, checked by code and by hand). db-2026.11.08-7 released and uploaded (59,203 products).

**2026-11-09:** curated brand lists (8,465 products, nutrition-data #14), compound words in search (#15), release `db-2026.11.09-2` uploaded via CLI. Search ranks by your own and everyone's logging (Makro #64, #65, decisions 36 and 37). Global counts stay empty until 3 people log the same foods. Curating brands: `agy` Gemini quota ran out after 55 of 129 batches, so the last 74 ran on Claude Sonnet; expect Argon to be back around 2026-11-15.

**2026-11-09, later:** consent and first-run onboarding are live (#67, #15; Makro #68 to #71, decision 38, plan in `2026-11-09-consent-and-onboarding.md`). Every signed-in user sees setup once. Friend invites stay on hold: see the decision note on #15. Labels and dairy names are in `db-2026.11.09-3`. Follow-ups: #72, #73, #74.

**2026-11-09, evening:** merged and deployed #75 to #81: missed-product CORS, edit goals, weight chart and trend, favourites, saved meals, repeat yesterday, search typos, barcode camera, weekly average and guidance. Not tried on a real phone; the camera has never read a real barcode. #27 still needs the end-of-day screen (where a confirmed day is stored is undecided). #74 awaits a decision.
