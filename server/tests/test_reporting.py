import json
from pathlib import Path

import pytest

from app.models import Metrics, Node
from app.run import main
from app.services import metric_catalog, reporting


def _sample_tree(root_path: Path) -> Node:
    function = Node(
        name="Dashboard",
        type="function",
        kind="function",
        path=str(root_path / "client/src/Dashboard.tsx") + "::Dashboard",
        start_line=10,
        end_line=80,
        metrics=Metrics(
            loc=70,
            complexity=12,
            component_jsx_conditional_count=7,
            component_prop_count=18,
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
            component_jsx_conditional_count=7,
            component_prop_count=18,
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
    assert captured.out.startswith("1. 10 CCN client/src/Dashboard.tsx")


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


def _file(root: Path, name: str, **metrics) -> Node:
    return Node(name=name, type="file", path=str(root / name), metrics=Metrics(file_count=1, **metrics))


def _tree(root: Path, *files: Node) -> Node:
    return Node(name="root", type="folder", path=str(root), metrics=Metrics(), children=list(files))


def _score(ranked: list[dict], name: str) -> float:
    return next(item["raw_score"] for item in ranked if item["name"] == name)


def test_measured_zero_stays_in_the_denominator(tmp_path: Path) -> None:
    # Same complexity; `lean` is measured clean on everything else, `busy` is
    # not. A zero is evidence, so `lean` must not outrank `busy`.
    lean = _file(tmp_path, "lean.py", loc=0, complexity=10, max_nesting_depth=0, todo_count=0, parameter_count=0)
    busy = _file(tmp_path, "busy.py", loc=50, complexity=10, max_nesting_depth=3, todo_count=1, parameter_count=2)
    ranked = reporting.rank_nodes(_tree(tmp_path, lean, busy), profile="general")
    assert _score(ranked, "busy.py") > _score(ranked, "lean.py")
    assert _score(ranked, "lean.py") < 1.0


def test_na_metrics_drop_out_of_the_score(tmp_path: Path) -> None:
    # Markdown has no complexity: N/A must not count as a 0 against it.
    doc = _file(tmp_path, "notes.md", loc=100, md_data_url_count=0)
    ranked = reporting.rank_nodes(_tree(tmp_path, doc, _file(tmp_path, "a.py", loc=100, complexity=3)), profile="docs")
    weights = reporting.PROFILE_WEIGHTS["docs"]
    # Only loc (at the max, 1.0) and md_data_url_count (a measured 0) count.
    expected = weights["loc"] / (weights["loc"] + weights["md_data_url_count"])
    assert _score(ranked, "notes.md") == pytest.approx(expected, abs=1e-4)
    item = next(i for i in ranked if i["name"] == "notes.md")
    assert "complexity" not in item["metrics"]


def test_raising_one_input_never_lowers_the_score(tmp_path: Path) -> None:
    import random

    rng = random.Random(7)
    metrics = list(reporting.PROFILE_WEIGHTS["general"].keys())
    for trial in range(200):
        peers = [
            _file(tmp_path, f"p{i}.ts", **{m: rng.choice([0, rng.randint(0, 40)]) for m in metrics})
            for i in range(5)
        ]
        target_values = {m: rng.choice([0, rng.randint(0, 40)]) for m in metrics}
        bumped_metric = rng.choice(metrics)
        bumped_values = dict(target_values, **{bumped_metric: target_values[bumped_metric] + rng.randint(1, 60)})

        before = reporting.rank_nodes(_tree(tmp_path, *peers, _file(tmp_path, "t.ts", **target_values)))
        after = reporting.rank_nodes(_tree(tmp_path, *peers, _file(tmp_path, "t.ts", **bumped_values)))
        assert _score(after, "t.ts") >= _score(before, "t.ts"), (trial, bumped_metric)


def test_rank_nodes_ranks_one_cohort(tmp_path: Path) -> None:
    tree = _sample_tree(tmp_path)
    body = Node(name="(body)", type="function_body", path="x::(body)", metrics=Metrics(loc=5))
    jsx = Node(name="<div>", type="function", kind="jsx", path="x::<div>", metrics=Metrics(loc=5, complexity=40))
    tree.children[0].children[0].children[0].children = [jsx, body]

    files = reporting.rank_nodes(tree, profile="general", cohort="file")
    functions = reporting.rank_nodes(tree, profile="general", cohort="function")

    assert {item["node_type"] for item in files} == {"file"}
    assert [item["name"] for item in functions] == ["Dashboard"]


def test_report_names_the_complexity_witness(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.models import Witness

    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    file_node = tree.children[0].children[0]
    file_node.metrics.complexity = 12
    file_node.metrics.complexity_witness = Witness(path=file_node.children[0].path, name="Dashboard", start_line=10, end_line=80)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    payload = reporting.build_report_payload(root, profile="general", limit=5, verbose=False)

    finding = payload["findings"]["findings"][0]
    assert finding["complexity_witness"]["name"] == "Dashboard"
    assert "complexity=12 in `Dashboard` (line 10)" in payload["report_markdown"]
    assert payload["hotspots"]["function_rankings"][0]["name"] == "Dashboard"


def test_profiles_weight_only_risk_metrics() -> None:
    directions = {m.id: m.direction for m in metric_catalog.METRICS}
    for profile, weights in reporting.PROFILE_WEIGHTS.items():
        for metric in weights:
            assert directions.get(metric) == "higher-worse", (profile, metric)
    for cut in ("comment_density", "tsx_hardcoded_string_volume", "tsx_duplicated_string_count", "todo_count"):
        assert all(cut not in w for w in reporting.PROFILE_WEIGHTS.values())
    assert "comment_density" not in directions


def _cohort_tree(values: dict[str, float | None]) -> Node:
    files = [
        Node(name=name, type="file", path=f"/r/{name}", metrics=Metrics(complexity=value))
        for name, value in values.items()
    ]
    return Node(name="r", type="folder", path="/r", metrics=Metrics(), children=files)


def test_rank_by_metric_ranks_worst_first_with_zero_and_na_apart() -> None:
    tree = _cohort_tree({"b.py": 4, "a.py": 4, "zero.py": 0, "big.py": 9, "doc.md": None})

    result = reporting.rank_by_metric(tree, "complexity")

    # Ties go to the path; a measured 0 ranks last; N/A is only counted.
    assert [item["name"] for item in result["ranked"]] == ["big.py", "a.py", "b.py", "zero.py"]
    assert result["na_count"] == 1
    assert result["ranked"][0]["score"] == 1.0
    assert result["ranked"][0]["unit"] == "CCN"


def test_rank_by_metric_uses_the_singular_unit_and_names_witnesses(tmp_path: Path) -> None:
    from app.models import Witness

    tree = _sample_tree(tmp_path)
    file_node = tree.children[0].children[0]
    file_node.metrics.witnesses = {"component_prop_count": Witness(path="x", name="Dashboard", start_line=10, end_line=80)}
    file_node.metrics.component_prop_count = 1

    item = reporting.rank_by_metric(tree, "component_prop_count", root_path=tmp_path)["ranked"][0]

    assert (item["value"], item["unit"]) == (1, "prop")
    assert item["witness"]["name"] == "Dashboard"
    assert item["path"] == "client/src/Dashboard.tsx"


def test_rank_by_metric_refuses_neutral_detail() -> None:
    with pytest.raises(ValueError):
        reporting.rank_by_metric(_cohort_tree({"a.py": 1}), "todo_count")


def test_report_tables_rank_by_one_metric(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    tree = _sample_tree(root)
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    payload = reporting.build_report_payload(root, metric="component_prop_count", limit=5, verbose=False)

    assert payload["hotspots"]["metric"] == "component_prop_count"
    assert payload["hotspots"]["rankings"][0]["value"] == 18
    assert "## Top Files by Props" in payload["report_markdown"]
    assert "| 1 | `client/src/Dashboard.tsx` | 18 props |" in payload["report_markdown"]


def test_report_defaults_to_the_profile_lead_metric(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: _sample_tree(root))

    assert reporting.build_report_payload(root, verbose=False)["hotspots"]["metric"] == "complexity"
    assert reporting.build_report_payload(root, profile="frontend", verbose=False)["hotspots"]["metric"] == "component_loc"
