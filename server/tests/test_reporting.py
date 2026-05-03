import json
from pathlib import Path

import pytest

from app.models import Metrics, Node
from app.run import main
from app.services import reporting


def _sample_tree(root_path: Path) -> Node:
    function = Node(
        name="Dashboard",
        type="function",
        path=str(root_path / "client/src/Dashboard.tsx") + "::Dashboard",
        start_line=10,
        end_line=80,
        metrics=Metrics(
            loc=70,
            complexity=12,
            tsx_render_branching_count=7,
            tsx_prop_count=18,
            ts_any_usage_count=2,
        ),
    )
    file_node = Node(
        name="Dashboard.tsx",
        type="file",
        path=str(root_path / "client/src/Dashboard.tsx"),
        start_line=0,
        end_line=0,
        metrics=Metrics(
            loc=140,
            complexity=10,
            function_count=1,
            file_count=1,
            file_size=4200,
            tsx_render_branching_count=7,
            tsx_prop_count=18,
            ts_any_usage_count=2,
        ),
        children=[function],
    )
    folder = Node(
        name="src",
        type="folder",
        path=str(root_path / "client/src"),
        metrics=Metrics(loc=140, complexity=12, function_count=1, file_count=1, file_size=4200),
        children=[file_node],
    )
    return Node(
        name="root",
        type="folder",
        path=str(root_path),
        metrics=Metrics(loc=140, complexity=12, function_count=1, file_count=1, file_size=4200),
        children=[folder],
    )


def test_rank_nodes_prioritizes_metric_hotspots(tmp_path: Path) -> None:
    tree = _sample_tree(tmp_path)

    ranked = reporting.rank_nodes(tree, profile="frontend")

    assert ranked
    assert ranked[0]["score"] > 0
    assert ranked[0]["drivers"]
    assert ranked[0]["rank"] == 1


def test_rank_nodes_supports_focus_and_deprioritized_paths(tmp_path: Path) -> None:
    focused = _sample_tree(tmp_path / "repo")
    docs_file = Node(
        name="SKILL.md",
        type="file",
        path=str(tmp_path / "repo/.agents/skills/SKILL.md"),
        start_line=0,
        end_line=0,
        metrics=Metrics(loc=1000, complexity=1, file_count=1, file_size=9000),
    )
    focused.children.append(
        Node(
            name=".agents",
            type="folder",
            path=str(tmp_path / "repo/.agents"),
            metrics=Metrics(loc=1000, complexity=1, file_count=1, file_size=9000),
            children=[docs_file],
        )
    )

    ranked = reporting.rank_nodes(
        focused,
        profile="general",
        root_path=tmp_path / "repo",
        focus_paths=["client/src"],
    )

    dashboard = next(item for item in ranked if item["name"] == "Dashboard.tsx")
    skill_doc = next(item for item in ranked if item["name"] == "SKILL.md")
    assert dashboard["path_priority"] == "focused"
    assert skill_doc["path_priority"] == "deprioritized"
    assert skill_doc["score"] < skill_doc["raw_score"]


def test_write_report_creates_agent_artifacts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    out_dir = tmp_path / ".srcly"
    written = reporting.write_report(root, out_dir, profile="frontend", limit=5)

    expected = {
        "manifest",
        "tree_summary",
        "hotspots",
        "findings",
        "findings_top",
        "metrics_schema",
        "report",
        "action_plan",
        "agent_skill",
    }
    assert expected == set(written)
    assert (out_dir / "report.md").exists()
    assert (out_dir / "action-plan.md").exists()
    assert (out_dir / "agent-skill.md").exists()

    findings = json.loads((out_dir / "findings.json").read_text(encoding="utf-8"))
    assert findings["findings"]
    assert findings["findings"][0]["agent_prompt"]

    compact_findings = json.loads((out_dir / "findings.top.json").read_text(encoding="utf-8"))
    assert compact_findings["findings"]

    summary = json.loads((out_dir / "tree.summary.json").read_text(encoding="utf-8"))
    assert summary["children"]
    assert summary["children"][0]["children"][0]["path"] == "client/src/Dashboard.tsx"


def test_write_report_heavy_artifacts_are_opt_in(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)
    monkeypatch.setattr(reporting, "build_dependencies", lambda root_path: {"nodes": [], "edges": []})

    out_dir = tmp_path / ".srcly"
    written = reporting.write_report(
        root,
        out_dir,
        include_tree=True,
        include_dependencies=True,
    )

    assert "tree" in written
    assert "dependencies" in written
    assert (out_dir / "tree.json").exists()
    assert (out_dir / "dependencies.json").exists()


def test_cli_scan_subcommand_writes_tree_json(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    out_path = tmp_path / "tree.json"
    main(["scan", str(root), "--out", str(out_path)])

    captured = capsys.readouterr()
    assert "Wrote Srcly tree JSON" in captured.out
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert payload["path"] == str(root)


def test_cli_scan_subcommand_can_write_tree_json_to_stdout(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    main(["scan", str(root), "--out", "-"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload["path"] == str(root)


def test_cli_report_subcommand_writes_report_artifacts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    scan_kwargs: dict[str, object] = {}

    def fake_scan_tree(root_path: Path, **kwargs) -> Node:
        scan_kwargs.update(kwargs)
        return tree

    monkeypatch.setattr(reporting, "scan_tree", fake_scan_tree)

    out_dir = tmp_path / ".srcly"
    main(["report", str(root), "--out", str(out_dir), "--profile", "frontend"])

    captured = capsys.readouterr()
    assert "Read first:" in captured.out
    assert "Wrote Srcly report artifacts" not in captured.out
    assert scan_kwargs["verbose"] is False
    assert (out_dir / "report.md").exists()
    assert (out_dir / "findings.json").exists()
    assert not (out_dir / "tree.json").exists()
    assert not (out_dir / "dependencies.json").exists()


def test_cli_report_verbose_prints_artifact_list(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    scan_kwargs: dict[str, object] = {}

    def fake_scan_tree(root_path: Path, **kwargs) -> Node:
        scan_kwargs.update(kwargs)
        return tree

    monkeypatch.setattr(reporting, "scan_tree", fake_scan_tree)

    out_dir = tmp_path / ".srcly"
    main(["report", str(root), "--out", str(out_dir), "--verbose"])

    captured = capsys.readouterr()
    assert "Wrote Srcly report artifacts" in captured.out
    assert "Read first:" not in captured.out
    assert scan_kwargs["verbose"] is True
    assert (out_dir / "findings.top.json").exists()
    assert (out_dir / "action-plan.md").exists()


def test_cli_hotspots_subcommand_prints_ranked_nodes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    main(["hotspots", str(root), "--metric", "complexity", "--limit", "1"])

    captured = capsys.readouterr()
    assert "score=" in captured.out
    assert "Dashboard" in captured.out


def test_cli_explain_subcommand_prints_file_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "repo"
    file_path = root / "client/src/Dashboard.tsx"
    file_path.parent.mkdir(parents=True)
    file_path.write_text("export function Dashboard() { return null }\n", encoding="utf-8")
    tree = _sample_tree(root)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    main(["explain", str(root), "--file", str(file_path)])

    captured = capsys.readouterr()
    assert "# Srcly Explain" in captured.out
    assert "Dashboard.tsx" in captured.out
