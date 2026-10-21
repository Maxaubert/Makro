"""Tests for the voice scorer. Run: python -I -m unittest discover -s eval/voice"""
import json
import os
import tempfile
import unittest

import score

EGG = "egg-id"
MINCED = "kjottdeig-id"
MINCED_ALT = "kjottdeig-other-id"


def case(cid, items, lang="nb", tags=()):
    return {"id": cid, "lang": lang, "text": "x", "source": "max", "tags": list(tags), "items": items}


def item(products, quantity, unit):
    return {"product": products, "quantity": quantity, "unit": unit}


def out(product_id, quantity, unit):
    return {"product_id": product_id, "quantity": quantity, "unit": unit}


class ScoreLine(unittest.TestCase):
    def test_exact_match(self):
        c = case("a", [item([EGG], 2, "piece"), item([MINCED], 200, "g")])
        got = [out(MINCED, 200, "g"), out(EGG, 2, "piece")]
        self.assertEqual(score.score_line(c, got)["verdict"], "correct")

    def test_any_listed_product_is_accepted(self):
        c = case("a", [item([MINCED, MINCED_ALT], 200, "g")])
        self.assertEqual(score.score_line(c, [out(MINCED_ALT, 200, "g")])["verdict"], "correct")

    def test_wrong_product_right_quantity(self):
        c = case("a", [item([EGG], 2, "piece")])
        r = score.score_line(c, [out(MINCED, 2, "piece")])
        self.assertEqual(r["verdict"], "wrong")
        self.assertEqual(r["product_ok"], 0)
        self.assertEqual(r["quantity_ok"], 1)

    def test_right_product_wrong_quantity(self):
        c = case("a", [item([EGG], 2, "piece")])
        r = score.score_line(c, [out(EGG, 3, "piece")])
        self.assertEqual(r["verdict"], "wrong")
        self.assertEqual(r["product_ok"], 1)
        self.assertEqual(r["quantity_ok"], 0)

    def test_wrong_unit_is_wrong_quantity(self):
        c = case("a", [item([MINCED], 200, "g")])
        self.assertEqual(score.score_line(c, [out(MINCED, 200, "ml")])["quantity_ok"], 0)

    def test_missing_item_is_wrong(self):
        c = case("a", [item([EGG], 2, "piece"), item([MINCED], 200, "g")])
        self.assertEqual(score.score_line(c, [out(EGG, 2, "piece")])["verdict"], "wrong")

    def test_extra_item_is_wrong(self):
        c = case("a", [item([EGG], 2, "piece")])
        self.assertEqual(score.score_line(c, [out(EGG, 2, "piece"), out(MINCED, 1, "g")])["verdict"], "wrong")

    def test_same_product_twice_matches_one_to_one(self):
        c = case("a", [item([EGG], 2, "piece"), item([EGG], 100, "g")])
        self.assertEqual(score.score_line(c, [out(EGG, 100, "g"), out(EGG, 2, "piece")])["verdict"], "correct")
        self.assertEqual(score.score_line(c, [out(EGG, 2, "piece"), out(EGG, 2, "piece")])["verdict"], "wrong")

    def test_expected_missing_product_needs_null(self):
        c = case("a", [item(None, 1, "serving")])
        self.assertEqual(score.score_line(c, [out(None, 1, "serving")])["verdict"], "correct")
        self.assertEqual(score.score_line(c, [out(EGG, 1, "serving")])["verdict"], "wrong")

    def test_no_output_is_wrong(self):
        c = case("a", [item([EGG], 2, "piece")])
        self.assertEqual(score.score_line(c, None)["verdict"], "wrong")

    def test_quantity_compares_numbers_not_types(self):
        c = case("a", [item([MINCED], 200, "g")])
        self.assertEqual(score.score_line(c, [out(MINCED, 200.0, "g")])["verdict"], "correct")
        self.assertEqual(score.score_line(c, [out(MINCED, 200.5, "g")])["verdict"], "wrong")


class Report(unittest.TestCase):
    def setUp(self):
        self.cases = [
            case("a", [item([EGG], 2, "piece")], lang="nb", tags=["brand"]),
            case("b", [item([MINCED], 200, "g")], lang="en"),
            case("c", [item([EGG], 1, "piece")], lang="nb"),
            case("d", [item([EGG], 4, "piece")], lang="nb"),
        ]
        self.outputs = {
            "a": [out(EGG, 2, "piece")],
            "b": [out(MINCED, 200, "g")],
            "c": [out(EGG, 1, "piece")],
        }

    def test_totals_and_gate(self):
        rep = score.build_report(self.cases, self.outputs)
        self.assertEqual(rep["lines"], 4)
        self.assertEqual(rep["correct"], 3)
        self.assertAlmostEqual(rep["accuracy"], 0.75)
        self.assertFalse(rep["gate_passed"])
        self.assertEqual(rep["not_answered"], ["d"])

    def test_gate_passes_at_90_percent(self):
        cases = [case(str(i), [item([EGG], 1, "piece")]) for i in range(10)]
        outputs = {str(i): [out(EGG, 1, "piece")] for i in range(9)}
        self.assertTrue(score.build_report(cases, outputs)["gate_passed"])

    def test_breakdown_by_lang_and_tag(self):
        rep = score.build_report(self.cases, self.outputs)
        self.assertEqual(rep["by_lang"]["nb"], {"lines": 3, "correct": 2})
        self.assertEqual(rep["by_lang"]["en"], {"lines": 1, "correct": 1})
        self.assertEqual(rep["by_tag"]["brand"], {"lines": 1, "correct": 1})

    def test_unknown_output_id_is_reported(self):
        outputs = dict(self.outputs, zzz=[out(EGG, 1, "piece")])
        self.assertEqual(score.build_report(self.cases, outputs)["unknown_ids"], ["zzz"])


class Files(unittest.TestCase):
    def write(self, name, lines):
        path = os.path.join(self.dir.name, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            for ln in lines:
                f.write(ln if isinstance(ln, str) else json.dumps(ln, ensure_ascii=False))
                f.write("\n")
        return path

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def test_load_cases_rejects_duplicate_ids(self):
        p = self.write("c.jsonl", [case("a", [item([EGG], 1, "piece")]), case("a", [item([EGG], 1, "piece")])])
        with self.assertRaises(ValueError):
            score.load_cases(p)

    def test_load_cases_rejects_bad_unit(self):
        p = self.write("c.jsonl", [case("a", [item([EGG], 1, "cup")])])
        with self.assertRaises(ValueError):
            score.load_cases(p)

    def test_load_cases_rejects_empty_product_list(self):
        p = self.write("c.jsonl", [case("a", [item([], 1, "piece")])])
        with self.assertRaises(ValueError):
            score.load_cases(p)

    def test_load_cases_rejects_bad_lang(self):
        p = self.write("c.jsonl", [case("a", [item([EGG], 1, "piece")], lang="de")])
        with self.assertRaises(ValueError):
            score.load_cases(p)

    def test_load_cases_skips_blank_lines_and_reads_utf8(self):
        c = case("a", [item([EGG], 1, "piece")])
        c["text"] = "kjøttdeig og blåbær"
        p = self.write("c.jsonl", [c, ""])
        self.assertEqual(score.load_cases(p)[0]["text"], "kjøttdeig og blåbær")

    def test_load_outputs_rejects_duplicate_ids(self):
        p = self.write("o.jsonl", [{"id": "a", "items": []}, {"id": "a", "items": []}])
        with self.assertRaises(ValueError):
            score.load_outputs(p)

    def test_empty_case_file_is_an_error_for_the_gate(self):
        p = self.write("c.jsonl", [])
        with self.assertRaises(ValueError):
            score.load_cases(p)


if __name__ == "__main__":
    unittest.main()
