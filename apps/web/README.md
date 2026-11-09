# Makro web

Browser client for logging food (#46), on the same sync backend as the iPhone app (#34, `docs/SYNC.md`). Plan: `docs/plans/2026-10-25-sync-and-web.md`, part B. **Nothing is deployed.** Real logging waits for decision 34 (#58) and the contracts (#47, #50, #51).

Stack: Vite, React 18, TypeScript, Tailwind 4, `@supabase/supabase-js`, `@sqlite.org/sqlite-wasm` (SQLite with FTS5, the phone's engine) on the `opfs-sahpool` VFS, `vite-plugin-pwa`, Vitest, Playwright.

## How it works

1. **Sign in** with an email one-time code. Sign-up is off; accounts are invited.
2. **Product file:** `latest.json` from the private `products` bucket (signed link), then `products.sqlite.gz`. The client checks the compressed and the unpacked sha256, refuses `schema_version` below 2, keeps the file in OPFS and downloads again only for a newer `db_version`.
3. **Local log:** a second SQLite file in OPFS with the log-schema v1 tables and an outbox. Every save goes there first, so logging works offline.
4. **Sync:** the outbox goes up through `sync_push`, changes come down through `sync_pull` (paged by cursor). It runs on start, on reconnect, shortly after each save and every 3 minutes.
5. **Not found:** becomes a custom food at once and an anonymous miss to `submit-miss` (v1 payload, needs #57).

Both SQLite files live in a Web Worker (`src/worker/db.worker.ts`), because `opfs-sahpool` needs synchronous OPFS handles. It allows one tab at a time.

## Run it locally

Needs Docker. From the repo root:

```sh
npx supabase@2.121.0 start -x edge-runtime   # on Windows the edge runtime fails to start (Docker Desktop copy bug)
npx supabase@2.121.0 db reset                # applies every migration, the sync tables included
```

Then in `apps/web`:

```sh
npm install
npm run env:local    # writes .env.development.local with the LOCAL url and anon key (git-ignored)
npm run dev          # builds the fixture product file, serves http://localhost:5174
```

Sign-up is off, so create a user first (Studio at http://127.0.0.1:54323, or the admin API). The sign-in mail lands in Mailpit at http://127.0.0.1:54324. The default local template has only a link; the e2e test then issues a code with the admin API.

### Environment variables

| Variable | What |
|---|---|
| `VITE_SUPABASE_URL` | Supabase API URL (local: `http://127.0.0.1:54321`) |
| `VITE_SUPABASE_ANON_KEY` | The project's anon (publishable) key. Public by design; RLS protects the data |
| `VITE_PRODUCTS_SOURCE` | `fixture` loads `scripts/out/products-fixture.sqlite` through the dev server instead of the bucket. Dev server only; a build always uses the bucket |

Never put a service role key in a `VITE_` variable: everything `VITE_` ends up in the browser.

### The fixture product file

`npm run fixture` (`scripts/build-fixture.mjs`) builds a seven-product `products.sqlite` in the exact v1 shape (`schema_version` 2): skyr (fibre unknown), a skyr with no nutrition, a drink per 100 ml, a product with null `serving_g`, an EAN-8 stored padded, a redirect and a removed id. It also writes `products.sqlite.gz` and a `latest.json` in the bucket's layout, for trying the real download path against a local bucket.

## Commands

| What | Command |
|---|---|
| Lint, typecheck | `npm run lint`, `npm run typecheck` |
| Unit and golden-file tests | `npm test` |
| Sync against the local Postgres | `npm run test:local` |
| Browser smoke test (local stack running) | `npm run test:e2e` (needs `npx playwright install chromium` once) |
| Production build | `npm run build` |

## Layout

- `src/domain/`: pure TypeScript. Normalisation, portion maths, display rounding, grams per unit, day totals, UUIDv7, `local_date`, entry snapshots, miss payload. Golden-file runners load `packages/contracts/`.
- `src/data/`: product file checks, product search and barcode lookup, the local log schema, the log store with its outbox, the sync loop.
- `src/worker/`, `src/lib/`: the database worker, its client, app services and hooks.
- `src/screens/`, `src/ui/`: the screens and shared pieces of the B Night look (the canvas is the visual authority).

## Vercel (not done yet)

Static files only, all data stays in Supabase Frankfurt. When real logging is approved:

- Project root `apps/web`, build `npm run build`, output `dist`.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the hosted project. Do not set `VITE_PRODUCTS_SOURCE`.
- Routing is by hash (`#/today`), so no rewrites are needed. No COOP/COEP headers are needed either (`opfs-sahpool` does not use SharedArrayBuffer).
- On the hosted project first: sign-up off with the Email provider on, the Magic Link template must contain `{{ .Token }}` (the app asks for the code), the product file uploaded to the bucket, and #57 deployed so misses are accepted.

## Rules that apply here

- Missing means `null`, shown as `?` with a count, never `0` (accuracy rule 2).
- Every product shows its source and verified flag (rule 4).
- Goal maths and limits live in `src/domain/goals.ts` (decision 38) and are checked by the golden files. Onboarding and the editing screens write `goals` rows through `src/domain/goalForm.ts`; a change takes effect from today, so past days keep their target.
