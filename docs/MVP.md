# Makro MVP

Status: **proposal, waiting for Max's review** (2026-10-17). Every decision behind this document is logged in [`DECISIONS.md`](../DECISIONS.md).

## Goal

> Log what you eat in seconds, with numbers you can trust, and get daily personal guidance toward your calorie and macro targets.

Two things make Makro different from existing trackers: Norwegian product data that is actually right, and guidance that adapts to you. Everything in the MVP serves fast logging, accurate numbers, or the daily guidance loop.

## Users

1. **Max and Nima** (both on Apple Intelligence iPhones) while we build it.
2. **Finish line:** a closed TestFlight beta of about 10 friends.
3. A public release is out of scope for the MVP.

## Scope

### In

- **Food logging:** search (Norwegian words and typos), barcode scan, recents and favourites, custom foods, saved meals, "repeat yesterday", portions in grams, pieces or servings.
- **Voice and typed logging** ("to egg og 200 g kjøttdeig"), after the core loop works, behind a beta toggle until it passes the accuracy gate.
- **Goals:** calories, protein, carbs, fat and fibre, calculated from profile and goal, always editable.
- **Guidance:** rule-based daily and weekly feedback (see below).
- **Body weight:** manual entry plus reading from Apple Health, shown as a 7-day trend.
- **Apple integrations:**
  - barcode scanning with the system scanner;
  - widgets showing what's left, with a quick-log button;
  - App Shortcuts ("log my usual breakfast", "what's left today");
  - a Control Center control and Action button;
  - writing nutrition to Apple Health;
  - on-device AI for voice parsing.
- **Optional sign-in** with backup and sync, before the friend beta.

### Out (backlog for later milestones)

- Training tracking: lifts (#3), cardio (#4), timers (#5).
- The training agent and an AI chat coach (#9).
- Food photos and label OCR (#12, camera parts).
- The public API and MCP server (#1).
- Recipes with cooked-weight maths.
- Separate training-day targets.
- Live Activities, a Watch app, Core ML experiments (these go in a time-boxed `lab` track).
- Android.

## Accuracy rules (acceptance criteria for every slice)

1. Nutrition numbers come only from the database or from deterministic code. The AI never produces a number: it may only pick a product id from candidates that code found, plus a quantity, and code validates both.
2. Missing means unknown, never zero. Totals show their coverage ("protein based on 9 of 10 items").
3. Every log entry stores a snapshot of its nutrition values, so a later database rebuild never changes history.
4. Every product shows its source and whether it is verified.
5. Logging never blocks: if a product is missing, the user gets a working custom food immediately, and the miss is recorded anonymously for the resolver.

## Guidance

- **Targets:**
  - energy needs from Mifflin-St Jeor times activity level, adjusted by a chosen rate in kg per week (cut, maintain or bulk);
  - protein first, at 1.6 to 2.2 g per kg of body weight;
  - a fat minimum, with carbs filling the rest;
  - fibre from the Nordic Nutrition Recommendations.
- **Safety:** a calorie floor and a maximum weight-loss rate, taken from Nordic guidance. The exact values get looked up and cited, not written from memory (see #15).
- **During the day:** one card with what's left, plus 3 suggestions that fit the gap. Suggestions come from the user's own history first, then from verified products.
- **End of day:** on target, over or under. A warning if something was likely not logged.
- **Weekly:** average intake against target, and the weight-trend direction.
- **Adaptive targets:** comparing intake with the weight trend comes right after the MVP. Weight is logged from day one so the data exists.
- **Notifications:** only an optional evening "did you log dinner?" reminder.

## Voice logging

1. The user speaks or types a line. Speech uses Apple's on-device `DictationTranscriber`, with a NO/EN toggle that remembers the last choice (no auto-detect).
2. The on-device Foundation Models model splits the line into items and quantities (guided generation).
3. Code searches the product database and ranks the top 5 candidates for each item.
4. The model may only pick one of those candidates, and code checks that it did.
5. The user sees the result and confirms or edits before anything is saved.

**Gate:** voice ships (beta toggle off) only when it gets both product and quantity right for at least 90% of a test set of 100 to 200 real lines from both of us (Norwegian, English, brand names). The same set serves the eval need in #14 and #17.

**Fallback:** if Apple's Norwegian speech is not good enough, use a cloud speech-to-text service in the EU behind a server function, with user consent. Candidates are Berget-hosted NB-Whisper and OpenAI's EU endpoint, chosen with the test set.

## Success test

The MVP works when:

- both of us log every day for 14 days in a row without falling back to another app;
- a typical meal takes under 20 seconds to log;
- at least 90% of scanned barcodes are found;
- neither of us catches a number we believe is wrong without seeing a warning first.

## Tech stack

Each pick is scored against our requirements:

- offline-first;
- accurate numbers;
- EU health data under GDPR;
- the bundled product database;
- hobby cost;
- Max working from Windows;
- AI-agent productivity;
- staying portable for the later API.

| Part | Pick | Why | Runner-up, and why not |
|---|---|---|---|
| App | **SwiftUI, iOS 27 minimum** (iOS 26 if the spike shows we need it) | We want deep Apple integrations. Every new API is available with no fallback code. | Expo: the widget quick-log, App Intents and the AI parser would still be Swift, plus a second runtime and duplicated logic |
| Storage on the phone | **GRDB**, two files: `products.sqlite` (read-only, FTS5) and `log.sqlite` | Full-text search works offline (measured about 1 ms on our data). Plain SQL gives exact control over null versus 0. | SwiftData has no full-text search; SQLiteData is newer and its iCloud sync is unusable for us (see below) |
| Code structure | `@Observable` view models over a pure Swift package (Domain, Persistence, Search, Voice) | Logic tests run with `swift test`, no simulator: the fastest loop for AI agents | TCA: a major version change is coming, and it adds weight |
| Tests | Swift Testing, plus shared golden files for nutrition maths and Norwegian search that both Max's Python and the Swift code must pass | Guards accuracy where the two codebases meet | None |
| Widgets and intents | The widget appends quick-logs to a small queue file in the App Group, and the app ingests them. On iOS 27 this may be unnecessary if intents run in the app process (spike). | Avoids crashes from extensions writing a shared SQLite file | A shared writable database: those crashes only show up in production |
| Backend, sync, sign-in | **Supabase, free plan, Frankfurt** (Edge Functions can be pinned to Frankfurt but not to Stockholm). Hand-written outbox sync (UUIDv7 ids, last-write-wins, tombstones) through Postgres functions running as the signed-in user. Optional Sign in with Apple. | Row-level security denies by default, protecting health data from mistakes in AI-written code. Auth and account deletion are managed. Postgres gives Dashboard-react a read path later. $0 at 2 and at 12 users. | Cloudflare Workers + D1 (EU): also free and native on Windows, but agents would write and test auth and per-user access on health data themselves. Neon: comparable, but no Swift SDK and Apple sign-in is unproven there. |
| Rejected: iCloud / CloudKit | Not used | App Store guideline 5.1.3(ii): apps "may not store personal health information in iCloud". EU residency can't be confirmed, and Dashboard-react couldn't read the data server-side. | None |
| CI and TestFlight | **Xcode Cloud** for the app (25 compute hours a month are included with the developer program). GitHub Actions on Linux for the database pipeline, golden-file tests and Supabase migrations. | Free, signing is managed, and Max can trigger builds from Windows | GitHub macOS runners: roughly $17 to 30 a month, and we would own signing |
| Crash reports | Xcode Organizer, TestFlight feedback, MetricKit | No extra data processor for 12 friends | Sentry (EU region), if a crash can't be explained |
| Product database delivery | Max's pipeline builds the slim database in GitHub Actions and publishes it as a private GitHub Release. The app pins it by checksum and bundles it (about 7 MB download, about 18 MB installed). | Works offline, and app and database versions always match | Over-the-air downloads, once the resolver needs faster updates than app releases |
| Repo layout | This repo becomes the monorepo: `apps/ios`, `supabase/` (migrations, functions, RLS tests), `packages/contracts` (golden files), `eval/`, `docs/`. nutrition-data stays a separate private repo. | One context for coding agents. Keeps the unsettled data licences and the 54 MB of data shards out. | One repo for everything |

**Running cost:** $0 a month at 2 and at 12 users, plus the Apple Developer Program at $99 a year. The optional upgrades are:

| Upgrade | Cost | When |
|---|---|---|
| Supabase Pro | $25 a month | When losing a friend's data would matter, or after the first pause |
| Cloud speech | about €25 a month for Berget | Only if needed |
| Sentry | about $26 a month | If crashes can't be explained |

### Where data lives

| Data | Where | Notes |
|---|---|---|
| Product catalogue (126k products) | Master in `loftspace/nutrition-data`; a full copy bundled on every phone | The server does not hold the catalogue in the MVP. When the public API comes, the slim catalogue (roughly 30 to 80 MB) goes into the same Postgres. |
| Logs, goals, weight | The phone is the source of truth; Supabase holds a synced backup | Each log entry carries its own nutrition snapshot, so the server and Dashboard-react can sum calories without the catalogue |
| Product misses | An anonymous, insert-only Supabase function with no user id | Feeds the resolver (nutrition-data #3) |
| Goal and nutrition maths | Swift only | Synced as data, never reimplemented elsewhere |

### Required before the friend beta

- **Sign-in is optional.** Guideline 5.1.1(v) says apps without significant account-based features must work without login. Sign-in only unlocks backup and sync.
- **Account deletion** removes server rows and revokes the Apple token through Apple's REST API. Supabase does not do the revoke, so this is our own server function. The Apple key lives in a function secret.
- **Data export** as JSON from the phone.
- **Data licensing** settled: either written permission (Kassalapp, NorgesGruppen), or an open-sources-only database build enforced in CI.
- **A CI check** that fails if any table has row-level security turned off, plus two-user access tests.

## Plan

Each slice is thin and end to end, and testable on our phones.

### Nima: iPhone app

| # | Slice | Contents | Slice-specific check |
|---|---|---|---|
| 0 | Spikes, 1 to 3 days on a real iPhone | Foundation Models with Norwegian; `DictationTranscriber` with `nb-NO`; whether App Intents run in the app process on iOS 27; FTS5 through GRDB on iOS; a widget reading the bundled database | |
| 1 | Foundation | Repo layout, Xcode Cloud to TestFlight, the core package, CI tests, the agent instructions file | Max installs a build from TestFlight |
| 2 | Search and log | Norwegian search, portions, snapshot on every entry | |
| 3 | Goals and Today | Profile setup, goal calculation with safety floors, the Today screen | |
| 4 | Barcode and not found | Scanning, the "found but no nutrition" case, custom foods, the local miss queue | |
| 5 | Fast repeat | Recents, favourites, saved meals, "repeat yesterday" | |
| 6 | Weight and Apple Health | Weight logging, trend line, read weight, write nutrition | |
| 7 | Guidance | Remaining card and suggestions, end-of-day check, weekly summary, evening reminder | |
| 8 | Apple extras | Widgets, App Shortcuts, Control Center control, Action button | |
| 9 | Voice and typed logging | Behind the beta toggle until the 90% gate passes | |
| 10 | Friend-beta ready | Sign-in and sync, account deletion with Apple revoke, export, privacy text, licensing settled | |

### Max: runs in parallel, no Mac needed

- The database pipeline in GitHub Actions, including the open-sources-only variant.
- Shared golden files in `packages/contracts`.
- The Supabase project: the anonymous miss ingest in week 1, then the sync schema and functions with RLS tests.
- Collecting the voice test set from week 1, so it's ready before slice 9.
- The resolver (nutrition-data #3).
- Testing every build on his phone through TestFlight.

### Definition of done (every slice)

- Tests are written first and pass in CI. Anything with maths matches the shared golden files.
- It runs on both phones through TestFlight.
- The accuracy rules above hold.
- The other person has reviewed the pull request.
- A short demo note or screenshot is on the issue.

## Still to verify

| Item | How |
|---|---|
| Foundation Models in Norwegian | Spike 0. It reported supported on macOS 26.7.1, but iOS is not tested yet. |
| `DictationTranscriber` `nb-NO` | Spike 0. `nb_NO` is listed on macOS. Note that `SpeechTranscriber`, the newer engine, does **not** list Norwegian. |
| App Intents in the app process on iOS 27 | Spike 0. This decides whether the widget queue file is needed. |
| Calorie floor and maximum loss rate | Look up and cite the Nordic guidance before slice 3 |
| Supabase free-plan details | Edge Function region pinning on the free plan, and how the 2-project limit counts across organisations |

## After approval

1. Create an **MVP** milestone and an epic issue with the slices above as linked issues.
2. Label the existing issues `mvp` or `later`.
3. Close #14, #15, #16 and #18 by linking them to their entries in `DECISIONS.md`. Anything still open in them becomes a new focused issue, for example the lawyer questions in #15.
