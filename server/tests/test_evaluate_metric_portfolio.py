"""The M7 pilot's evaluation script on deterministic synthetic cases."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "evaluate_metric_portfolio.py"
_spec = importlib.util.spec_from_file_location("evaluate_metric_portfolio", SCRIPT)
emp = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = emp
_spec.loader.exec_module(emp)


def test_average_ranks_share_ties():
    assert emp.average_ranks([10, 20, 20, 5]) == [2.0, 3.5, 3.5, 1.0]


def test_spearman_perfect_and_inverse():
    xs = [1, 2, 3, 4, 5, 6]
    assert emp.spearman(xs, [10, 20, 30, 40, 50, 60]) == pytest.approx(1.0)
    assert emp.spearman(xs, [6, 5, 4, 3, 2, 1]) == pytest.approx(-1.0)


def test_spearman_is_rank_based_not_linear():
    xs = [1, 2, 3, 4, 5, 6]
    assert emp.spearman(xs, [1, 4, 9, 16, 1000, 10**6]) == pytest.approx(1.0)


def test_spearman_known_value_with_ties():
    # Hand-computed: ranks x = 1..5, ranks y = [1.5, 1.5, 3, 4, 5].
    rho = emp.spearman([1, 2, 3, 4, 5], [7, 7, 8, 9, 10])
    assert rho == pytest.approx(0.9746794, rel=1e-6)


def test_constant_input_is_undefined_not_independent():
    assert emp.spearman([1, 2, 3, 4, 5], [0, 0, 0, 0, 0]) is None
    assert emp.spearman([3, 3, 3, 3, 3], [1, 2, 3, 4, 5]) is None


def test_too_few_pairs_is_undefined():
    assert emp.spearman([1, 2, 3], [1, 2, 3]) is None


def test_top_k_skips_the_floor_and_breaks_ties_by_id():
    values = {"a": 0, "b": 5, "c": 5, "d": 2, "e": None, "f": 0}
    assert emp.top_k(values, 10) == ["b", "c", "d"]
    assert emp.top_k(values, 2) == ["b", "c"]


def test_top_k_of_constant_metric_is_undefined():
    assert emp.top_k({"a": 0, "b": 0}, 10) is None
    assert emp.top_k({"a": None}, 10) is None


def test_overlap_counts_shared_and_propagates_undefined():
    assert emp.overlap(["a", "b", "c"], ["c", "b", "z"]) == {"shared": 2, "of": 3, "jaccard": 0.5}
    assert emp.overlap(None, ["a"]) is None


def _stratum():
    s = emp.Stratum("ts", "file")
    # size and complexity move together; todo is constant zero; noise is N/A on two rows.
    for i in range(8):
        s.rows[f"f{i}.ts"] = {"loc": 10.0 * (i + 1), "complexity": float(i), "todo": 0.0, "noise": float(i % 3) if i < 6 else None}
    return s


def test_support_reports_na_zero_and_constant():
    s = _stratum()
    noise = emp.support(s, "noise")
    assert noise["n"] == 8 and noise["measured"] == 6
    assert noise["na_rate"] == 0.25
    assert noise["zero_rate"] == pytest.approx(round(2 / 6, 3))
    todo = emp.support(s, "todo")
    assert todo["constant"] and todo["zero_rate"] == 1.0


def test_evaluate_stratum_pairs():
    result = emp.evaluate_stratum(_stratum(), ["loc", "complexity", "todo", "noise"])
    pairs = {(p["a"], p["b"]): p for p in result["pairs"]}
    assert pairs[("loc", "complexity")]["spearman"] == pytest.approx(1.0)
    assert pairs[("loc", "complexity")]["top10"]["shared"] == 7  # f0 is at the complexity floor
    # A constant metric has neither a correlation nor a queue.
    assert pairs[("loc", "todo")]["spearman"] is None
    assert pairs[("loc", "todo")]["top10"] is None
    # Pairs use only rows that measure both.
    assert pairs[("loc", "noise")]["n"] == 6


def test_render_markdown_lists_constant_metrics_as_undefined():
    result = {"repo": "demo", "head": "abc", "strata": [emp.evaluate_stratum(_stratum(), ["loc", "complexity", "todo"])]}
    text = emp.render_markdown(result, min_n=1)
    assert "## ts · file (n=8)" in text
    assert "Constant here (correlations undefined): todo" in text
    assert "loc × complexity" in text


def test_end_to_end_on_a_small_repo(tmp_path: Path):
    (tmp_path / "a.py").write_text(
        "def busy(x):\n" + "".join(f"    if x == {i}:\n        return {i}\n" for i in range(12)) + "    return -1\n",
        encoding="utf-8",
    )
    (tmp_path / "b.py").write_text("from a import busy\n\ndef calm():\n    return busy(1)\n", encoding="utf-8")
    out = tmp_path / "out"
    emp.main(["--repo", f"demo={tmp_path}", "--out", str(out)])
    result = json.loads((out / "demo.json").read_text())
    strata = {(s["language"], s["scope"]): s for s in result["strata"]}
    assert strata[("python", "file")]["support"]["complexity"]["measured"] == 2
    # Scopes take their file's language (their paths read "<file>::<scope>").
    assert strata[("python", "function")]["n"] == 2
    assert not any(lang == "text" for lang, _ in strata)
    # Fan-in comes from the import graph: a.py has one importer.
    assert result["lenses"]["complexity"][0]["path"] == "a.py"
    assert result["lenses"]["complexity"][0]["witness"] == "busy"
    # No .git: activity is N/A and its preset says why.
    assert result["presets"]["activity"]["cohorts"]["file"]["unavailable"].startswith("No Git history")
    cases = (out / "demo.cases.md").read_text()
    assert "### complexity #1: a.py:1" in cases
