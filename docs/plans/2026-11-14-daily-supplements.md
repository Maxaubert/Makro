# Daily supplements: spec and plan (2026-11-14)

Issue #52. Max, 2026-11-14: build it now, on the web first (Nima had proposed "later"; Max decided). iOS follows the same contract.

## What the user gets

- **Add food** has an **Add every day** switch. On, the button reads **Add to daily supplements**, and the food goes to a new diary section, **Daily supplements**, which repeats it every day.
- **Diary and Today** show the section with the label "Added every day". Each row has a small "daily" tag. It counts in the day's totals like any other food.
- **Tapping a supplement row** opens the edit sheet:
  - change the amount (from today on);
  - **Skip today** removes only today's entry;
  - **Stop adding daily** (trash icon, far left) ends the repeat from today; earlier days stay;
  - Cancel or Done.
- Any food can be a supplement: products and custom foods. Most have about 0 kcal and unknown micronutrients. Unknown stays unknown, never 0 (accuracy rule 2).

## Answers to the open questions in #52

1. **When are entries made?** When the app is first opened (or comes back to the front) on a day, for **today only**. Days the app was never opened get no entry. No back-filling, so the log never claims something nobody confirmed.
2. **Changing the amount** applies from today on: the plan changes, and today's entry changes with it. Earlier days keep their own entry and snapshot (accuracy rule 3).
3. **Unknown nutrition** stays unknown. The snapshot is taken from the food when the day's entry is made, like every log entry.
4. **Scope:** MVP, web first (Max).

## Data (contract change, `packages/contracts/log-schema.md`)

- New synced table **`daily_supplements`**:
  - `id` (UUIDv7) and `user_id`;
  - `product_id` or `custom_food_id` (exactly one), `quantity`, `unit`, `sort`;
  - `start_date` and `stopped_on` (local dates, `stopped_on` null while active);
  - the usual sync fields (`created_at`, `updated_at`, `deleted_at`, `server_seq`).
  - It has RLS for the owner only, no anon access and no DELETE grant, the same as the 7 synced tables.
- `log_entries` gets `meal = 'supplements'` and a nullable `daily_supplement_id`.
- **Natural key:** (`user_id`, `daily_supplement_id`, `local_date`). When two devices both make today's entry, the existing natural-key rule tombstones the loser, so a day never gets two.
- **Skip today** is a tombstone on today's entry. The day job checks the local store, tombstones included, before making an entry, so a skipped day is never filled in again.
- `sync_push` and `sync_pull` learn the new table. The protocol version goes up by one.

## Plan

1. **Contract:** update `log-schema.md`, and add golden file `guidance/daily_supplements.json` with the cases (which plans make an entry on which day; skip; stop; amount change; never back-fill).
2. **Backend:** migration (table, RLS, `meal` check, natural key, sync functions), pgTAP tests first (two users, no anon, natural key collision, a tombstone that stays), `plan(n)` updated.
3. **Web domain:** `supplements.ts`, a pure "entries due today" function checked by the golden file. Tests first.
4. **Web data:** LogStore and outbox for the new table. The day job runs at start and on visibility change.
5. **Web UI:** the Add food switch, the Diary and Today section, the edit sheet. Mobile and desktop follow the canvas: the desktop boards D3 and D4 exist, and the mobile screens are added to the B Night canvas first (CLAUDE.md: no screen in code without a design).
6. **E2E:** Playwright against the local stack: add a supplement, it appears today, the clock moves a day and it appears again, skip today, stop, amount change, two devices make one entry.
7. **Docs:** a decision in `DECISIONS.md`, TEST-MAP rows, and a note to Nima that iOS must follow.

One PR per step group: contract plus backend, then web.

## Risks

- **Time zones:** "today" is the device's local date (`local_date` and `tz`, as for every log entry).
- **A device that is offline for days** makes only today's entry when it comes back. That is by design (answer 1).
- **The protocol bump:** an old client is refused by the server until it updates. The web app updates itself on reload.
