import json
import subprocess
from pathlib import Path

import pytest

from app.models import Metrics, Node, Witness
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
    assert captured.out.startswith("# srcly explain client/src/Dashboard.tsx (file)")
    assert "| `::Dashboard` | 10–80 | 12 |" in captured.out


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
    assert "`client/src/Dashboard.tsx:10 Dashboard`" in payload["report_markdown"]
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


def test_cli_report_stdout_stays_json_when_cache_writes_fail(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # A file where the cache directory should be makes every cache write fail.
    blocked = tmp_path / "not-a-dir"
    blocked.write_text("", encoding="utf-8")
    monkeypatch.setenv("SRCLY_CACHE_DIR", str(blocked / "analysis"))
    root = tmp_path / "repo"
    root.mkdir()
    (root / "a.py").write_text("def f(x):\n    return x if x else 0\n", encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "."], cwd=root, check=True)
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"], cwd=root, check=True
    )

    main(["report", str(root), "--stdout"])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload["manifest"]
    assert "Could not cache Git activity" in captured.err
    assert "Could not cache findings" in captured.err


def test_cli_explain_file_resolves_against_the_analyzed_path_not_the_cwd(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "repo"
    file_path = root / "client/src/Dashboard.tsx"
    file_path.parent.mkdir(parents=True)
    file_path.write_text("export function Dashboard() { return null }\n", encoding="utf-8")
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    tree = _sample_tree(root.resolve())
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    main(["explain", str(root), "--file", "client/src/Dashboard.tsx", "--format", "json"])

    assert json.loads(capsys.readouterr().out)["scope"] == "client/src/Dashboard.tsx"
    with pytest.raises(SystemExit, match="outside the analyzed path"):
        main(["explain", str(root), "--file", "../elsewhere/x.py"])


@pytest.mark.parametrize("command", [["report", "--limit"], ["hotspots", "--limit"], ["report", "--tree-top"]])
@pytest.mark.parametrize("value", ["0", "-3"])
def test_cli_rejects_zero_and_negative_limits(tmp_path: Path, command: list[str], value: str) -> None:
    with pytest.raises(SystemExit) as exc:
        main([command[0], str(tmp_path), command[1], value])
    assert exc.value.code == 2


def _audit_tree(root: Path) -> Node:
    """Code under src/, a long doc at the root, and a snapshot fixture: only src/ is a refactor target."""

    def file(rel: str, **metrics) -> Node:
        return Node(name=rel.rsplit("/", 1)[-1], type="file", path=str(root / rel), metrics=Metrics(file_count=1, **metrics))

    def folder(rel: str, *children: Node) -> Node:
        return Node(name=rel, type="folder", path=str(root / rel), metrics=Metrics(), children=list(children))

    fn = Node(
        name="parse", type="function", kind="function", path=str(root / "src/core/parse.py") + "::parse",
        start_line=10, end_line=90, metrics=Metrics(complexity=30, loc=80),
    )
    parse = file("src/core/parse.py", complexity=30, loc=300)
    parse.metrics.complexity_witness = Witness(path=fn.path, name="parse", start_line=10, end_line=90)
    parse.children = [fn]
    return Node(
        name="root", type="folder", path=str(root), metrics=Metrics(),
        children=[
            file("README.md", loc=900),
            folder("src", folder("src/core", parse), file("src/app.py", complexity=4, loc=60)),
            folder("tests", folder("tests/__snapshots__", file("tests/__snapshots__/golden.snap", loc=2000))),
        ],
    )


def test_report_ranks_code_and_names_what_it_left_out(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path.resolve()
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: _audit_tree(root))

    payload = reporting.build_report_payload(root, verbose=False)

    assert [f["path"] for f in payload["findings"]["findings"]] == ["src/core/parse.py", "src/app.py"]
    report = payload["report_markdown"]
    assert "docs 1 (mostly .md document; top `README.md`)" in report
    assert "fixture 1 (mostly test snapshot (.snap); top `tests/__snapshots__/golden.snap`)" in report
    # The folder ranks by its worst file, so src/ leads the tree instead of the root README.
    assert payload["tree_summary"]["children"][0]["path"] == "src"
    assert "| `src/` | 2 |" in report


def test_explain_drills_from_folder_to_symbol(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    root = tmp_path.resolve()
    (root / "src/core").mkdir(parents=True)
    (root / "src/core/parse.py").write_text("def parse(): pass\n", encoding="utf-8")
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: _audit_tree(root))

    main(["explain", str(root), "--format", "json"])
    repo = json.loads(capsys.readouterr().out)
    assert repo["folders"][0]["path"] == "src"
    assert repo["folders"][0]["worst"]["start_at"] == "src/core/parse.py:10 parse"
    assert {row["class"] for row in repo["left_out"]} == {"docs", "fixture"}

    main(["explain", str(root), "--at", "src/core/parse.py::parse", "--format", "json"])
    symbol = json.loads(capsys.readouterr().out)
    assert (symbol["kind"], symbol["lines"]) == ("symbol", [10, 90])
    assert symbol["metrics"]["values"]["complexity"] == 30


def test_scan_tree_reuses_the_cached_analysis_until_files_change(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import analysis

    root = tmp_path / "repo"
    root.mkdir()
    (root / "a.py").write_text("def f():\n    return 1\n", encoding="utf-8")
    real_scan = analysis.scan_codebase
    scans: list[Path] = []
    monkeypatch.setattr(analysis, "scan_codebase", lambda path, **kw: scans.append(path) or real_scan(path, **kw))

    assert reporting.scan_tree(root)._analysis.reused is False
    assert reporting.scan_tree(root)._analysis.reused is True
    assert len(scans) == 1
    (root / "b.py").write_text("x = 1\n", encoding="utf-8")
    assert reporting.scan_tree(root)._analysis.reused is False
    assert len(scans) == 2


def test_scores_normalize_over_ranked_classes_and_unranked_files_show_no_score(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    root = tmp_path.resolve()
    (root / "README.md").write_text("# x\n", encoding="utf-8")
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: _audit_tree(root))

    # The 2,000-line snapshot no longer sets the LOC maximum, so the worst code file scores 1.0.
    ranked = reporting.rank_nodes(_audit_tree(root), root_path=root, classes=("code",))
    assert next(i for i in ranked if i["path"] == "src/core/parse.py")["score"] == 1.0

    main(["explain", str(root), "--at", "README.md"])
    assert "not ranked (docs files are left out of the queue)" in capsys.readouterr().out


def test_explain_finds_a_method_by_its_bare_name(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    root = tmp_path.resolve()
    (root / "src/core").mkdir(parents=True)
    (root / "src/core/parse.py").write_text("class Parser: pass\n", encoding="utf-8")
    tree = _audit_tree(root)
    parse_file = tree.children[1].children[0].children[0]
    method = parse_file.children[0]
    method.path = str(root / "src/core/parse.py") + "::(class) Parser::parse"
    parse_file.children = [
        Node(name="(class) Parser", type="function", kind="class", path=str(root / "src/core/parse.py") + "::(class) Parser",
             start_line=5, end_line=95, metrics=Metrics(complexity=30), children=[method])
    ]
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    main(["explain", str(root), "--at", "src/core/parse.py::parse", "--format", "json"])
    assert json.loads(capsys.readouterr().out)["scope"] == "src/core/parse.py::(class) Parser::parse"


def test_explain_tells_same_named_symbols_apart_by_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    root = tmp_path.resolve()
    (root / "src/core").mkdir(parents=True)
    (root / "src/core/parse.py").write_text("x = 1\n", encoding="utf-8")
    tree = _audit_tree(root)
    parse_file = tree.children[1].children[0].children[0]
    path = str(root / "src/core/parse.py") + "::(anonymous)"
    parse_file.children = [
        Node(name="(anonymous)", type="function", kind="function", path=path, start_line=line, end_line=line + 5,
             metrics=Metrics(complexity=ccn))
        for line, ccn in ((5, 1), (50, 20))
    ]
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    main(["explain", str(root), "--at", "src/core/parse.py", "--format", "json"])
    worst = json.loads(capsys.readouterr().out)["symbols"][0]
    assert worst["at"] == "src/core/parse.py::(anonymous)@50"
    main(["explain", str(root), "--at", worst["at"], "--format", "json"])
    assert json.loads(capsys.readouterr().out)["lines"] == [50, 55]
    # The bare name is ambiguous: it names every match, worst first, instead of picking the first.
    with pytest.raises(SystemExit, match=r"matches 2 symbols; pick one \(most complex first\): `src/core/parse.py::\(anonymous\)@50`"):
        main(["explain", str(root), "--at", "src/core/parse.py::(anonymous)"])


def test_report_prints_top_findings_and_what_the_analysis_covers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.models import ActivityInfo, AnalysisInfo, FindingsInfo, FindingsTool

    root = tmp_path.resolve()
    tree = _audit_tree(root)
    tree._analysis = AnalysisInfo(reused=True, scanned_at="2026-11-04T10:00:00+00:00")
    tree.activity = ActivityInfo(window="90d", window_label="last 90 days", status="ok", head="abc1234",
                                 note="1 file has uncommitted changes, not counted")
    tree.findings = FindingsInfo(status="ok", tools=[FindingsTool(id="ruff", tool="ruff", label="ruff", source="project",
                                                                  status="ok", files_checked=1)])
    tree.children[1].children[0].children[0].metrics.finding_count = 0  # parse.py checked; app.py not
    monkeypatch.setattr(reporting, "scan_tree", lambda root_path, **kwargs: tree)

    main(["report", str(root), "--out", str(tmp_path / "out")])
    out = capsys.readouterr().out
    assert "- high 0.7647 `src/core/parse.py`: High complexity 30, 300 LOC. Start at `src/core/parse.py:10 parse`" in out
    assert (
        "Analysis: reused the scan from 2026-11-04 10:00 UTC (no file has changed since); Git history at `abc1234` "
        "(1 file has uncommitted changes, not counted); lint/type checks: ruff (1 file); 1 of 2 code files have none "
        "(finding_count N/A)."
    ) in out
    assert out.rstrip().endswith(f"Next: `srcly explain {root} --at src/core/parse.py`")
    assert json.loads((tmp_path / "out/manifest.json").read_text())["cache_used"] is True


def test_explain_symbol_shows_branch_shape_and_tests_and_takes_a_start_at_value(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("SRCLY_CACHE_DIR", str(tmp_path / "cache"))
    root = (tmp_path / "repo").resolve()
    (root / "src").mkdir(parents=True)
    (root / "tests").mkdir()
    (root / "src/route.ts").write_text(
        "export function route(m: string, p: string) {\n"
        "  if (m === 'GET' && (p === '/a' || p === '/b' || p === '/c')) return 1;\n"
        "  if (m === 'POST' && (p === '/d' || p === '/e')) return 2;\n"
        "  return 0;\n"
        "}\n",
        encoding="utf-8",
    )
    (root / "tests/route.test.ts").write_text(
        "import { route } from '../src/route';\nroute('GET', '/a');\n", encoding="utf-8"
    )

    # A pasted "start at" value with a stale line still finds the named function.
    main(["explain", str(root), "--at", "src/route.ts:3 route", "--format", "json"])
    symbol = json.loads(capsys.readouterr().out)
    assert symbol["scope"] == "src/route.ts::route"
    assert symbol["branches"]["kinds"] == {"||": 3, "&&": 2, "if": 2}
    assert symbol["tests"]["files"] == [{"path": "tests/route.test.ts", "line": 1, "lines": 2}]

    main(["explain", str(root), "--at", "src/route.ts:3 route"])
    out = capsys.readouterr().out
    assert "Most of the CCN is short-circuit and ternary operators, not nested control flow." in out
    assert "Tests that name `route` (matching lines): `tests/route.test.ts:1` (2)." in out

    main(["explain", str(root), "--at", "src/route.ts"])
    assert "Tests that import `route` (matching lines): `tests/route.test.ts:1` (1)." in capsys.readouterr().out
