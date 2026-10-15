"""Pure compare diff: fixture trees and graphs, no git."""

from app.services.compare.diff import METRICS_BY_NAME, diff_sides, file_edges, verdict
from app.services.compare.git_refs import FileChange


def _file(path: str, **metrics) -> dict:
    return {"name": path.rsplit("/", 1)[-1], "type": "file", "path": path, "metrics": metrics, "children": []}


def _tree(*files: dict) -> dict:
    folders: dict[str, dict] = {}
    root = {"name": "root", "type": "folder", "path": "", "metrics": {}, "children": []}
    for f in files:
        folder = f["path"].rsplit("/", 1)[0] if "/" in f["path"] else ""
        parent = root
        if folder:
            parent = folders.setdefault(
                folder, {"name": folder, "type": "folder", "path": folder, "metrics": {}, "children": []}
            )
            if parent not in root["children"]:
                root["children"].append(parent)
        parent["children"].append(f)
    return root


def _graph(files: list[str], edges: list[tuple[str, str]], symbols: dict[str, str] | None = None) -> dict:
    nodes = [{"id": "", "kind": "folder", "name": "root", "parent": None}]
    nodes += [{"id": f, "kind": "file", "name": f, "parent": ""} for f in files]
    for sid, parent in (symbols or {}).items():
        nodes.append({"id": sid, "kind": "symbol", "name": sid, "parent": parent})
    return {"root": "", "nodes": nodes, "edges": [{"source": s, "target": t} for s, t in edges]}


def test_verdict_follows_metric_direction():
    assert verdict("lower", 3, 5) == "worse"
    assert verdict("lower", 5, 3) == "better"
    assert verdict("higher", 0.1, 0.2) == "better"
    assert verdict("neutral", 10, 20) == "neutral"
    assert verdict("lower", 4, 4) == "same"
    assert verdict("lower", None, 4) == "neutral"


def test_size_metrics_are_neutral_and_comment_density_prefers_higher():
    assert METRICS_BY_NAME["loc"].direction == "neutral"
    assert METRICS_BY_NAME["complexity"].direction == "lower"
    assert METRICS_BY_NAME["comment_density"].direction == "higher"
    assert METRICS_BY_NAME["fan_out"].direction == "lower"
    assert "file_count" not in METRICS_BY_NAME


def test_file_edges_fold_symbols_into_their_file():
    graph = _graph(["a.ts", "b.ts"], [("a.ts", "b.ts#foo"), ("a.ts#x", "b.ts"), ("b.ts#foo", "b.ts")], {"b.ts#foo": "b.ts", "a.ts#x": "a.ts"})
    assert file_edges(graph) == {("a.ts", "b.ts")}


def test_diff_marks_added_removed_modified_and_renamed_files():
    base = _tree(
        _file("src/keep.py", loc=10, complexity=8),
        _file("src/gone.py", loc=5, complexity=2),
        _file("src/old_name.py", loc=7, complexity=3),
    )
    head = _tree(
        _file("src/keep.py", loc=14, complexity=4),
        _file("src/new.py", loc=20, complexity=12),
        _file("lib/new_name.py", loc=7, complexity=3),
    )
    changes = [
        FileChange("src/keep.py", "modified", additions=6, deletions=2),
        FileChange("src/gone.py", "removed", deletions=5),
        FileChange("src/new.py", "added", additions=20),
        FileChange("lib/new_name.py", "renamed", old_path="src/old_name.py"),
    ]
    payload = diff_sides(base, head, _graph([], []), _graph([], []), changes)
    by_path = {f["path"]: f for f in payload["files"]}

    keep = by_path["src/keep.py"]
    assert keep["deltas"]["complexity"] == {"before": 8, "after": 4, "delta": -4, "verdict": "better"}
    assert keep["deltas"]["loc"]["verdict"] == "neutral"

    assert by_path["src/gone.py"]["after"] is None
    assert by_path["src/new.py"]["before"] is None
    assert by_path["src/new.py"]["deltas"]["complexity"]["verdict"] == "neutral"

    renamed = by_path["lib/new_name.py"]
    assert renamed["oldPath"] == "src/old_name.py"
    assert renamed["deltas"]["complexity"]["verdict"] == "same"

    summary = payload["summary"]
    assert summary["files"] == {"added": 1, "removed": 1, "modified": 1, "renamed": 1, "total": 4}
    assert summary["lines"] == {"additions": 26, "deletions": 7}
    # Max complexity over changed files rose from 8 to 12 because of the new file.
    assert summary["metrics"]["complexity"]["before"] == 8
    assert summary["metrics"]["complexity"]["after"] == 12
    assert summary["metrics"]["complexity"]["verdict"] == "worse"
    assert summary["metrics"]["complexity"]["filesBetter"] == 1


def test_sum_metric_verdict_is_like_for_like():
    base = _tree(_file("a.py", parameter_count=6))
    head = _tree(_file("a.py", parameter_count=4), _file("b.py", parameter_count=30))
    changes = [FileChange("a.py", "modified"), FileChange("b.py", "added")]
    total = diff_sides(base, head, _graph([], []), _graph([], []), changes)["summary"]["metrics"]["parameter_count"]
    assert (total["before"], total["after"]) == (6, 34)
    # The only like-for-like file improved; the added file doesn't count against it.
    assert total["verdict"] == "better"


def test_edge_diff_follows_renames_and_flags_cross_folder_edges():
    base_graph = _graph(["src/a.ts", "src/b.ts", "src/c.ts"], [("src/a.ts", "src/b.ts"), ("src/a.ts", "src/c.ts")])
    head_graph = _graph(
        ["src/a.ts", "lib/b.ts", "src/c.ts"],
        [("src/a.ts", "lib/b.ts"), ("src/a.ts", "ext:react")],
    )
    changes = [
        FileChange("src/a.ts", "modified"),
        FileChange("lib/b.ts", "renamed", old_path="src/b.ts"),
    ]
    payload = diff_sides(_tree(), _tree(), base_graph, head_graph, changes)
    assert payload["edges"]["added"] == [
        {"source": "src/a.ts", "target": "ext:react", "external": True, "crossFolder": False}
    ]
    assert payload["edges"]["removed"] == [
        {"source": "src/a.ts", "target": "src/c.ts", "external": False, "crossFolder": False}
    ]
    a = next(f for f in payload["files"] if f["path"] == "src/a.ts")
    assert a["deltas"]["fan_out"] == {"before": 2, "after": 2, "delta": 0, "verdict": "same"}
    assert payload["summary"]["edges"]["added"] == 1
