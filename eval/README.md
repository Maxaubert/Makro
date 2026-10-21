# Voice test set and scorer (#35)

The 90% gate for voice and typed logging (`docs/MVP.md`, Voice logging) is measured here. The set also serves the failure-class work in #14 and #17. Owner: Max. Nima adds lines too.

## What is in `voice/`

| File | What |
|---|---|
| `cases.jsonl` | The test set: one line per spoken or typed food line, with the expected result. Starts empty; real lines are added by hand. |
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
- `source`: `max` or `nima`. No other names, and no private data in `text`.
- `audio`: a path to the recording if both of us agreed to keep it, otherwise `null`. Audio files are not committed until we decide how to store them (they can hold voices and background talk).
- `tags`: free labels used for the breakdown, for example `brand`, `pieces`, `grams`, `multi`, `compound-word`, `english-name`, `not-in-database`.
- `items`: what the app should end up with, one entry per food.
  - `product`: a list of accepted product ids from the current `db_version` (more than one when several products are equally right), or `null` when the food is truly not in the database and the app should make a custom food.
  - `quantity` and `unit`: exactly as spoken. `unit` is `g`, `ml`, `piece` or `serving` (the same list as `log_entries` in `packages/contracts/log-schema.md`). "To egg" is `2` and `piece`, not a weight: turning pieces into grams is deterministic code and has its own golden files.

Collect real lines only: things we actually said or would say when logging. Include the awkward ones (brand plus flavour, compound words, English names for Norwegian foods, foods that are not in the database). A set that only holds easy lines passes the gate and means nothing.

## Scoring a run

The parser run is a JSONL file with one object per case, using the same ids:

```json
{"id": "v001", "items": [{"product_id": "<egg id>", "quantity": 2, "unit": "piece"}, {"product_id": "<kjøttdeig id>", "quantity": 200, "unit": "g"}]}
```

`product_id` is `null` when the app made a custom food. Then:

```
python -I eval/voice/score.py --cases eval/voice/cases.jsonl --output run.jsonl
```

A line is correct only when both of these hold:
1. Every expected item is matched one to one by an output item with an accepted product id, the same quantity and the same unit.
2. There are no extra output items.

A case with no output counts as wrong. The report gives the line accuracy against the 90% gate, product and quantity accuracy per item, and a breakdown by language and tag. Exit code 0 means the gate passed, 1 means it failed, 2 means a file error. `--json` prints the report as JSON.

## Tests

```
python -I -m unittest discover -s eval/voice
```

## Not here yet

- The real lines (target 100 to 200, from both of us). The gate needs the set before slice 9.
- A way to look up product ids while writing a case. Until then, take ids from the nutrition-data release.
- A runner that feeds `text` through the app's parser and writes `run.jsonl`. That belongs with the Swift Voice package (slice 9).
- Where audio files are stored, if we keep them.
