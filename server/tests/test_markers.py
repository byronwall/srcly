from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis_types import is_executable_scope
from app.services.markers import collect_markers
from app.services.python.python_analysis import PythonTreeSitterAnalyzer
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

TSX_SOURCE = """\
import { useEffect } from "react";
import { thing } from "./thing";

// TODO: split this up
export function Panel(props: { items: any[]; open: boolean }, extra: any) {
  useEffect(() => {}, []);
  if (props.open) {
    for (const item of props.items) {
      if (item) {
        while (item.next) {
          // @ts-ignore
          item.next = item.next.next;
        }
      }
    }
  }
  const label = props.open && extra ? "Open" : "Closed";
  return (
    <div class="panel" onClick={() => thing(label)}>
      <span>Hello</span>
      <span>Hello</span>
      {props.open && <b>{label}</b>}
    </div>
  );
}

export type Mode = "a" | "b";
"""

PY_SOURCE = """\
import os
from pathlib import Path


def walk(root, depth, *, follow=False):
    # TODO: handle symlinks
    for entry in os.scandir(root):
        if entry.is_dir() and follow:
            if depth > 0:
                with open(entry.path) as f:
                    pass
    return Path(root)
"""


def _lines(markers: dict, metric: str) -> list[int]:
    return [m["line"] for m in markers.get(metric, [])]


def test_ts_marker_counts_match_metrics(tmp_path: Path) -> None:
    path = tmp_path / "panel.tsx"
    path.write_text(TSX_SOURCE, encoding="utf-8")

    metrics = TreeSitterAnalyzer().analyze_file(str(path))
    markers = collect_markers(str(path))

    assert len(markers["ts_any_usage_count"]) == metrics.ts_any_usage_count == 2
    assert len(markers["todo_count"]) == metrics.todo_count == 1
    assert len(markers["ts_ignore_count"]) == metrics.ts_ignore_count == 1
    assert len(markers["tsx_react_use_effect_count"]) == metrics.tsx_react_use_effect_count == 1
    assert len(markers["tsx_anonymous_handler_count"]) == metrics.tsx_anonymous_handler_count == 1
    assert len(markers["tsx_prop_count"]) == metrics.tsx_prop_count
    assert len(markers["ts_export_count"]) == metrics.ts_export_count
    assert len(markers["ts_type_interface_count"]) == metrics.ts_type_interface_count
    assert len(markers["ts_import_coupling_count"]) == metrics.ts_import_coupling_count == 2
    assert len(markers["tsx_render_branching_count"]) == metrics.tsx_render_branching_count

    # Every decision point is marked once. A branch inside a JSX container or
    # object literal counts on that scope and on its enclosing function, so
    # only count display scopes that have no enclosing function.
    def extra_ccn(funcs, inside_function: bool = False) -> int:
        total = 0
        for f in funcs:
            executable = is_executable_scope(f)
            if executable or not inside_function:
                # Synthetic scopes (imports, JSX roots) start at 0, real ones at 1.
                total += max(f.cyclomatic_complexity - 1, 0)
            total += extra_ccn(f.children, inside_function or executable)
        return total

    assert len(markers["complexity"]) == extra_ccn(metrics.function_list)

    # Nesting marks start at depth 3: the `if` and the `while` inside the loop.
    assert _lines(markers, "max_nesting_depth") == [9, 10]
    assert markers["max_nesting_depth"][-1]["note"] == f"depth {metrics.max_nesting_depth}"

    # Duplicated text marks each copy with how often it repeats.
    dupes = markers["tsx_duplicated_string_count"]
    assert [m["line"] for m in dupes] == [20, 21]
    assert {m["note"] for m in dupes} == {"×2"}

    # Comments are marked across every line they cover.
    assert _lines(markers, "comment_density") == [4, 11]
    assert _lines(markers, "parameter_count")[0] == 5
    assert markers["parameter_count"][0]["note"] == "2 params"


def test_py_marker_counts_match_metrics(tmp_path: Path) -> None:
    path = tmp_path / "walk.py"
    path.write_text(PY_SOURCE, encoding="utf-8")

    metrics = PythonTreeSitterAnalyzer().analyze_file(str(path))
    markers = collect_markers(str(path))

    assert len(markers["python_import_count"]) == metrics.python_import_count == 2
    assert _lines(markers, "todo_count") == [6]
    assert _lines(markers, "max_nesting_depth") == [9, 10]
    walk = next(f for f in metrics.function_list if f.name == "walk")
    assert len(markers["complexity"]) == walk.cyclomatic_complexity - 1
    assert markers["parameter_count"][0]["note"] == "3 params"


def test_scans_do_not_collect_markers(tmp_path: Path) -> None:
    path = tmp_path / "panel.tsx"
    path.write_text(TSX_SOURCE, encoding="utf-8")
    analyzer = TreeSitterAnalyzer()
    analyzer.analyze_file(str(path))
    assert analyzer.markers is None
    assert analyzer._string_nodes == []


def test_other_languages_mark_todos(tmp_path: Path) -> None:
    path = tmp_path / "main.go"
    path.write_text("package main\n\n// TODO: tidy\nfunc main() {} // FIXME\n", encoding="utf-8")
    markers = collect_markers(str(path))
    assert markers == {
        "todo_count": [
            {"line": 3, "end_line": 3, "note": "TODO"},
            {"line": 4, "end_line": 4, "note": "FIXME"},
        ]
    }


def test_markers_endpoint(tmp_path: Path) -> None:
    path = tmp_path / "walk.py"
    path.write_text(PY_SOURCE, encoding="utf-8")
    client = TestClient(app)

    resp = client.get(f"/api/files/markers?path={path}")
    assert resp.status_code == 200
    assert _lines(resp.json()["markers"], "todo_count") == [6]

    missing = client.get(f"/api/files/markers?path={tmp_path / 'nope.py'}")
    assert missing.status_code == 404


def test_shallow_files_mark_their_deepest_blocks(tmp_path: Path) -> None:
    path = tmp_path / "shallow.ts"
    path.write_text("export function f(x: number) {\n  if (x) {\n    for (const y of [x]) {\n      void y;\n    }\n  }\n}\n", encoding="utf-8")
    markers = collect_markers(str(path))
    assert markers["max_nesting_depth"] == [{"line": 3, "end_line": 3, "note": "depth 2"}]

    flat = tmp_path / "flat.py"
    flat.write_text("def g():\n    return 1\n", encoding="utf-8")
    assert "max_nesting_depth" not in collect_markers(str(flat))
