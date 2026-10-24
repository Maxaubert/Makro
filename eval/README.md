# Voice test set and scorer (#35)

The 90% gate for voice and typed logging (`docs/MVP.md`, Voice logging) is measured here. The set also serves the failure-class work in #14 and #17. Owner: Max. Nima adds lines too.

## What is in `voice/`

| File | What |
|---|---|
| `cases.jsonl` | The test set: one line per spoken or typed food line, with the expected result. Real lines from us (`v…`) plus a synthetic stress set (`s…`). Product ids are from `db-2026.10.18`. |
| `score.py` | Scores one parser run against the set. Python standard library only. |
| `test_score.py` | Tests for the scorer. |

## One case

One JSON object per line in `cases.jsonl`:

```json
{"id": "v001", "lang": "nb", "text": "to egg og 200 g kjøttdeig", "source": "max", "audio": null, "tags": ["multi", "pieces"],
 "items": [
   {"product": ["<egg id>"], "quantity": 2, "unit": "piece"},
   {"product": ["<kjøttdeig id>"], "quantity": 200, "unit": "g"}
 ]}
```

- `id`: unique, `v001`, `v002` and so on.
- `lang`: `nb` or `en`, the language the line was spoken or typed in.
- `text`: what the user said or typed, exactly, including the wrong parts of a real transcript. Do not tidy it.
- `source`: `max` or `nima` for real lines, `synthetic` for the stress set. No other names, and no private data in `text`.
- `audio`: a path to the recording if both of us agreed to keep it, otherwise `null`. Audio files are not committed until we decide how to store them (they can hold voices and background talk).
- `tags`: free labels used for the breakdown, for example `brand`, `pieces`, `grams`, `multi`, `compound-word`, `english-name`, `not-in-database`.
- `items`: what the app should end up with, one entry per food.
  - `product`: a list of accepted product ids from the current `db_version` (more than one when several products are equally right), or `null` when the food is truly not in the database and the app should make a custom food.
  - `name`: a human label for the reviewer, not scored.
  - `quantity` and `unit`: exactly as spoken. A spoken range ("10-15 gram") is `[10, 15]`, and any amount inside it counts. dl and litres become ml, kilos become g. `unit` is `g`, `ml`, `piece` or `serving` (the same list as `log_entries` in `packages/contracts/log-schema.md`). "To egg" is `2` and `piece`, not a weight: turning pieces into grams is deterministic code and has its own golden files.

  - An **ask item**, `{"name": …, "ask": true, "options": [ids]}`, means the right result is that the app asks instead of guessing, because the line does not settle the numbers: "en Yt proteinmelk" (1 l or 330 ml), "en cola", "en Grandiosa", a protein powder with no brand. `options` lists the candidates for the reviewer; it is not scored.

Conventions used so far: no flavour or brand named means any flavour or brand of that product counts; a dish whose ingredients are spoken is logged as the ingredients; "litt", "en kopp" and "en skål" with no amount are `1` `serving`; a food the user describes with their own numbers, or a restaurant or homemade dish, is a custom food (`null`). Multipacks never count as one piece.

Collect real lines: things we actually said or would say when logging. Include the awkward ones (brand plus flavour, compound words, English names for Norwegian foods, foods that are not in the database). A set that only holds easy lines passes the gate and means nothing. Dictate on an iPhone if you can: the app uses Apple's speech recognition, so its mishearings are the ones that matter.

**Stress set.** The `synthetic` lines are edge cases written on purpose (pack sizes, corrections mid-sentence, numbers in words, misheard brands, English, foods not in the database). Decision 18 sets the gate on real lines, so the scorer reports the stress set separately and never counts it toward the gate.

## Scoring a run

The parser run is a JSONL file with one object per case, using the same ids:

```json
{"id": "v001", "items": [{"product_id": "<egg id>", "quantity": 2, "unit": "piece"}, {"product_id": "<kjøttdeig id>", "quantity": 200, "unit": "g"}]}
```

`product_id` is `null` when the app made a custom food. An item where the app asked the user instead is `{"ask": true}`. Then:

```
python -I eval/voice/score.py --cases eval/voice/cases.jsonl --output run.jsonl
```

A line is correct only when both of these hold:
1. Every expected item is matched one to one by an output item with an accepted product id, the same quantity (or one inside the range) and the same unit, and every ask item by an output item that asks.
2. There are no extra output items.

A case with no output counts as wrong. The report gives the accuracy of the real lines against the 90% gate, the stress set on its own, product and quantity accuracy per item, and a breakdown by language, source and tag. Exit code 0 means the gate passed, 1 means it failed, 2 means a file error. `--json` prints the report as JSON.

## Tests

```
python -I -m unittest discover -s eval/voice
```

## Not here yet

- Enough real lines: the gate needs 100 to 200 from both of us before slice 9. There are 6 so far.
- A way to look up product ids while writing a case. Until then, take ids from the nutrition-data release.
- A runner that feeds `text` through the app's parser and writes `run.jsonl`. That belongs with the Swift Voice package (slice 9).
- Where audio files are stored, if we keep them.
