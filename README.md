# Makro

An iPhone app for fast, accurate food logging with daily guidance toward calorie and macro targets, built for Norwegian products. Private repo for Max (Maxaubert) and Nima (nimkimi).

## Start here

- **Roadmap and tasks:** the MVP epic, #36. Every piece of work is an issue linked from it.
- **What we're building:** [`docs/MVP.md`](docs/MVP.md) (scope, accuracy rules, stack, plan).
- **Why it is built this way:** [`DECISIONS.md`](DECISIONS.md).
- **How to work in the repo:** [`AGENTS.md`](AGENTS.md) (rules, commands, tests) and [`CLAUDE.md`](CLAUDE.md) (roadmap and design workflow).
- **Tests:** [`TEST-MAP.md`](TEST-MAP.md).
- **Design:** the "B Night" page of the shared Claude design canvas, linked in `CLAUDE.md` and #36.

## Layout

| Path | What | Status |
|---|---|---|
| `apps/ios/` | SwiftUI iPhone app (Nima) | created in slice 1, #21 |
| `supabase/` | Backend (Max) | live: anonymous miss ingest |
| `packages/contracts/` | Shared contracts and golden files | planned, #32 and #40 |
| `eval/` | Voice test set | planned, #35 |
| `docs/` | Spec and docs | |

Product data comes from the separate private repo `loftspace/nutrition-data`.

## Slices and issues

The plan in `docs/MVP.md` numbers the iOS work as slices 0 to 10. Slice N is issue #(20 + N): slice 0 is #20, slice 10 is #30.
