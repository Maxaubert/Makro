# Log, goals and weight schema (v1)

Status: **v1 proposed by Max after Nima's review of the v0 draft** (#40, #50). The phone's `log.sqlite` (GRDB) and the server tables (Postgres, #34) have this same shape, so neither side migrates later (decision 22). Nothing here is decided until you both approve it.

Conventions: `?` after a type means nullable. Nutrient columns are always nullable and **NULL means unknown, never 0** (accuracy rule 2). Nutrient values are per 100 `per_100_unit` (`g` or `ml`) unless a column says otherwise.

## Types and encodings

One encoding per kind of value, so a row means the same thing on the phone, on the server and on the wire.

| Kind | SQLite (`log.sqlite`) | Postgres | Rule |
|---|---|---|---|
| id | `text` | `uuid` | UUIDv7, lowercase, 36 characters with hyphens. The phone generates it (Postgres 17 has no `uuidv7()`). |
| timestamp | `text` | `timestamptz` | ISO 8601 in UTC with milliseconds and a `Z`, for example `2026-10-20T08:15:30.123Z`. The sync payload uses the same text. |
| date | `text` | `date` | `YYYY-MM-DD`. |
| real number | `real` | `double precision` | An 8-byte double on both sides. Never `float4` or Postgres `real`: otherwise the server holds a less precise copy and the tie rule would overwrite the phone's value with it. |
| flag | `integer` (0 or 1) | `boolean` | |
| text | `text` | `text` | No length limit on `product_id` (see below). |

Where the tables below say `real`, they mean the double in the row above.

## Sync fields on every synced table

| Column | Type | Set by | Meaning |
|---|---|---|---|
| `id` | id | the phone, once, at creation | Time-ordered. |
| `created_at` | timestamp | the phone | |
| `updated_at` | timestamp | the phone, on every change | Last-write-wins uses this. The server stores `least(client updated_at, now())`, so a phone with a clock set in the future cannot win every conflict. |
| `deleted_at` | timestamp? | the phone | Soft delete (tombstone). A client never removes a row. |
| `user_id` | uuid | **server only** | `default auth.uid()`. Not on the phone. Every table has an RLS policy `user_id = auth.uid()`. |
| `server_seq` | bigint | **server only** | Increases on every write. One counter per user across all tables, so the phone keeps a single cursor. |

**What `server_seq` guarantees:** a pull "everything after the last `server_seq` I saw" misses no change, whatever the phone clocks say. It does not make conflicts right. Last-write-wins is per row, and clock skew can still flip a conflict between two phones editing the same row at nearly the same time. At 12 users that is accepted.

**Conflict rule:** the row with the later `updated_at` wins. On a tie the server's copy wins. A deletion is an update that sets `deleted_at`, so the later `updated_at` still wins. An edit after a delete on another phone brings the row back only if its `updated_at` is later and it clears `deleted_at`.

**Server fields are never accepted from the client.** A push carrying `user_id` or `server_seq` has those fields ignored (and the sync function sets them). Clients get no `DELETE` grant on any table.

**Tombstone retention:** keep them forever in the MVP. **Account deletion** hard-deletes everything of that user, tombstones included.

**No enforced foreign keys on synced reference columns** (`custom_food_id`, `saved_meal_id` and so on, on both sides). A pull page can deliver a child before its parent. The phone applies one pull page and its new cursor in a single transaction, so it never shows a half-applied state.

## `log_entries`

One thing eaten. Carries its own nutrition snapshot (accuracy rule 3), so history never changes when the product database updates, and the server can sum a day without the catalogue.

| Column | Type | Meaning |
|---|---|---|
| `eaten_at` | timestamp | The instant it was eaten |
| `tz` | text | IANA zone the phone was in, for example `Europe/Oslo` |
| `local_date` | date | The day it counts toward, **fixed when saved** from the phone's local time. Never recomputed, so travel and daylight saving cannot move an entry between days. Day totals group by this. |
| `meal` | text | `breakfast`, `lunch`, `dinner`, `snack` (four fixed). Checked in Swift and by a Postgres `CHECK`, not by a SQLite `CHECK`. |
| `quantity` | real | The amount as the user entered it |
| `unit` | text | `g`, `ml`, `piece`, `serving`, `portion` (decision 42) |
| `grams` | real | The resolved weight, not null. For `ml`, 1 ml = 1 g and the UI shows it as approximate. For `piece` and `serving`, `quantity * serving_g`. For `portion`, `quantity * 100`: not a weight, so the totals equal the printed per-portion values times the portions, and the UI never shows it as grams (decision 42). Editing the amount changes this and the totals. |
| `product_id` | text? | Id from the product database. Unbounded text, **never rewritten** when the product database redirects it; it is resolved when read (`products-db.md`, Ids). NULL for a custom food. |
| `custom_food_id` | id? | Set for a custom food, NULL otherwise. Exactly one of `product_id` and `custom_food_id` is set. |
| snapshot: `name`, `brand?`, `source`, `ean?`, `db_version?` | text | What the product was when logged. `source` is where the numbers came from (accuracy rule 4); `custom` for a custom food. |
| snapshot: `verified?` | flag | Copied from the product's `verified` column (`products-db.md`). NULL for rows logged before the column existed and for custom foods. |
| snapshot: `per_100_unit` | text | `g` or `ml`: the values below are per 100 g or ml. `portion` (decision 42): they are per one portion as printed, for a food sold with no weight. |
| snapshot: `kcal?`, `protein_g?`, `fat_g?`, `sat_fat_g?`, `carbs_g?`, `sugars_g?`, `fibre_g?`, `salt_g?` | real | Per 100 `per_100_unit` at the time |
| totals: `kcal_total?`, `protein_g_total?`, `fat_g_total?`, `sat_fat_g_total?`, `carbs_g_total?`, `sugars_g_total?`, `fibre_g_total?`, `salt_g_total?` | real | **Generated columns on both sides**, all 8 nutrients: `kcal_total = kcal * grams / 100`, and the same for each nutrient. Stored, never written by the app, **not rounded**. NULL when the per-100 value is NULL, because SQL arithmetic on NULL is NULL. They cannot drift from `grams` after an edit. Rounding happens only for display. |

**Maths and decision 31.** The generated formula is the same unrounded multiplication as `nutrition/portion.json`. To keep one oracle, the Swift package test and a pgTAP test (once #34 lands) both run `portion.json` against it. This narrows decision 31's "the server does not redo maths" to "the server only adds up stored per-entry totals, and the stored totals are generated by this one formula". Nima, please confirm that wording when you approve.

A day's total carries how many entries it covers and how many had an unknown value, so "unknown" never silently becomes 0 (`nutrition/totals.json`).

## `custom_foods`

`name`, `brand?`, `ean?`, `serving_g?`, `per_100_unit` (`g` or `ml`), and the same eight per-100 nutrient columns as the snapshot (all nullable). Created by the user. A miss is also posted to `submit-miss` (#13) with the same eight `_g`-style keys (see Miss payload).

## `saved_meals` and `saved_meal_items`

`saved_meals`: `name`. `saved_meal_items`: `saved_meal_id`, `sort_order`, `product_id?` or `custom_food_id?`, `quantity`, `unit` (as in `log_entries`), `grams`, `name` (snapshot, for display only). Items keep quantity and unit as well as grams, so logging a meal restores "2 pieces", not just a weight. Nutrition is **not** stored on a saved meal: logging it creates normal `log_entries` with fresh snapshots.

Deleting a meal also deletes its items: the phone sets `deleted_at` on the meal and on every item in one transaction. Without foreign keys the server does not cascade.

## `favourites`

`product_id?` or `custom_food_id?`. Recents are computed from `log_entries` on the phone and are not synced.

## `goals`

History, not a single row: a new row each time the target changes, so past days keep the target they were measured against.

| Column | Type | Meaning |
|---|---|---|
| `effective_from` | date | First day this applies |
| `goal_type` | text | `lose`, `maintain`, `gain` |
| `kcal_target`, `protein_g_target`, `carbs_g_target`, `fat_g_target`, `fibre_g_target` | real | Daily targets (output of the Swift goal maths). The `_target` suffix keeps them apart from `protein_g`, which means "per 100 g" everywhere else. |
| `target_weight_kg?`, `pace_kg_per_week?` | real | |
| inputs: `sex?`, `birth_year?`, `height_cm?`, `activity_level?`, `weight_kg?` | | What the maths used. Synced as optional columns on the goal row, under the same RLS and account deletion, so a new phone can recalculate without asking again. Weight is already synced. |

## `weight_entries`

`measured_at` (timestamp), `tz`, `local_date`, `weight_kg`, `source` (`manual`, `apple_health`), `external_id?` (the HealthKit sample id). Same rule as entries: `local_date` is fixed when saved, taken from the sample's own zone for HealthKit.

## Duplicates

Retries and re-imports must not create two live rows. The natural key decides:

| Table | Natural key |
|---|---|
| `weight_entries` | `source` + `external_id` (when `external_id` is set) |
| `favourites` | `product_id`, or `custom_food_id` |
| `goals` | `effective_from` |

When two live rows share a key, the latest `updated_at` wins and the other is treated as deleted. The phone pulls before it imports HealthKit, so a second phone does not re-create samples the first already sent. #34 enforces the keys with partial unique indexes on live rows.

## Field vocabulary

One set of names in Swift, SQL, the product database and the miss payload: the **`_g` suffix style of the product database** (`protein_g`, `fat_g`, `carbs_g`, `fibre_g`, `kcal`), plus `per_100_unit`. Goal targets add `_target`.

## Miss payload

`submit-miss` takes `custom_food.per100` with `protein`, `carbs`, `fat`, `fibre` today. It moves to the same eight keys as `custom_foods` (`kcal`, `protein_g`, `fat_g`, `sat_fat_g`, `carbs_g`, `sugars_g`, `fibre_g`, `salt_g`) plus `per_100_unit`. `validate.ts` drops unknown keys silently, so a half-done change would lose data without an error. Therefore `submit-miss`, its tests and the app change together, before any build sends misses. The 40-character limit on `product_id` in `validate.ts` and `misses.product_id` goes: 15,083 ids in the current release are longer. That is code, so it is a PR of its own (with #34 or before it).

## Versions

- `log.sqlite`: the schema version is an integer in `pragma user_version`, starting at 1 and raised by every GRDB migration. Server tables mirror the same version, and the sync call sends the phone's number so the server can refuse a client that is too old (#34).
- `db_version` (snapshot and misses) is the product database's, in the format `YYYY.MM.DD`, with `-2`, `-3` for a second build the same day (`products-db.md`).

## Not in this contract

The outbox (the phone's list of changes still to send) and the sync functions themselves: those are #34 and live behind this shape. Recents, search history and anything computed on the phone.

## Decided in review (Nima, #50)

1. **Drinks:** `per_100_unit`, `g` or `ml`; 1 ml = 1 g, shown as approximate.
2. **`verified`:** stored in the snapshot now.
3. **Goal inputs:** synced, as optional columns on the goal row.
4. **Meals:** four fixed, checked in Swift and Postgres.
5. **Rounding:** stored totals are not rounded (generated columns); round for display only.
6. **Weight time zones:** `measured_at` + `tz` + a fixed `local_date`.
