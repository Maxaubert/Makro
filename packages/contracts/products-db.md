# Product database contract (v0, proposed)

What the app and the web app may read from the slim product database. Status: **proposed by Max, needs Nima's approval** (#31). Once approved, a change needs both of us and a `schema_version` bump.

The database is built by `loftspace/nutrition-data` (`tools/build_slim.py`). The app reads it read-only. Measured on 2026-10-18 from the real data:

| File | Products | Size | Gzipped |
|---|---|---|---|
| `products.sqlite` (variant `full`) | 124,175 | 48 MB | 13.6 MB |
| `products-open.sqlite` (variant `open`, open sources only) | 46,230 | 17 MB | 5.4 MB |

Both files have the same schema. Only the rows differ, and `meta.variant` says which one you have.

## Tables

### `products`
One row per visible product. A product is in the file only if it is Norway-relevant, not hidden, not merged into another product, and has a name.

| Column | Type | Null? | Meaning |
|---|---|---|---|
| `id` | text, primary key | no | Opaque and never reused (see Ids). Today it looks like `source:url`, so it can be long. |
| `name` | text | no | Product name |
| `brand` | text | yes | |
| `pack_size` | text | yes | Free text, for example `450 g` |
| `ean` | text | yes | The primary barcode. Look up barcodes through `product_eans`, not this column. |
| `flavour` | text | yes | |
| `category` | text | yes | One of 22 categories (assigned by a model, can be wrong) |
| `serving_g` | real | yes | One serving in grams |
| `source` | text | no | Where the numbers come from (`openfoodfacts`, `norgesgruppen`, ...). Show it (accuracy rule 4). |
| `status` | text | yes | `from_source` or `derived` |
| `data_quality` | text | yes | JSON array of flags, for example `["missing_fibre"]` or `["no_nutrition"]` |
| `kcal`, `protein_g`, `fat_g`, `sat_fat_g`, `carbs_g`, `sugars_g`, `fibre_g`, `salt_g` | real | yes | Per 100 g. **NULL means unknown. Never read NULL as 0** (accuracy rule 2). |
| `search_text` | text | no | Normalised name, brand and flavour. For search only. |

Only macros are in the slim database. Vitamins, minerals and the per-source rows stay in `nutrition-data`.

### `product_eans`
`product_id`, `ean`: every barcode a product is known by. Barcode lookup is `select product_id from product_eans where ean = ?`. One product can have several, and the same barcode can appear on more than one source entry that was merged into one product.

### `redirects` and `removed`
`redirects(old_id, new_id)`: a product that was merged into another. `removed(id)`: a product that was in an earlier release and is gone, with no successor.

### `meta`
Key and value rows: `db_version`, `schema_version`, `variant`, `product_count`, `built_at`, `source_commit`, and `open_sources` on the open variant. `pragma user_version` also holds the schema version.

## Ids

- An id is never reused for a different product.
- Resolve an id from a log entry, favourite or saved meal in this order: `products.id`, then `redirects.old_id` (use `new_id`, it is already the final target), then `removed.id`. A removed product keeps working in old log entries because every entry stores its own nutrition snapshot (accuracy rule 3); it just cannot be re-logged.
- `build_slim.py --previous <old file>` records every id that vanished since the last release in `removed`, so no old id is ever unknown. A test covers it.

## Search

1. **Normalise** the query with the same rule used to build `search_text`: lowercase, then `ø`→`o`, `æ`→`ae`, `å`→`a` (also `ä`→`a`, `ö`→`o`, `ü`→`u`, `ß`→`ss`), then strip any other accents (Unicode NFKD and remove combining marks).
2. **Tokenise** on anything that is not a letter or digit.
3. **Query** FTS5 with every token quoted and prefix-matched, joined by AND, ordered by `bm25`:

```sql
select p.* from products_fts f join products p on p.rowid = f.rowid
where products_fts match '"skyr"* "mango"*'
order by bm25(products_fts) limit 20;
```

The FTS table is `products_fts(search_text)` with the `unicode61` tokenizer and prefix indexes for 2 and 3 characters.

Rule examples (these become golden files in #32): `Kjøttdeig` → `kjottdeig`, `Bæreposer` → `baereposer`, `Håndkjøpt Å` → `handkjopt a`, `Crème fraîche` → `creme fraiche`.

## Delivery and versions

- `db_version` is `YYYY.MM.DD`, with `-2`, `-3` for a second build the same day. `schema_version` is an integer that changes only when a table or column the app reads changes.
- Each build is a private GitHub Release (`db-<version>`) in `loftspace/nutrition-data`, with `products.sqlite.gz`, `products-open.sqlite.gz` and `checksums.txt` (sha256 of every file, compressed and not). The app pins the sha256 of the uncompressed file it bundles.
- The web app gets the same file from a private Supabase Storage bucket (#46).

## Open questions (not decided)

1. **What does "verified" mean?** The data has `status`, `data_quality` and `source`, but no verified flag. Proposal: a product is *verified* when `status = 'from_source'`, `data_quality` has neither `no_nutrition` nor `flavour_nutrition_shared_assumed`, and `source` is not a scraped shop. This needs a decision, then a precomputed `verified` column so Swift and the web do not each reimplement it.
2. **Drinks:** are values per 100 g or per 100 ml? The source data only labels `per_100g`.
3. **Zero kcal:** 1,353 visible products have `kcal = 0` exactly. Some are water or sweeteners, but some may be missing values written as 0. Needs a check in `nutrition-data` before the friend beta.
4. **Products with no nutrition at all:** about a third of the products (40,477 of 124,175) have no kcal. Search should show them, flagged, and logging them must follow accuracy rule 5 (never block).
5. **Private release access for Xcode Cloud:** how the build downloads a private release from the `loftspace` org (a token).
6. **Which variant the friend beta ships:** `full` or `open`. The open one has 37% as many products.
