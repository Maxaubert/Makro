# Sync (#34)

How the phone app and the web app keep each user's data in Supabase. The row shapes are `packages/contracts/log-schema.md` v1 (#50); this file covers the protocol behind them. The schema and the rules live in `supabase/migrations/20261025000000_sync.sql`, and `supabase/tests/database/sync.test.sql` checks every rule below.

## Tables

`log_entries`, `custom_foods`, `saved_meals`, `saved_meal_items`, `favourites`, `goals`, `weight_entries`. Each has the sync fields:

| Column | Set by | Notes |
|---|---|---|
| `id` | the client, once | UUIDv7, lowercase. A `CHECK` rejects any other version. |
| `created_at` | the client | Kept from the first write; later writes cannot change it. |
| `updated_at` | the client, on every change | Stored as `least(client value, now())`, truncated to milliseconds. |
| `deleted_at` | the client | A tombstone. Rows are never removed. |
| `user_id` | the server | `auth.uid()`. Anything a client sends is ignored. |
| `server_seq` | the server | Per-user write counter. Anything a client sends is ignored. |

Nutrients are `double precision` and nullable: NULL means unknown, never 0. `log_entries` has eight stored generated totals (`kcal_total = kcal * grams / 100` and the same for each nutrient). They are not rounded, they are NULL when the per-100 value is NULL, and no client can write them. A pgTAP test runs the cases in `packages/contracts/nutrition/portion.json` against them.

Row-level security is on for every table, with `user_id = auth.uid()` for select, insert and update. Signed-in users get `select, insert, update` and no `delete`; `anon` gets nothing.

## The rules (a trigger on every table)

1. **Server fields.** `user_id` becomes the caller and `server_seq` comes from the counter. On an update, `id`, `user_id` and `created_at` keep their stored values.
2. **Clock clamp.** `updated_at = date_trunc('milliseconds', least(client value, now()))`. A phone with its clock in the future cannot win every conflict, and every client compares at the same precision.
3. **Last-write-wins.** An update whose clamped `updated_at` is not later than the stored one is skipped. On a tie the stored copy wins.
4. **Tombstones.** Deleting is an update that sets `deleted_at`, so rule 3 applies: a tombstone wins only when it is newer, and an edit after a tombstone revives the row only when it is newer and clears `deleted_at`. Tombstones are kept forever in the MVP. Account deletion (slice 10) hard-deletes all of a user's rows, tombstones included (`on delete cascade` from `auth.users`).
5. **Cursor.** `server_seq` comes from the user's row in `sync_counters`, taken `FOR UPDATE` until the transaction commits. Writes for one user are serialised and become visible in `server_seq` order, so "everything after N" never skips a row. Clients cannot read or write `sync_counters`.

The trigger also runs on direct table writes, so the rules hold even if a client bypasses the RPCs. Clients should still use only the two RPCs.

## RPCs

Both run as the signed-in user (`security invoker`), so row-level security applies. Call them through PostgREST: `supabase.rpc('sync_push', { protocol, changes })`.

### `sync_push(protocol int, changes jsonb) returns jsonb`

```json
{ "log_entries": [ { "id": "0192...", "created_at": "...", "updated_at": "2026-10-20T08:15:30.123Z", "deleted_at": null, ... } ],
  "custom_foods": [ ... ] }
```

- `changes` maps a table name to an array of **full rows** (every column of the contract, nulls included). On an update, a key that is left out keeps its stored value, but send full rows anyway.
- Timestamps are ISO 8601 text in UTC with milliseconds and `Z`. Flags may be JSON booleans or 0/1.
- At most 1000 rows per push. An unknown table name or a malformed `changes` raises `22023` and nothing is applied.
- The whole push is one transaction. Tables are applied in a fixed order (`custom_foods`, `saved_meals`, `saved_meal_items`, `log_entries`, `favourites`, `goals`, `weight_entries`); within a table, in array order.

Returns `{"protocol": 1, "results": [ ... ]}` with one result per row, in the order applied:

| `status` | Meaning | What the client does |
|---|---|---|
| `applied` | Stored. `server_seq` is its new cursor position. `tombstoned: true` means it lost a natural-key collision and was stored as deleted. | Drop it from the outbox |
| `stale` | The server already has a copy at least as new (this includes a retry of a row already applied). The server copy was kept. | Drop it from the outbox; the next pull brings the server copy |
| `rejected` | The row breaks a rule (`reason` says which): not a UUIDv7, missing `updated_at`, a failed `CHECK` or `NOT NULL`, or an id that belongs to another user. | Drop it and surface the reason; retrying will not help |

**Idempotent by id.** Retrying a push after a dropped connection is safe: rows that landed come back `stale`, the rest are applied. No row is ever duplicated.

**Natural-key collisions.** At most one live row per key, enforced by partial unique indexes:

| Table | Key |
|---|---|
| `favourites` | `product_id`, or `custom_food_id` |
| `goals` | `effective_from` |
| `weight_entries` | `source` + `external_id` (only when `external_id` is set) |

When a pushed live row meets another live row with the same key, the later `updated_at` stays live and the other is tombstoned in the same transaction (its `deleted_at` and `updated_at` become the winner's `updated_at`). On a tie the stored row stays live. A push never fails on these indexes.

### `sync_pull(protocol int, since bigint, max int) returns jsonb`

Returns the caller's rows with `server_seq > since`, across all tables, ordered by `server_seq`:

```json
{ "rows": [ { "table": "log_entries", "row": { "id": "...", "server_seq": 42, ... } } ],
  "cursor": 42,
  "more": false }
```

- `since` is 0 for a first pull, then the `cursor` of the previous page. `max` is at least 1 and is capped at 1000.
- Each row appears once, at its latest version. Rows include tombstones, `server_seq` and the generated totals, never `user_id`.
- `more: true` means call again with the new `cursor`. When no rows are returned, `cursor` equals `since`.
- Apply one page and its cursor in one local transaction. A child can arrive before its parent (there are no foreign keys on reference columns).
- When applying a pulled row, the server copy wins and its `server_seq` is stored. The only exception: the row has a change waiting in the local outbox and the local `updated_at` is later than the pulled one (on a tie the server copy wins). Do not compare against the local `updated_at` of a row with nothing to push: the server stores `least(client updated_at, now())`, so after a push from a fast clock the local value is later than the server's, and later edits from another device would be skipped for good once the cursor moves past them.

## Protocol version

`protocol` is the **sync protocol** version, separate from the phone's `pragma user_version` and from the product file's `schema_version`. The server accepts 1 to 1 today (`private.sync_check_protocol`). A protocol below the minimum raises `22023` with "sync protocol N is not supported: this server accepts 1 to 1. Update the app."; one above the maximum raises `22023` too. Raise the maximum when the protocol changes and the minimum when old clients must stop.

## Sign-in

Email one-time code (decision 34). Sign-up is off in `supabase/config.toml` (`[auth] enable_signup = false`; `[auth.email] enable_signup` must stay `true`, because in the CLI it switches the whole email provider, one-time codes included) and must also be turned off on the hosted project before day one (Authentication, "Allow new users to sign up" off, Email provider on); Max invites Nima from the dashboard. Locally, create test users with the admin API or SQL, not by signing up.

## When #34 is done

Decision 34 changed the done condition: #34 is done when the web client (#46) syncs and the two-user pgTAP tests pass.
