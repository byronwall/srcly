import json
import shutil
from pathlib import Path

import pytest

from app.models import ActivityInfo, Metrics, Node
from app.run import main
from app.services import analysis, metric_catalog, quadrants, reporting

FIXTURES = Path(__file__).parent / "fixtures"


def _file(root: Path, rel: str, **metrics) -> Node:
    return Node(name=rel.rsplit("/", 1)[-1], type="file", path=str(root / rel), metrics=Metrics(**metrics))


def _tree(root: Path, *children: Node, activity: ActivityInfo | None = None) -> Node:
    return Node(name=root.name, type="folder", path=str(root), metrics=Metrics(), children=list(children), activity=activity)


# --- Assignment and cut-offs --------------------------------------------------


@pytest.mark.parametrize(
    ("x", "y", "expected"),
    [
        (10, 5, "high_both"),  # exactly at both cut-offs counts as high
        (9.99, 5, "high_y"),
        (10, 4.99, "high_x"),
        (0, 0, "low_both"),
        (100, 100, "high_both"),
    ],
)
def test_assign_quadrant_counts_the_cutoff_as_high(x: float, y: float, expected: str) -> None:
    assert quadrants.assign_quadrant(x, y, 10, 5) == expected


def test_presets_are_well_formed() -> None:
    assert [p.label for p in quadrants.PRESETS] == ["Activity", "Blast radius", "Component weight", "Comment noise"]
    for preset in quadrants.PRESETS:
        assert tuple(q.id for q in preset.quadrants) == quadrants.QUADRANT_IDS
        assert len({q.name for q in preset.quadrants}) == 4
        assert preset.cohorts and set(preset.cohorts) <= {"file", "function", "component"}
        for axis in (preset.x, preset.y):
            assert axis.derived or axis.id in metric_catalog.METRICS_BY_ID
            assert axis.cutoff > 0
            assert axis.to_json()["label"]


def test_catalog_serves_the_presets() -> None:
    payload = metric_catalog.catalog_payload()
    ids = [p["id"] for p in payload["quadrant_presets"]]
    assert ids == ["activity", "blast_radius", "component_weight", "comment_noise"]
    activity = payload["quadrant_presets"][0]
    assert activity["x"]["id"] == "complexity" and activity["x"]["cutoff"] == 10
    assert activity["y"]["id"] == "commit_count" and activity["y"]["unit"] == "commits"
    assert [q["name"] for q in activity["quadrants"]] == ["Hot mess", "Sleeping giant", "Busy, fine", "Quiet"]


def test_build_quadrants_places_files_and_counts_na(tmp_path: Path) -> None:
    tree = _tree(
        tmp_path,
        _file(tmp_path, "hot.ts", complexity=40, commit_count=12),
        _file(tmp_path, "giant.ts", complexity=30, commit_count=1),
        _file(tmp_path, "busy.ts", complexity=2, commit_count=9),
        _file(tmp_path, "quiet.ts", complexity=1, commit_count=0),  # measured zero is plotted
        _file(tmp_path, "readme.md", complexity=None, commit_count=3),  # N/A complexity
        _file(tmp_path, "new.ts", complexity=12, commit_count=None),  # N/A commits
    )
    result = quadrants.build_quadrants(tree, "activity", display_path=lambda p: Path(p).name)

    by_id = {q["id"]: q for q in result["quadrants"]}
    assert [m["path"] for m in by_id["high_both"]["members"]] == ["hot.ts"]
    assert [m["path"] for m in by_id["high_x"]["members"]] == ["giant.ts"]
    assert [m["path"] for m in by_id["high_y"]["members"]] == ["busy.ts"]
    assert [m["path"] for m in by_id["low_both"]["members"]] == ["quiet.ts"]
    assert result["na_count"] == 2
    assert result["unavailable"] == ""
    assert by_id["high_both"]["name"] == "Hot mess"


def test_moving_a_cutoff_moves_points(tmp_path: Path) -> None:
    tree = _tree(
        tmp_path,
        _file(tmp_path, "a.ts", complexity=12, commit_count=3),
        _file(tmp_path, "b.ts", complexity=8, commit_count=6),
    )
    default = quadrants.build_quadrants(tree, "activity", display_path=lambda p: Path(p).name)
    assert {q["id"]: q["count"] for q in default["quadrants"]} == {"high_both": 0, "high_x": 1, "high_y": 1, "low_both": 0}

    lowered = quadrants.build_quadrants(tree, "activity", cutoffs=(5, 2), display_path=lambda p: Path(p).name)
    assert lowered["cutoffs"] == {"x": 5, "y": 2}
    assert {q["id"]: q["count"] for q in lowered["quadrants"]}["high_both"] == 2


def test_members_sort_furthest_past_the_cutoffs_first(tmp_path: Path) -> None:
    tree = _tree(
        tmp_path,
        _file(tmp_path, "a.ts", complexity=11, commit_count=6),
        _file(tmp_path, "b.ts", complexity=50, commit_count=6),
        _file(tmp_path, "c.ts", complexity=20, commit_count=30),
    )
    result = quadrants.build_quadrants(tree, "activity", display_path=lambda p: Path(p).name)
    assert [m["path"] for m in result["quadrants"][0]["members"]] == ["c.ts", "b.ts", "a.ts"]


def test_comment_ratio_is_comments_per_code_line(tmp_path: Path) -> None:
    node = _file(tmp_path, "a.py", loc=40, comment_lines=10)
    assert quadrants.comment_ratio(node) == 0.25
    assert quadrants.comment_ratio(_file(tmp_path, "b.py", loc=0, comment_lines=3)) is None
    assert quadrants.comment_ratio(_file(tmp_path, "c.md", loc=10)) is None


def test_comment_noise_preset_plots_functions(tmp_path: Path) -> None:
    fn = Node(
        name="explain",
        type="function",
        kind="function",
        path=str(tmp_path / "a.py") + "::explain",
        start_line=3,
        end_line=30,
        metrics=Metrics(loc=20, comment_lines=12, complexity=2),
    )
    file_node = _file(tmp_path, "a.py", loc=25, comment_lines=12, complexity=2)
    file_node.children.append(fn)
    result = quadrants.build_quadrants(_tree(tmp_path, file_node), "comment_noise", cohort="function")
    narrated = next(q for q in result["quadrants"] if q["id"] == "high_x")
    assert narrated["name"] == "Narrated trivia"
    assert [m["name"] for m in narrated["members"]] == ["explain"]

    with pytest.raises(ValueError):
        quadrants.build_quadrants(_tree(tmp_path, file_node), "activity", cohort="function")


# --- Missing data says why ------------------------------------------------------


def test_activity_without_git_says_why(tmp_path: Path) -> None:
    tree = _tree(
        tmp_path,
        _file(tmp_path, "a.ts", complexity=40, commit_count=None),
        activity=ActivityInfo(window="90d", window_label="90 days", status="na", reason="Not a Git repository"),
    )
    result = quadrants.build_quadrants(tree, "activity")
    assert result["unavailable"] == "No Git history: Not a Git repository"
    assert result["na_count"] == 1


def test_component_weight_without_components_says_why(tmp_path: Path) -> None:
    tree = _tree(tmp_path, _file(tmp_path, "a.py", complexity=4))
    result = quadrants.build_quadrants(tree, "component_weight")
    assert result["unavailable"].startswith("No TSX components")


def test_blast_radius_without_import_graph_says_why(tmp_path: Path) -> None:
    tree = _tree(tmp_path, _file(tmp_path, "a.go", complexity=4))
    result = quadrants.build_quadrants(tree, "blast_radius", fan_in={})
    assert result["unavailable"].startswith("No import graph")


# --- Fan-in from the dependency graph -------------------------------------------


def test_fan_in_counts_distinct_importing_files(tmp_path: Path) -> None:
    (tmp_path / "core.ts").write_text("export const a = 1;\nexport function b() { return 2; }\n")
    (tmp_path / "one.ts").write_text("import { a, b } from './core';\nexport const x = a + b();\n")
    (tmp_path / "two.ts").write_text("import { a } from './core';\nimport { x } from './one';\nexport const y = a + x;\n")
    (tmp_path / "leaf.ts").write_text("export const z = 3;\n")

    counts = {Path(p).name: n for p, n in quadrants.fan_in_by_path(tmp_path).items()}
    # Two symbols from one file count one importer.
    assert counts == {"core.ts": 2, "one.ts": 1, "two.ts": 0, "leaf.ts": 0}


def test_blast_radius_joins_fan_in_by_absolute_path(tmp_path: Path) -> None:
    tree = _tree(
        tmp_path,
        _file(tmp_path, "core.ts", complexity=15),
        _file(tmp_path, "leaf.ts", complexity=2),
        _file(tmp_path, "styles.css", complexity=None),
    )
    fan_in = {str(tmp_path / "core.ts"): 9, str(tmp_path / "leaf.ts"): 0}
    result = quadrants.build_quadrants(tree, "blast_radius", fan_in=fan_in, display_path=lambda p: Path(p).name)
    by_id = {q["id"]: [m["path"] for m in q["members"]] for q in result["quadrants"]}
    assert by_id["high_both"] == ["core.ts"]
    assert by_id["low_both"] == ["leaf.ts"]
    assert result["na_count"] == 1


# --- Fixtures: known hot spots land where expected --------------------------------


def test_fixture_god_component_lands_by_its_cutoffs(tmp_path: Path) -> None:
    # Scanned from a copy, as in test_components: fixture folders are ignored in place.
    shutil.copytree(FIXTURES / "components", tmp_path, dirs_exist_ok=True)
    tree = analysis.scan_codebase(tmp_path, verbose=False)

    def names(result: dict, qid: str) -> list[str]:
        return [m["name"] for m in next(q for q in result["quadrants"] if q["id"] == qid)["members"]]

    # 67 lines, 11 hooks: under the 150-line default, so it's hook soup.
    default = quadrants.build_quadrants(tree, "component_weight")
    assert "OrderDashboard" in names(default, "high_y")
    assert next(q for q in default["quadrants"] if q["id"] == "high_y")["name"] == "Hook soup"
    # Drag the LOC cut-off down and it becomes the god component; the small ones stay lean.
    dragged = quadrants.build_quadrants(tree, "component_weight", cutoffs=(50, 5))
    assert names(dragged, "high_both") == ["OrderDashboard"]
    assert names(dragged, "low_both")


# --- Report ------------------------------------------------------------------------


def test_report_quadrant_writes_members_per_quadrant(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _tree(
        root,
        _file(root, "src/hot.ts", complexity=40, commit_count=12, loc=100),
        _file(root, "src/quiet.ts", complexity=1, commit_count=0, loc=10),
    )
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    out_dir = tmp_path / ".srcly"
    assert main(["report", str(root), "--out", str(out_dir), "--quadrant", "activity"]) in (None, 0)

    payload = json.loads((out_dir / "quadrants.json").read_text(encoding="utf-8"))
    hot = payload["quadrants"][0]
    assert hot["name"] == "Hot mess"
    assert hot["members"][0]["path"] == "src/hot.ts"

    report = (out_dir / "report.md").read_text(encoding="utf-8")
    assert "## Quadrants: Activity" in report
    assert "### Hot mess (1)" in report
    assert "| `src/hot.ts` | 40 | 12 |" in report
    assert "### Quiet (1)" in report

    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    assert "quadrants.json" in [a["path"] for a in manifest["artifacts"]]


def test_report_without_quadrant_writes_no_quadrants(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: _tree(root, _file(root, "a.ts", complexity=1)))
    written = reporting.write_report(root, tmp_path / ".srcly")
    assert "quadrants" not in written
