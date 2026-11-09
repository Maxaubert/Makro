# Contracts and golden files

Shared test data that the Swift app and the Python pipeline are both checked against (#32). A golden file holds inputs and the exact expected outputs. It contains no code. Each suite reads the files, runs its own implementation on every input and compares the result with the stored answer.

Status: oracle split, owners, rounding and CI approved by Nima in review of #51 (decision 31). The first cases were drafted by Max; either of us may change them.

## Who consumes what (the oracle)

| Files | Swift suite | Python suite | Why |
|---|---|---|---|
| `nutrition/*.json` (per-100 g to portion, totals with unknowns) | yes | no | Maths lives in Swift only (`docs/MVP.md`, `AGENTS.md`) |
| `goals/*.json` (targets, calorie floor, loss rate) | yes, when iOS is built | no | The web app runs them first (decision 38) |
| `goals/constants.json` (calorie floor, maximum loss rate, the other goal numbers, each with its source and status) | yes, when iOS is built | no | The web app checks it too (decision 38) |
| `guidance/*.json` (week window, weekly average and verdict, what is left, end-of-day status, suggestions, #27, #53) | yes, when iOS is built | no | The web app runs them first; the numbers in `guidance/constants.json` are provisional |
| `weight/*.json` (7-day trend with missing days and several entries a day, distance to goal) | yes, when iOS is built | no | The web app runs them first (#2) |
| `search/normalise.json` (query text to normalised tokens: ø, æ, å, case, accents) | yes | yes | Both sides build or query the search index and must normalise alike |
| `search/results.json` (query to expected product ids) | yes | no | Runs against a small pinned fixture database, not the full catalogue |
| `search/typos.json` (query, counts and FTS vocabulary to corrected tokens) | yes, when iOS is built | no | The web app runs it first (#22). Needs no database, the runner feeds the vocabulary in |

## The server and the web app do not redo the maths

The server and the web app only add up the stored per-entry totals: `SUM(col)` for the value, `COUNT(col)` for covered, `COUNT(*)` for count, never `COALESCE` to 0. Once #34 lands, a pgTAP test runs `nutrition/totals.json` against the day-sum query. There is no second copy of the maths.

## Who does what

| Piece | Owner |
|---|---|
| Swift test runner for `nutrition/` and `goals/` | Nima |
| Python test runner for `search/normalise.json` | Max |
| Maths cases (`nutrition/`, `goals/`), including the display rounding cases | Max drafted the first ones; Nima owns them from here, since the maths is Swift only |
| Normalisation cases (`search/`) | Max |
| `constants.json` (look up and cite Nordic guidance) | Max looks up, Nima approves |

## What is here and what is not yet

```
packages/contracts/
  README.md
  nutrition/portion.json     done (6 cases)
  nutrition/totals.json      done (7 cases)
  nutrition/display.json     done (7 cases, display rounding)
  search/normalise.json      done (22 cases, generated from the current build_slim.normalise)
  goals/                     not yet: needs the activity multipliers and fat minimum decided first
  constants.json             not yet: values must be looked up and cited
  search/typos.json          done (24 cases, the rule in products-db.md Search step 6)
  search/results.json        not yet: needs the pinned fixture database
  fixtures/                  not yet
```

The test runners (Swift and Python) are not written yet, so nothing in CI reads these files.

## File format

- JSON, UTF-8, one file per topic.
- Every file has `"version": <integer>` and `"description"`, then `"cases": [...]`.
- Every case has a unique `"id"` (kebab-case), `"input"` and `"expected"`. Add `"note"` when the reason is not obvious.
- Every nutrient key is always present, with an explicit `null` when unknown. Runners fail on a missing key.
- Cases are never reordered or renumbered. Add new ones at the end.
- `version` goes up when the shape of a case changes. Adding a case does not change it.

## Null and zero

Missing means unknown, never zero (accuracy rule 2).

- Unknown nutrient: `null`. Real zero: `0`. They are different cases and both need golden cases.
- A total over items with unknowns returns the sum of the known values plus `"covered"` (items with a value) and `"count"` (all items). A total of nothing known is `null`, not `0`.

## Numbers and rounding

- JSON numbers, `.` as the decimal separator.
- `nutrition/portion.json` and `totals.json` hold unrounded results. A runner passes a value when `|a - e| <= max(1e-9 * max(|a|, |e|), 1e-9)`. The absolute floor makes an expected `0` work.
- Display rounding lives in `nutrition/display.json`. `input.rounding` is `{digits, mode}` and the only mode is `half-away-from-zero`. Expected values are rounded numbers, not strings.
- The method is pinned so every runner agrees: `(x * 10^d)` rounded half away from zero, divided by `10^d`, then formatted. In Swift that is `(x * pow(10, d)).rounded(.toNearestOrAwayFromZero) / pow(10, d)`. `Double.rounded()` already rounds half away from zero. The half-even defaults are in `NumberFormatter` and `FormatStyle`, so do not round through them.

## Changing a file

- Both of us approve every change (CODEOWNERS covers `packages/contracts/`, see #55).
- A change to a Makro file needs the Swift suite green, and for `search/normalise.json` the Python suite too. The two repos cannot be green in one PR, so: Makro merges first, then a `loftspace/nutrition-data` PR bumps the pinned commit and must pass.
- A new case can be added freely. Changing an existing `expected` value needs a line in the PR saying why the old answer was wrong.

## How CI gets the files

- Swift: a plain Swift package on Linux in GitHub Actions (`swift test`), triggered on `packages/contracts/**` (decision 26). Xcode Cloud runs the same tests with the app.
- `loftspace/nutrition-data` is a separate private repo. It copies `search/normalise.json` at a pinned commit of this repo (a CI step that fetches the one file), so the data repo never needs the rest. Open: the fetch needs a read token for this repo.

## Open items

- [ ] `constants.json` values looked up and cited from Nordic guidance (needs sources, not memory).
- [ ] Goal cases, once the activity multipliers and fat minimum are decided.
- [ ] Both test runners, then wire them into CI.
- [ ] Typo cases: the normalisation rule has no typo handling yet, so there are none until a rule exists.
