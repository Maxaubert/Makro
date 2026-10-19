# Working in this repo

Rules for anyone writing code here, people and coding agents alike. `CLAUDE.md` covers the roadmap and design workflow; this file covers how to build. Where they overlap, the decisions in `DECISIONS.md` win.

## Repo map

| Path | What | Owner | Runs on |
|---|---|---|---|
| `apps/ios/` | SwiftUI iPhone app (created in slice 1, #21) | Nima | Mac only (Xcode) |
| `supabase/` | Backend: migrations, Edge Functions, pgTAP tests | Max | Mac, Windows, Linux (Docker needed) |
| `packages/contracts/` | Shared contracts and golden files (#32, #40) | both | anywhere |
| `eval/` | Voice test set and scoring (#35) | Max | anywhere |
| `docs/` | Spec (`MVP.md`) and other docs | both | |

The product database is built in a separate repo, `loftspace/nutrition-data` (#31). Its files are never committed here.

## Accuracy rules (never break these)

From `docs/MVP.md` and decision 6. Every PR must keep them true.

1. Nutrition numbers come only from the product database or from deterministic code. AI never produces a number: it may only pick a product id from candidates that code found, plus a quantity, and code validates both.
2. Missing means unknown, never zero. Nutrients are optional values (`Double?` in Swift, `NULL` in SQL); never default them to `0`. Totals carry how many items they cover.
3. Every log entry stores a snapshot of its nutrition values when it is saved, so later database updates never change history.
4. Every product shows its source and whether it is verified.
5. Logging never blocks: a missing product becomes a custom food immediately, and the miss is recorded anonymously.

Goal and nutrition maths live in Swift only. Do not reimplement them in SQL, Python or an Edge Function.

## Tests

- Write the failing test first, see it fail, then write the code (decision 15). If test-first does not fit (a UI spike), say why in the PR.
- Anything with maths must match the shared golden files in `packages/contracts/`.
- `TEST-MAP.md` lists every suite and where it runs. Extend an existing suite before starting a new one, and add a row when you do.

## Commands

| What | Command | Where |
|---|---|---|
| Start a local database with all migrations | `npx supabase@2.121.0 db start` | Docker |
| Database tests (RLS, access) | `npx supabase@2.121.0 test db` | Docker |
| Edge Function tests | `deno test supabase/functions/` | anywhere |
| iOS build and tests | added in slice 1 (#21) | Mac only |

Do not run Mac-only commands (Xcode, `xcodebuild`, simulators) on Windows or Linux.

## Tech choices (settled, see `DECISIONS.md`)

- iOS: SwiftUI, GRDB for both databases (`products.sqlite` read-only, `log.sqlite` read-write). Not SwiftData, Core Data or TCA.
- Backend: Supabase in Frankfurt. Not CloudKit (App Store rule 5.1.3(ii): no health data in iCloud).
- No third-party analytics or crash SDKs in the MVP.
- Adding a new dependency (Swift package, npm or Deno module) needs a line in the PR saying why.

## Supabase

- Pushing to `master` deploys migrations. Work through pull requests.
- Create a migration with `supabase migration new <name>`. Never edit a migration that has been merged; add a new one.
- Every new table has row-level security on and no grants unless a migration says so.
- Keep `verify_jwt` on for every function. Only `submit-miss` turns it off, on purpose.
- When you add pgTAP assertions, update the `plan(n)` count.

## Pull requests

- One issue per PR. Write "Part of #N" for slice issues: a slice is done only after the TestFlight check and demo note, so it is closed by hand, not by the merge.
- Fill in the PR template (definition of done and accuracy rules).
- Never commit secrets, `.env` files, `Secrets.xcconfig` or database files.
- Changing a decision means a new entry in `DECISIONS.md` that supersedes the old one.

## Team conventions (#41, decision 33)

- **Pull requests only.** Nothing is pushed straight to `master` (it deploys Supabase). Squash merge, and the branch is deleted on merge.
- **Owners and review** (`.github/CODEOWNERS`): `apps/ios/` Nima; `supabase/` and `eval/` Max; `packages/contracts/` and `packages/design/` both. An owner merges a PR in their own area once CI is green; the other reviews when asked. Contract and design-token changes need both to approve. For agent-written PRs, the owner reads the diff and the list of tests before merging.
- **AI attribution** (`Co-Authored-By`, "Generated with" lines, session links) is each author's choice. Not required, not forbidden.
