# Contracts and golden files

Shared test data that the Swift app and the Python pipeline are both checked against (#32). A golden file holds inputs and the exact expected outputs. It contains no code. Each suite reads the files, runs its own implementation on every input and compares the result with the stored answer.

Status: proposed, waiting for Nima to approve (see decision 31 in `DECISIONS.md`).

## Who consumes what (the oracle)

| Files | Swift suite | Python suite | Why |
|---|---|---|---|
| `nutrition/*.json` (per-100 g to portion, totals with unknowns) | yes | no | Maths lives in Swift only (`docs/MVP.md`, `AGENTS.md`) |
| `goals/*.json` (targets, calorie floor, loss rate) | yes | no | Same reason |
| `constants.json` (cited calorie floor and maximum loss rate) | yes | no | Needed by slice 3 (#23) |
| `search/normalise.json` (query text to normalised tokens: ø, æ, å, case, typos) | yes | yes | Both sides build or query the search index and must normalise alike |
| `search/results.json` (query to expected product ids) | yes | no | Runs against a small pinned fixture database, not the full catalogue |

Directory layout, to be created as each set lands:

```
packages/contracts/
  README.md
  constants.json
  nutrition/
  goals/
  search/
  fixtures/        small pinned products.sqlite for search/results.json
```

## File format

- JSON, UTF-8, one file per topic.
- Every file has `"version": <integer>` and `"description"`, then `"cases": [...]`.
- Every case has a unique `"id"` (kebab-case), `"input"` and `"expected"`. Add `"note"` when the reason is not obvious.
- Cases are never reordered or renumbered. Add new ones at the end.

## Null and zero

Missing means unknown, never zero (accuracy rule 2).

- Unknown nutrient: `null`. Real zero: `0`. They are different cases and both need golden cases.
- A total over items with unknowns returns the sum of the known values plus `"covered"` (items with a value) and `"count"` (all items). A total of nothing known is `null`, not `0`.

## Numbers and rounding (proposed, confirm with Nima)

- JSON numbers, `.` as the decimal separator.
- `expected` holds the unrounded result unless the case is named `*-display`. Suites compare unrounded values with a relative tolerance of 1e-9.
- `*-display` cases state the rounding in `input.rounding` (digits and mode). Default mode is half away from zero, which differs from Swift's default banker's rounding where it matters.

## Changing a file

- Both of us approve every change (CODEOWNERS entry to be added once #41 settles).
- A change needs the Swift suite and, for shared files, the Python suite green in the same PR.
- A new case can be added freely. Changing an existing `expected` value needs a line in the PR saying why the old answer was wrong.

## How CI gets the files

- Swift: runs when `packages/contracts/**` changes. Either an Xcode Cloud start condition or the pure Swift package on Linux in GitHub Actions. Nima chooses.
- `loftspace/nutrition-data` is a separate private repo. It copies `search/normalise.json` at a pinned commit of this repo (a CI step that fetches the one file), so the data repo never needs the rest. Open: the fetch needs a read token for this repo.

## Open items

- [ ] Nima approves the oracle split and the rounding rules.
- [ ] `constants.json` values looked up and cited from Nordic guidance (needs sources, not memory).
- [ ] First cases: nutrition maths, then normalisation.
