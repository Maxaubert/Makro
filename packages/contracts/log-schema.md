# Log, goals and weight schema (draft v0)

Status: **draft by Max for Nima to rework** (#40, Nima leads). The phone's `log.sqlite` (GRDB) and the server tables (Postgres, #34) have this same shape, so neither side migrates later (decision 22). Nothing here is decided until you both approve it.

Conventions in this file: `?` after a type means nullable. Nutrient columns are always nullable and **NULL means unknown, never 0** (accuracy rule 2). Nutrient values are per 100 g unless a column says otherwise.

## Sync fields on every table

| Column | Type | Set by | Meaning |
|---|---|---|---|
| `id` | UUIDv7 | the phone, once, at creation | Time-ordered. Postgres 17 has no `uuidv7()`, so the client always generates it. |
| `created_at` | timestamptz | the phone | |
| `updated_at` | timestamptz | the phone, on every change | Last-write-wins uses this. UTC, millisecond precision. |
| `deleted_at` | timestamptz? | the phone | Soft delete (tombstone). A deleted row is never removed by a client. |
| `user_id` | uuid | **server only** | `default auth.uid()`; not on the phone. Every table has an RLS policy `user_id = auth.uid()`. |
| `server_seq` | bigint | **server only** | Increases on every write. The phone pulls with "everything after the last `server_seq` I saw", so clock skew between phones cannot lose a change. |

**Conflict rule:** the row with the later `updated_at` wins; on a tie the server's copy wins. A deletion is just an update that sets `deleted_at`, so the later `updated_at` still wins. An edit made after a delete on another phone brings the row back only if its `updated_at` is later and it clears `deleted_at`.

**Tombstone retention:** keep them forever in the MVP (tiny at 12 users). Revisit when it matters.

## `log_entries`

One thing eaten. Carries its own nutrition snapshot (accuracy rule 3), so history never changes when the product database updates, and the server can sum a day without the catalogue.

| Column | Type | Meaning |
|---|---|---|
| `eaten_at` | timestamptz | The instant it was eaten |
| `tz` | text | IANA zone the phone was in, for example `Europe/Oslo` |
| `local_date` | date | The day it counts toward, **fixed when saved** from the phone's local time. Never recomputed, so travel and daylight saving cannot move an entry between days. Day totals group by this. |
| `meal` | text | `breakfast`, `lunch`, `dinner`, `snack` |
| `quantity` | real | The amount as the user entered it |
| `unit` | text | `g`, `piece`, `serving` |
| `grams` | real | The resolved weight in grams (not null). Editing the amount changes this and the totals. |
| `product_id` | text? | Id from the product database. NULL for a custom food. |
| `custom_food_id` | uuid? | Set for a custom food, NULL otherwise. Exactly one of `product_id` and `custom_food_id` is set. |
| snapshot: `name`, `brand?`, `source`, `ean?`, `db_version?` | text | What the product was when logged. `source` is where the numbers came from (shown in the UI, accuracy rule 4). |
| snapshot: `kcal?`, `protein_g?`, `fat_g?`, `sat_fat_g?`, `carbs_g?`, `sugars_g?`, `fibre_g?`, `salt_g?` | real | Per 100 g at the time |
| totals: `kcal_total?`, `protein_g_total?`, `fat_g_total?`, `carbs_g_total?`, `fibre_g_total?` | real | For this entry (per-100 g value times grams, computed **by the Swift app** when saved, rounded as in the golden files). Stored so the server and the web dashboard add up days without reimplementing the maths. NULL if the nutrient is unknown. |

A day's total carries how many entries it covers and how many had an unknown value, so "unknown" never silently becomes 0.

## `custom_foods`

`name`, `brand?`, `ean?`, `serving_g?`, and the same per-100 g nutrient columns as the snapshot (all nullable). Created by the user; a miss is also posted to `submit-miss` (#13).

## `saved_meals` and `saved_meal_items`

`saved_meals`: `name`. `saved_meal_items`: `saved_meal_id`, `sort_order`, `product_id?` or `custom_food_id?`, `grams`, `name` (snapshot, for display only). Nutrition is **not** stored on a saved meal: logging it creates normal `log_entries` with fresh snapshots.

## `favourites`

`product_id?` or `custom_food_id?`. Recents are computed from `log_entries` on the phone and are not synced.

## `goals`

History, not a single row: a new row each time the target changes, so past days keep the target they were measured against.

| Column | Type | Meaning |
|---|---|---|
| `effective_from` | date | First day this applies |
| `goal_type` | text | `lose`, `maintain`, `gain` |
| `kcal_target`, `protein_g`, `carbs_g`, `fat_g`, `fibre_g` | real | Daily targets (output of the Swift goal maths) |
| `target_weight_kg?`, `pace_kg_per_week?` | real | |
| inputs: `sex?`, `birth_year?`, `height_cm?`, `activity_level?`, `weight_kg?` | | What the maths used, so it can be recalculated and checked against the golden files. Open question 3. |

## `weight_entries`

`measured_at` (timestamptz), `tz`, `local_date`, `weight_kg`, `source` (`manual`, `apple_health`), `external_id?` (the HealthKit sample id, to avoid duplicates on re-import).

## Field vocabulary (proposal for #40, item 5)

One set of names in Swift, SQL, the product database and the miss payload: the **`_g` suffix style of the product database** (`protein_g`, `fat_g`, `carbs_g`, `fibre_g`, `kcal`). `submit-miss` currently takes `custom_food.per100` with `protein`, `carbs`, `fat`, `fibre`; it would move to the same names. It is a small, backwards-compatible change if done before the app ships.

## Not in this contract

The outbox (the phone's list of changes still to send) and the sync functions themselves: those are #34 and live behind this shape. Recents, search history and anything computed on the phone.

## Open questions

1. **Per 100 g or per 100 ml for drinks** (same question as in `products-db.md`).
2. **`verified`:** the snapshot stores `source`; should it also store a `verified` flag, once the product database defines one?
3. **Goal inputs:** do we store sex, birth year, height and weight on the server at all? They are health data; the targets alone are enough to show the dashboard. Storing less is safer for #15.
4. **Meal values:** four meals, or let the user add their own?
5. **Rounding of the stored totals:** must match the golden files in #32, so decide there.
6. **Time zones on weights:** same rule as entries (fixed `local_date`), or just the date the user picked?
