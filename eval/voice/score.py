"""Score a voice or typed logging run against the test set (#35).

    python -I eval/voice/score.py --cases eval/voice/cases.jsonl --output run.jsonl

A line is correct only when every expected item is matched one to one by an output
item with an accepted product id, the same quantity (or one inside an expected
range) and the same unit, and there are no extra output items. An expected "ask"
item is matched only by an output item that asks the user instead of guessing.
The gate (docs/MVP.md, Voice logging; decision 18) is 90% of the real lines; the
synthetic lines are a stress set reported on their own.
"""
import argparse
import json
import sys

UNITS = ("g", "ml", "piece", "serving")
LANGS = ("nb", "en")
SOURCES = ("max", "nima", "synthetic")
REAL = ("max", "nima")
GATE = 0.9


def _read_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise ValueError(f"{path}:{n}: not JSON ({e.msg})")
    return rows


def _number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _quantity(q):
    if _number(q):
        return q > 0
    return (isinstance(q, list) and len(q) == 2 and all(_number(x) for x in q)
            and 0 < q[0] < q[1])


def load_cases(path):
    cases = _read_jsonl(path)
    if not cases:
        raise ValueError(f"{path}: no cases")
    seen = set()
    for c in cases:
        cid = c.get("id")
        if not isinstance(cid, str) or not cid:
            raise ValueError("every case needs a string id")
        if cid in seen:
            raise ValueError(f"duplicate case id {cid}")
        seen.add(cid)
        if c.get("lang") not in LANGS:
            raise ValueError(f"{cid}: lang must be one of {LANGS}")
        if not isinstance(c.get("text"), str) or not c["text"]:
            raise ValueError(f"{cid}: text is required")
        if c.get("source") not in SOURCES:
            raise ValueError(f"{cid}: source must be one of {SOURCES}")
        if not isinstance(c.get("items"), list) or not c["items"]:
            raise ValueError(f"{cid}: items must be a non-empty list")
        for it in c["items"]:
            if it.get("ask") is True:
                o = it.get("options")
                if not isinstance(o, list) or not o or not all(isinstance(x, str) and x for x in o):
                    raise ValueError(f"{cid}: an ask item needs a non-empty list of options")
                continue
            p = it.get("product")
            if p is not None and (not isinstance(p, list) or not p or not all(isinstance(x, str) and x for x in p)):
                raise ValueError(f"{cid}: product is null or a non-empty list of ids")
            if not _quantity(it.get("quantity")):
                raise ValueError(f"{cid}: quantity must be a positive number or a [low, high] range")
            if it.get("unit") not in UNITS:
                raise ValueError(f"{cid}: unit must be one of {UNITS}")
        c.setdefault("tags", [])
    return cases


def load_outputs(path):
    outputs = {}
    for row in _read_jsonl(path):
        rid = row.get("id")
        if rid in outputs:
            raise ValueError(f"duplicate output id {rid}")
        outputs[rid] = row.get("items", [])
    return outputs


def _same_quantity(exp, got):
    if exp.get("ask"):
        return got.get("ask") is True
    if got.get("ask") or not _number(got.get("quantity")) or got.get("unit") != exp["unit"]:
        return False
    q, e = got["quantity"], exp["quantity"]
    if isinstance(e, list):
        return e[0] <= q <= e[1]
    return abs(q - e) <= 1e-9 * max(1.0, abs(e))


def _same_product(exp, got):
    if exp.get("ask"):
        return got.get("ask") is True
    if got.get("ask"):
        return False
    gid = got.get("product_id")
    if exp["product"] is None:
        return gid is None
    return gid in exp["product"]


def score_line(case, got):
    """Match expected items to output items one to one, best match first."""
    expected = case["items"]
    got = list(got or [])
    pending = list(range(len(got)))
    product_ok = quantity_ok = 0
    full = 0
    for exp in expected:
        best, best_rank = None, -1
        for i in pending:
            p, q = _same_product(exp, got[i]), _same_quantity(exp, got[i])
            rank = (2 if p and q else 0) + (1 if p or q else 0)
            if rank > best_rank:
                best, best_rank = i, rank
        if best is None:
            continue
        pending.remove(best)
        p, q = _same_product(exp, got[best]), _same_quantity(exp, got[best])
        product_ok += p
        quantity_ok += q
        full += p and q
    ok = full == len(expected) and not pending
    return {
        "id": case["id"],
        "verdict": "correct" if ok else "wrong",
        "items": len(expected),
        "product_ok": product_ok,
        "quantity_ok": quantity_ok,
    }


def _bucket(table, key, ok):
    b = table.setdefault(key, {"lines": 0, "correct": 0})
    b["lines"] += 1
    b["correct"] += ok


def build_report(cases, outputs):
    ids = {c["id"] for c in cases}
    results, by_lang, by_tag, by_source, not_answered = [], {}, {}, {}, []
    for c in cases:
        if c["id"] not in outputs:
            not_answered.append(c["id"])
        r = score_line(c, outputs.get(c["id"]))
        results.append(r)
        ok = r["verdict"] == "correct"
        _bucket(by_lang, c["lang"], ok)
        _bucket(by_source, c["source"], ok)
        for t in c["tags"]:
            _bucket(by_tag, t, ok)
    real = [r for c, r in zip(cases, results) if c["source"] in REAL]
    correct = sum(r["verdict"] == "correct" for r in real)
    accuracy = correct / len(real) if real else None
    stress = [r for c, r in zip(cases, results) if c["source"] not in REAL]
    items = sum(r["items"] for r in results)
    return {
        "lines": len(real),
        "correct": correct,
        "accuracy": accuracy,
        "gate": GATE,
        "gate_passed": accuracy is not None and accuracy >= GATE,
        "stress": {"lines": len(stress), "correct": sum(r["verdict"] == "correct" for r in stress)},
        "items": items,
        "items_product_ok": sum(r["product_ok"] for r in results),
        "items_quantity_ok": sum(r["quantity_ok"] for r in results),
        "by_lang": by_lang,
        "by_tag": by_tag,
        "by_source": by_source,
        "not_answered": not_answered,
        "unknown_ids": sorted(k for k in outputs if k not in ids),
        "wrong": [r["id"] for r in results if r["verdict"] == "wrong"],
    }


def _print(rep):
    pct = lambda a, b: f"{100 * a / b:.1f}%" if b else "n/a"
    print(f"Real lines correct: {rep['correct']}/{rep['lines']} ({pct(rep['correct'], rep['lines'])}), gate {int(rep['gate'] * 100)}%: "
          f"{'PASS' if rep['gate_passed'] else 'FAIL'}")
    st = rep["stress"]
    if st["lines"]:
        print(f"Stress set (synthetic, not in the gate): {st['correct']}/{st['lines']} ({pct(st['correct'], st['lines'])})")
    print(f"Items: product right {pct(rep['items_product_ok'], rep['items'])}, quantity right {pct(rep['items_quantity_ok'], rep['items'])}")
    for title, table in (("Language", rep["by_lang"]), ("Source", rep["by_source"]), ("Tag", rep["by_tag"])):
        for k in sorted(table):
            b = table[k]
            print(f"  {title} {k}: {b['correct']}/{b['lines']} ({pct(b['correct'], b['lines'])})")
    if rep["not_answered"]:
        print("No output for:", ", ".join(rep["not_answered"]))
    if rep["unknown_ids"]:
        print("Output ids not in the test set:", ", ".join(rep["unknown_ids"]))
    if rep["wrong"]:
        print("Wrong:", ", ".join(rep["wrong"]))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cases", required=True)
    ap.add_argument("--output", required=True, help="JSONL: one {id, items:[{product_id, quantity, unit} or {ask: true}]} per case")
    ap.add_argument("--json", action="store_true", help="print the report as JSON")
    a = ap.parse_args(argv)
    try:
        rep = build_report(load_cases(a.cases), load_outputs(a.output))
    except (ValueError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if a.json:
        print(json.dumps(rep, ensure_ascii=False, indent=2))
    else:
        _print(rep)
    return 0 if rep["gate_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
