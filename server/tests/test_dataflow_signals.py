"""Data-flow signals: the tree overlay, code viewer marks and the ``--dataflow`` report."""

from __future__ import annotations

from pathlib import Path

from app.services import reporting
from app.services.dataflow import signals
from app.services.dataflow.models import FileSignalsResult

ROOT = "/repo"


def _metrics(**values: int) -> dict:
    base = {"impossibleDefenses": 0, "relayHops": 0, "fanOut": 0, "representationChanges": 0, "pathDepth": 0}
    return {**base, **values}


def _result() -> FileSignalsResult:
    return FileSignalsResult.model_validate(
        {
            "outcome": "ok",
            "generation": 1,
            "programHash": "h",
            "tsconfig": "tsconfig.json",
            "typescript": "5.9.3",
            "nullProof": True,
            "reason": None,
            "files": [
                {"file": "src/a.tsx", "metrics": _metrics(impossibleDefenses=2, pathDepth=9, relayHops=1)},
                {"file": "src/b.ts", "metrics": _metrics(impossibleDefenses=1, pathDepth=4, relayHops=3)},
            ],
            "findings": [
                {"rule": "impossible-defense", "file": "src/a.tsx", "line": 3, "column": 5, "endLine": 3, "message": "`x ?? 1` is dead"},
                {"rule": "impossible-defense", "file": "src/a.tsx", "line": 8, "column": 5, "endLine": 8, "message": "`y ?? 2` is dead"},
                {"rule": "repeated-fork", "file": "src/a.tsx", "line": 10, "column": 3, "endLine": 14, "message": "forks on props.kind"},
                {"rule": "impossible-defense", "file": "src/b.ts", "line": 1, "column": 1, "endLine": 1, "message": "`z?.w` is dead"},
            ],
            "unplacedDefenses": 0,
            "markdown": "# Data flow\n",
        }
    )


def _tree() -> dict:
    file = lambda name: {"name": name, "type": "file", "path": f"{ROOT}/src/{name}", "metrics": {}}  # noqa: E731
    return {
        "name": "repo",
        "type": "folder",
        "path": ROOT,
        "metrics": {},
        "children": [
            {"name": "src", "type": "folder", "path": f"{ROOT}/src", "metrics": {}, "children": [file("a.tsx"), file("b.ts"), file("c.tsx"), file("d.py")]}
        ],
    }


def test_overlay_counts_sum_paths_max_and_unanalyzed_ts_is_na():
    tree = signals.apply_to_tree(_tree(), signals.Signals(ROOT, "ok", result=_result()))
    a, b, c, py = tree["children"][0]["children"]
    assert a["metrics"]["dataflow_impossible_defenses"] == 2
    assert a["metrics"]["dataflow_repeated_forks"] == 1
    assert c["metrics"]["dataflow_impossible_defenses"] is None
    assert "Not in the data-flow program" in c["metrics"]["na_reasons"]["dataflow_path_depth"]
    assert "dataflow_path_depth" not in py["metrics"]
    folder = tree["children"][0]["metrics"]
    assert folder["dataflow_impossible_defenses"] == 3
    assert folder["dataflow_repeated_forks"] == 1
    assert (folder["dataflow_path_depth"], folder["dataflow_relay_hops"]) == (9, 3)
    assert tree["dataflow"] == {"status": "ok", "reason": ""}


def test_overlay_names_why_the_engine_did_not_run():
    tree = signals.apply_to_tree(_tree(), signals.Signals(ROOT, "na", "Node.js was not found"))
    a = tree["children"][0]["children"][0]
    assert a["metrics"]["dataflow_impossible_defenses"] is None
    assert a["metrics"]["na_reasons"]["dataflow_impossible_defenses"] == "Node.js was not found"


def test_marks_match_the_counts():
    found = signals.Signals(ROOT, "ok", result=_result())
    marks = signals.markers_for(f"{ROOT}/src/a.tsx", found)
    values = found.per_file()[f"{ROOT}/src/a.tsx"]
    assert len(marks["dataflow_impossible_defenses"]) == values["dataflow_impossible_defenses"]
    assert len(marks["dataflow_repeated_forks"]) == values["dataflow_repeated_forks"]
    assert marks["dataflow_repeated_forks"][0] == {"line": 10, "end_line": 14, "note": "dataflow repeated-fork: forks on props.kind"}


def test_report_dataflow_writes_dataflow_md(tmp_path: Path, monkeypatch):
    root = tmp_path / "app"
    (root / "src").mkdir(parents=True)
    (root / "src" / "a.tsx").write_text("export const A = () => <div>{1}</div>;\n")
    asked = []

    def fake_collect(path, **_kwargs):
        asked.append(path)
        return signals.Signals(str(path), "ok", result=_result())

    monkeypatch.setattr(signals, "collect", fake_collect)
    written = reporting.write_report(root, tmp_path / "out", verbose=False, dataflow=True)
    assert written["dataflow"].read_text() == "# Data flow\n"
    report = written["report"].read_text()
    assert "## Data flow" in report and "| impossible-defense | `src/a.tsx:3` |" in report
    assert asked == [root.resolve()]

    plain = reporting.write_report(root, tmp_path / "plain", verbose=False)
    assert "dataflow" not in plain
    assert len(asked) == 1
