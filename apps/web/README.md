# Makro web

Browser client for logging food (#46). Plan: `docs/plans/2026-10-25-sync-and-web.md`, part B.

Stack: Vite, React 18, TypeScript, Tailwind 4, `@supabase/supabase-js`, Vitest, Playwright, `vite-plugin-pwa` (installable, offline) and `@sqlite.org/sqlite-wasm` (SQLite with FTS5 in the browser, the same engine as the phone; wired in B3).

## Commands

Run from `apps/web`:

| What | Command |
|---|---|
| Install | `npm install` |
| Dev server (http://localhost:5174) | `npm run dev` |
| Lint, typecheck | `npm run lint`, `npm run typecheck` |
| Unit and golden-file tests | `npm test` |
| Browser smoke test | `npm run test:e2e` (needs `npx playwright install chromium` once) |
| Production build | `npm run build` |

## Layout

- `src/domain/`: pure TypeScript, no UI. Search normalisation, portion maths, display rounding, grams per unit, day totals, UUIDv7, `local_date` and `tz`. Each `*.test.ts` loads its golden file from `packages/contracts/` and asserts every case.
- `src/index.css`: the B Night tokens as CSS variables, exposed to Tailwind. The canvas is the visual authority (see the root `CLAUDE.md`).

## Rules that apply here

- Missing means `null`, never `0` (accuracy rule 2). Totals carry `covered` and `count`.
- The web app does not redo goal maths (Swift only). Portion and display numbers must pass the shared golden files (decision 34).
