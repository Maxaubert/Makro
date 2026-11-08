# Product database contract (v1, proposed)

What the app and the web app may read from the slim product database. Status: **v1 proposed by Max after Nima's review of v0** (#31, #47). Once approved, a change needs both of us and a `schema_version` bump.

The database is built by `loftspace/nutrition-data` (`tools/build_slim.py`). The app reads it read-only. v1 needs builder changes (listed at the bottom), so until they land, the released `db-2026.10.18` file is still v0. Measured on 2026-10-18 from the real data (v0 numbers, before the non-food drop):

| File | Products | Size | Gzipped |
|---|---|---|---|
| `products.sqlite` (variant `full`) | 124,175 | 48 MB | 13.6 MB |
| `products-open.sqlite` (variant `open`, open sources only) | 46,230 | 17 MB | 5.4 MB |

Both files have the same schema. Only the rows differ, and `meta.variant` says which one you have. The app bundles the uncompressed `.sqlite` read-only (about 48 MB installed for `full`, not the 18 MB in the early MVP estimate).

## Tables

### `products`
One row per visible product. A product is in the file only if it is Norway-relevant, not hidden, not merged into another product, has a name, and is not `non_food`.

| Column | Type | Null? | Meaning |
|---|---|---|---|
| `id` | text, primary key | no | Opaque, unbounded and never reused (see Ids). Today it looks like `source:url`; 15,083 ids are longer than 40 characters, so no consumer may cap its length. |
| `name` | text | no | Product name |
| `brand` | text | yes | |
| `pack_size` | text | yes | Free text, for example `450 g`. Not searchable (see Search). |
| `ean` | text | yes | The primary barcode in canonical form (see Barcodes). Look up barcodes through `product_eans`, not this column. |
| `flavour` | text | yes | |
| `category` | text | yes | One of the 21 food categories below (assigned by a model, can be wrong) |
| `serving_g` | real | yes | One serving in grams |
| `per_100_unit` | text | no | `g` or `ml`. What the per-100 values below are per. Set from the label or the pack size, never from the category (a Barebells can is a `protein_bar`, but its pack size tells you the unit). Logging a liquid in ml uses 1 ml = 1 g and shows it as approximate. |
| `source` | text | no | Slug of where the numbers come from. Joins to `sources.slug`. Show it (accuracy rule 4). |
| `verified` | integer | no | 0 or 1, computed by the builder (see Verified). Show it with the source (accuracy rule 4). |
| `status` | text | yes | `from_source` or `derived` |
| `data_quality` | text | yes | JSON array of flag codes (see Data quality) |
| `kcal`, `protein_g`, `fat_g`, `sat_fat_g`, `carbs_g`, `sugars_g`, `fibre_g`, `salt_g` | real | yes | Per 100 `per_100_unit`. **NULL means unknown. Never read NULL as 0** (accuracy rule 2). In SQL and Swift these are 8-byte doubles. |
| `search_text` | text | no | Normalised name, brand and flavour, plus the names and flavours of a family's other listings (see Families). For search only. |

Only macros are in the slim database. Vitamins, minerals and the per-source rows stay in `nutrition-data`.

Categories (food, 21): `meat_fish`, `snacks_sweets`, `ready_meals_sauces`, `drinks`, `bread_cereal_grain`, `dairy_eggs`, `fruit_vegetables`, `vitamin_mineral`, `herbal_other_supplement`, `protein_bar`, `protein_powder`, `energy_gel_sports_drink`, `amino_acids`, `pre_workout`, `protein_drink_or_dessert`, `mass_gainer_meal_replacement`, `collagen_joint`, `omega3_oils`, `fat_burner_weight_loss`, `creatine`, `other_food`. The 22nd, `non_food`, exists in `nutrition-data` and is not in the slim file.

### `sources`
`slug` (primary key), `display_name`, `kind`. One row per source slug used in `products.source`, plus the reserved slug `custom` for the user's own foods (it never appears in a product database, but the log snapshot uses it). `kind` is one of `open_database`, `government`, `brand`, `shop`, `custom`. The builder holds the slug to kind mapping in one place.

### `product_eans`
`product_id`, `ean`: every barcode a product is known by, in canonical form. Barcode lookup is `select product_id from product_eans where ean = ?` after canonicalising the scanned code. `ean` has a unique index: the builder fails if two products share a canonical barcode (there are 0 today).

### `redirects` and `removed`
`redirects(old_id, new_id)`: a product that was merged into another. `removed(id)`: a product that was in an earlier release and is gone, with no successor.

### `meta`
Key and value rows: `db_version`, `schema_version`, `variant`, `product_count`, `built_at`, `source_commit`, and `open_sources` on the open variant. `pragma user_version` also holds the schema version.

## Barcodes

One canonical form, used in `product_eans.ean`, `products.ean` and by the client before every lookup:

1. Keep digits only.
2. If there are fewer than 13 digits, left-pad with zeros to 13 (this turns EAN-8 and UPC-A into 13 digits).
3. If there are 14 digits and the first is `0`, drop it (a GTIN-14 that is really an EAN-13). Otherwise keep the 14 digits.
4. Anything else (no digits, or more than 14) is not a barcode and finds nothing.

No check-digit validation: the data has `ean_checksum_invalid` rows that are still looked up. The cases are in `packages/contracts/search/barcode.json` (EAN-8, UPC-A, EAN-13, GTIN-14, separators, invalid). The v0 build stored EAN-8 and UPC-A zero-padded to 13 while scanners return 8 or 12 digits, so a plain `where ean = ?` found nothing; the canonical rule fixes that on both sides.

## Ids

- An id is never reused for a different product, and a re-keyed product must go through `merged_into` so it gets a redirect.
- Resolve an id from a log entry, favourite or saved meal in this order: `products.id`, then `redirects.old_id` (use `new_id`, it is already the final target), then `removed.id`. **An id found in none of the three counts as removed.** A removed product keeps working in old log entries because every entry stores its own nutrition snapshot (accuracy rule 3); it just cannot be re-logged.
- `build_slim.py --previous <old file>` records every id that vanished since the last release in `removed`. The release workflow must pass `--previous` for both variants; the first open build had none, so it has no `removed` rows yet.
- Stored ids are never rewritten on redirect. A reader resolves them when it reads them.

## Search

1. **Normalise** the query with the same rule used to build `search_text`: lowercase, then `ø`→`o`, `æ`→`ae`, `å`→`a` (also `ä`→`a`, `ö`→`o`, `ü`→`u`, `ß`→`ss`), then strip any other accents (Unicode NFKD and remove combining marks). Other letters such as `ł` stay as they are.
2. **Tokenise** on anything that is not a Unicode letter or number (what FTS5 `unicode61` does), so `D-vita 50μg` gives `d`, `vita`, `50μg`.
3. **Empty token list means no query.** Return nothing; an empty `MATCH` is a syntax error.
4. **Query** FTS5 with every token quoted, joined by AND. Add `*` (prefix match) only to tokens of 2 or more characters; one-character prefixes have no index.

```sql
select p.*, f.rowid from products_fts f join products p on p.rowid = f.rowid
where products_fts match '"skyr"* "mango"*'
order by bm25(products_fts), length(p.search_text), p.id limit 500;
```

5. **Rank** the candidates (up to 500) in code with this total order, so tied rows never come back in an undefined order:
   1. number of query tokens that equal a whole token of `search_text`, descending (a whole-word match beats a prefix match: `melk` ranks "Lettmelk" and "Melk" above "Melkesjokolade");
   2. products with a `kcal` value before products without one (products with no nutrition are shown, with a badge, ranked below those that have values, and stay loggable);
   3. `bm25`, ascending;
   4. `length(search_text)`, ascending;
   5. `id`, ascending.

   Return the first 20 (or as many as the screen needs).

The FTS table is `products_fts(search_text)` with the `unicode61` tokenizer and prefix indexes for 2 and 3 characters.

What `search_text` contains: normalised name, brand and flavour. It does not contain `pack_size` or the category, so `tine melk 1l` returns nothing.

Known limitation, compounds: Norwegian compounds are one token. `melk` finds 1 of the 112 lettmelk/helmelk products and `kjottdeig` misses `kyllingkjottdeig`. The cheap fix is builder work (appending the tail of long compound words to `search_text`); until then the app should not promise it.

Rule examples (the first are in `packages/contracts/search/normalise.json`, see #32): `Kjøttdeig` → `kjottdeig`, `Bæreposer` → `baereposer`, `Håndkjøpt Å` → `handkjopt a`, `Crème fraîche` → `creme fraiche`, `Łosoś` → `łosos`.

## Verified

Every product shows its source and whether it is verified (accuracy rule 4). `products.verified` is computed once by the builder so Swift and the web never reimplement it. A product is verified (`1`) when all of these hold, otherwise `0`:

- `status = 'from_source'`;
- `kcal`, `protein_g`, `fat_g` and `carbs_g` are all present, and not all four are 0;
- no suspect flag (see Data quality);
- its `source` has a `kind` other than `shop`.

The log snapshot copies `verified` (null for old rows and for custom foods).

## Data quality

`data_quality` is a JSON array. Each entry is a flag code. The code is the text before the first colon. v1 allows only the closed list below, and the builder fails on an unknown code. The v0 data has 86 distinct values: 6 are free-text notes and 5 are `derived_canonical_from_N_products`. The builder must turn the second kind into `derived_canonical`, and the free-text notes into `pure_compound`, moving the note text elsewhere.

**Suspect flags** (the number itself may be wrong or means something else; they block `verified`):
`no_nutrition`, `nutrition_text_only`, `nutrition_image_only`, `flavour_nutrition_shared_assumed`, `flavour_table_ambiguous`, `variant_table_ambiguous`, `variants_share_one_nutrition_table`, `flavour_macros_may_differ`, `bundle_or_multipack`, `per100_basis_unverified`, `per100_basis_assumed`, `per100_derived_from_serving`, `per100_is_prepared_state`, `per100_prepared_state_only`, `kcal_macro_mismatch`, `kj_kcal_mismatch`, `kj_dropped_inconsistent_with_kcal`, `scraper_flag_macro_energy_mismatch`, `scraper_flag_kj_kcal_ratio`, `salt_sodium_mismatch`, `sources_disagree`, `unit_assumed`, `unit_inferred_by_scraper`, `sodium_unit_assumed`, `energy_unit_guessed`, `energy_unit_unclear`, `sugars_exceed_carbs`, `sat_fat_exceeds_fat`, `macros_sum_over_100g`, `carbs_over_100g`, `protein_over_100g`, `fat_over_100g`, `kcal_implausible_high`, `implausible_value_removed_by_collector`.

**Informational flags** (do not block `verified`): `missing_fibre`, `missing_salt`, `missing_kcal`, `missing_macros`, `ean_malformed`, `ean_checksum_invalid`, `ingredients_discarded_junk`, `us_market_product`, `pure_compound`, `derived_canonical`, and every `filled_from_<source>` (a value was filled from another source).

Still to settle with the data: what `per_serving_only` (6,761 products) does to the per-100 values. Until then it counts as a suspect flag.

## Delivery and versions

- `db_version` is `YYYY.MM.DD`, with `-2`, `-3` for a second build the same day. `schema_version` is an integer that changes only when a table or column the app reads changes. v1 is `schema_version` 2.
- Each build is a private GitHub Release (`db-<version>`) in `loftspace/nutrition-data`, with `products.sqlite.gz`, `products-open.sqlite.gz` and `checksums.txt` (sha256 of every file, compressed and not). The app pins the sha256 of the uncompressed file it bundles.
- The web app gets the same file from a private Supabase Storage bucket (#46).
- Xcode Cloud (proposed by Nima): a lock file in `apps/ios` holding `db_version` and the sha256, and a `ci_post_clone.sh` that downloads the release with a read-only fine-grained token, checks the hash and caches the file. The token is an Xcode Cloud secret that Max creates in the GitHub web UI, never in a file.

## Zero kcal

1,353 visible products have `kcal = 0` exactly, mostly missing data written as 0 (Kalkun Lårfilet, Rustikk Havrebrød). v1 rule: when kcal, protein, fat and carbs are all 0, the builder writes NULL and adds `no_nutrition`, except for an allowlist (water, sweeteners, salt). A CI test counts the remaining all-zero products and fails above a set number. This is a data-side beta blocker, not a contract blocker.

## Families and display names (added 2026-11-08, Max)

The same product sold in several flavours, pack sizes or shops is one row, for example `YT Proteinpudding` for Mango, Vanilje, Sjokolade and the multipacks.
- **Which listings form a family:** they are one product line (the first product word after sizes and brand words are dropped, with split words joined, so `Protein Melk` and `YT Proteinmelk` match; ml and g count alike), their brands agree, and every nutrient both listings know is within 10% (at least 0.3 g or 0.3 kcal), checked for every pair (Max, 2026-11-08: YT Proteinmelk Kakao at 46 kcal is a flavour of Naturell at 43). Variant words the numbers cannot show (lactose-free, organic, vegan, smoked, marinated, capsules, decaf, energy) must match. When the names differ by more than size or case, both need the same known brand (a brand at the start of the name counts), and Jev checked that they really are one product line. The same words in another order, with or without the brand, count as the same name. A listing with no numbers folds into the product of the same brand and the same words that has numbers. The accepted families are committed in `nutrition-data` as `data/families.json`.
- **Which listing the row comes from:** the family row is its best listing (verified first, then a non-shop source, then the most known nutrients), with that listing's id, source and numbers. Numbers are never averaged (accuracy rule 1).
- **The family name:** the words every listing shares (`YT Proteinpudding`). `pack_size` and `flavour` are NULL when the listings disagree.
- **What still works:** the other listings' ids are in `redirects`, their barcodes are in `product_eans` on the family row, and their names and flavours are in its `search_text`, so `proteinpudding mango` still finds it.

Display names: ALL-CAPS names and brands become Title Case, and trademark signs and a repeated "- BRAND" tail are dropped (`YT® PROTEINYOGHURT VANILJE - YT®` becomes `YT Proteinyoghurt Vanilje`). Mixed-case names stay as the source wrote them.

## Variants

The open variant has 24 products whose values were filled from non-open sources. In v1 the builder drops those values (sets them to NULL) in the open file. `full` or `open` for the friend beta is still Max's licence decision; the app is built to work with either. The open file has only 34% of the 70-prefix (Norwegian) barcodes.

## Builder work for v1 (one PR in `loftspace/nutrition-data`, after this is approved)

- [ ] Canonical barcodes in `product_eans.ean` and `products.ean`, unique index on `product_eans(ean)`, drop `ix_products_ean`.
- [ ] Drop `non_food` rows. The product counts in the table above change.
- [ ] `per_100_unit`, `verified`, the `sources` table, `schema_version` 2.
- [ ] Closed `data_quality` code list, normalise the free-text and `derived_canonical_*` entries.
- [ ] Zero kcal rule with the allowlist and the CI count test.
- [ ] Open variant: no values filled from non-open sources.
- [ ] Release workflow passes `--previous` for both variants.
- [ ] Compound tails in `search_text` (optional, after the rest).

## Open questions (not decided)

1. **Which variant the friend beta ships:** `full` or `open`. Max's licence call (#15, decision 30).
2. **Compounds:** do we add compound tails to `search_text` for the MVP, or accept the limitation?
3. **`per_serving_only`:** are the per-100 values derived? Needs a look in `nutrition-data`.
