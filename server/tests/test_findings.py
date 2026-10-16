"""Findings: zero-config lint/type checks, labelled by tool, N/A on failure."""

from __future__ import annotations

import json
import os
import stat
import sys
import textwrap
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Node
from app.services import analysis, findings, quadrants
from app.services.findings import builtin_ts, ruff, typescript
from app.services.findings.model import Finding
from app.services.findings.runner import FindingsCache, collect, plan_tools, run_tools
from app.services.findings.tools import Tool, ToolFailed, run_process

PY_SOURCE = textwrap.dedent(
    """\
    import os


    def append(item, items=[]):
        items.append(item)
        return items


    def broken():
        return undefined_name
    """
)

TS_SOURCE = textwrap.dedent(
    """\
    // @ts-ignore
    const a: any = load();
    // @ts-expect-error -- the vendored type is wrong until v3
    const b = vendored();
    const c = user!.profile!.name;
    const d = user!.profile;
    export const e = (x: any) => x;
    """
)


def _write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def _executable(path: Path, script: str) -> Path:
    _write(path, script)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return path


def _tree(root: Path) -> dict:
    return json.loads(analysis.scan_codebase(root, verbose=False).model_dump_json(by_alias=True))


def _file(tree: dict, name: str) -> dict:
    stack = [tree]
    while stack:
        node = stack.pop()
        if node["type"] == "file" and node["name"] == name:
            return node
        stack.extend(node.get("children") or [])
    raise KeyError(name)


@pytest.fixture
def plain_repo(tmp_path: Path) -> Path:
    """No project tools: Python, TS and Markdown files, nothing configured."""
    root = (tmp_path / "plain").resolve()
    _write(root / "pkg" / "util.py", PY_SOURCE)
    _write(root / "pkg" / "clean.py", "def ok():\n    return 1\n")
    _write(root / "web" / "app.ts", TS_SOURCE)
    _write(root / "README.md", "# Plain\n")
    return root


FAKE_TSC = """#!/bin/sh
# Stands in for node_modules/.bin/tsc: one type error, then --listFiles output.
echo "src/main.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'."
echo "  The expected type comes from here."
echo "$PWD/node_modules/typescript/lib/lib.d.ts"
echo "$PWD/src/main.ts"
echo "$PWD/src/clean.ts"
exit 2
"""

FAKE_ESLINT = """#!/bin/sh
cat <<JSON
[{"filePath": "$PWD/src/main.ts", "messages": [
  {"ruleId": "no-unused-vars", "severity": 1, "message": "'x' is unused.", "line": 1, "column": 7},
  {"ruleId": "eqeqeq", "severity": 2, "message": "Expected '===' and instead saw '=='.", "line": 3, "column": 9}
 ]},
 {"filePath": "$PWD/src/clean.ts", "messages": []}]
JSON
exit 1
"""


@pytest.fixture
def tools_repo(tmp_path: Path) -> Path:
    """A TS project with its own tsc and eslint in node_modules/.bin, plus a loose script."""
    root = (tmp_path / "tools").resolve()
    _write(root / "web" / "tsconfig.json", '{\n  // comments and trailing commas are fine\n  "include": ["src"],\n}\n')
    _write(root / "web" / "eslint.config.js", "export default [];\n")
    _write(root / "web" / "src" / "main.ts", "const x = 1;\nconst y: number = 'a';\nif (x == 1) {}\n")
    _write(root / "web" / "src" / "clean.ts", "export const ok = 1;\n")
    _write(root / "web" / "scripts" / "loose.ts", "export const loose: any = 1;\n")
    _write(root / "tools" / "gen.ts", "export const gen: any = 2;\n")
    _executable(root / "web" / "node_modules" / ".bin" / "tsc", FAKE_TSC)
    _executable(root / "web" / "node_modules" / ".bin" / "eslint", FAKE_ESLINT)
    return root


# -- srcly's TS rules -----------------------------------------------------------


def test_builtin_ts_rules_flag_type_safety_escapes() -> None:
    found = builtin_ts.check_source("/x/app.ts", TS_SOURCE.encode(), "srcly-ts")
    rules = [(f.rule, f.line) for f in found]
    assert rules == [
        ("ts-ignore-without-reason", 1),
        ("explicit-any", 2),
        ("non-null-chain", 5),
        ("explicit-any", 7),
    ]
    assert all(f.severity == "warning" for f in found)
    assert "2 non-null assertions" in found[2].message


def test_builtin_ts_rules_flag_ts_nocheck() -> None:
    found = builtin_ts.check_source("/x/a.tsx", b"// @ts-nocheck\nexport const A = () => <div />;\n", "srcly-ts")
    assert [f.rule for f in found] == ["ts-nocheck"]


# -- without project tools ------------------------------------------------------


def test_plain_repo_runs_srcly_defaults(plain_repo: Path) -> None:
    tools = plan_tools(plain_repo)
    assert [(t.id, t.label, t.source) for t in tools] == [
        ("ruff", "ruff (srcly defaults)", "srcly defaults"),
        ("srcly-ts", "srcly TS rules", "srcly defaults"),
    ]
    result = run_tools(plain_repo, tools)
    assert result.status == "ok" and all(t.ok for t in result.tools)

    by_rule = {(Path(f.path).name, f.rule): f for f in result.findings}
    assert by_rule[("util.py", "F401")].severity == "warning"
    assert by_rule[("util.py", "B006")].tool == "ruff"
    assert by_rule[("util.py", "F821")].severity == "error"
    assert ("app.ts", "explicit-any") in by_rule

    tree = findings.apply_to_tree(_tree(plain_repo), result)
    util, clean, readme = _file(tree, "util.py"), _file(tree, "clean.py"), _file(tree, "README.md")
    assert util["metrics"]["finding_count"] == 3 and util["metrics"]["error_count"] == 1
    # Checked and clean is a measured zero.
    assert clean["metrics"]["finding_count"] == 0 and clean["metrics"]["error_count"] == 0
    # Nothing checks Markdown: N/A with the reason, never 0.
    assert readme["metrics"]["finding_count"] is None
    assert readme["metrics"]["na_reasons"]["finding_count"] == "No checker for .md files"
    # Folders sum their checked files; the root says which tools ran.
    assert tree["metrics"]["finding_count"] == 3 + 4
    assert tree["metrics"]["error_count"] == 1
    assert [t["label"] for t in tree["findings"]["tools"]] == ["ruff (srcly defaults)", "srcly TS rules"]
    assert tree["findings"]["status"] == "ok"
    Node.model_validate(tree)


def test_ruff_on_python_uses_srcly_defaults(plain_repo: Path) -> None:
    tool = ruff.plan(plain_repo)[0]
    assert "--isolated" in tool.command() and ",".join(ruff.SRCLY_DEFAULT_RULES) in tool.command()
    run, found = findings.tools.run(tool)
    assert run.ok and run.files and sorted(Path(f).name for f in run.files) == ["clean.py", "util.py"]
    assert {f.rule for f in found} == {"F401", "B006", "F821"}
    # srcly never leaves a ruff cache in the user's repo.
    assert not (plain_repo / ".ruff_cache").exists()


def test_ruff_uses_the_project_config(plain_repo: Path) -> None:
    _write(plain_repo / "pyproject.toml", '[project]\nname = "x"\n\n[tool.ruff.lint]\nselect = ["F821"]\n')
    tool = ruff.plan(plain_repo)[0]
    assert (tool.label, tool.source) == ("ruff (project config)", "project")
    assert "--isolated" not in tool.command()
    _run, found = findings.tools.run(tool)
    assert [f.rule for f in found] == ["F821"]


# -- with project tools ---------------------------------------------------------


@pytest.mark.skipif(sys.platform == "win32", reason="shell-script stand-ins for node tools")
def test_project_tsc_and_eslint_run_and_srcly_rules_cover_the_rest(tools_repo: Path) -> None:
    tools = plan_tools(tools_repo)
    assert [(t.id, t.source) for t in tools] == [
        ("tsc:web/tsconfig.json", "project"),
        ("eslint:web/eslint.config.js", "project"),
        ("ruff", "srcly defaults"),
        ("srcly-ts", "srcly defaults"),
    ]
    result = run_tools(tools_repo, tools)
    assert all(t.ok for t in result.tools), [t.reason for t in result.tools]

    tsc = next(f for f in result.findings if f.tool.startswith("tsc:"))
    assert (tsc.rule, tsc.line, tsc.column, tsc.severity) == ("TS2322", 2, 7, "error")
    assert tsc.message.endswith("The expected type comes from here.")
    assert tsc.path == str(tools_repo / "web" / "src" / "main.ts")

    tree = findings.apply_to_tree(_tree(tools_repo), result)
    main = _file(tree, "main.ts")["metrics"]
    # tsc: 1 error; eslint: 1 warning + 1 error.
    assert (main["finding_count"], main["error_count"]) == (3, 2)
    assert _file(tree, "clean.ts")["metrics"]["finding_count"] == 0
    # Inside the tsc project but in no tsconfig: N/A, not a clean zero.
    loose = _file(tree, "loose.ts")["metrics"]
    assert loose["finding_count"] is None
    assert loose["na_reasons"]["finding_count"] == "Not part of any checked tsconfig project"
    # Outside every project: srcly's TS rules check it.
    gen = _file(tree, "gen.ts")["metrics"]
    assert gen["finding_count"] == 1
    srcly_ts = next(t for t in result.tools if t.id == "srcly-ts")
    assert srcly_ts.files == [str(tools_repo / "tools" / "gen.ts")]


def test_portable_mode_skips_project_tools(tools_repo: Path) -> None:
    """Compare snapshots have no node_modules: both sides use only portable checkers."""
    assert [t.id for t in plan_tools(tools_repo, portable=True)] == ["ruff", "srcly-ts"]


def test_solution_tsconfig_expands_to_its_references(tmp_path: Path) -> None:
    root = tmp_path.resolve()
    _write(root / "tsconfig.json", '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }')
    _write(root / "tsconfig.app.json", '{ "include": ["src"] }')
    _write(root / "tsconfig.node.json", '{ "include": ["vite.config.ts"] }')
    assert [p.name for p in typescript.tsconfigs(root, root)] == ["tsconfig.app.json", "tsconfig.node.json"]


def test_tsc_global_config_error_is_a_failure() -> None:
    _findings, files, errors = typescript.parse_tsc("error TS5058: The specified path does not exist: 'nope'.\n", Path("/x"), "tsc")
    assert files == [] and errors == ["TS5058: The specified path does not exist: 'nope'."]


# -- failures: never zero -------------------------------------------------------


class _SlowTool(Tool):
    def __init__(self, root: Path, timeout: float) -> None:
        super().__init__(id="slow", tool="slow", label="slow-lint", source="project", root=root, extensions=(".py",), timeout=timeout)

    def check(self):
        run_process([sys.executable, "-c", "import time; time.sleep(30)"], self.root, self.timeout)
        return [], None


class _CrashTool(Tool):
    def __init__(self, root: Path) -> None:
        super().__init__(id="crash", tool="crash", label="crash-lint", source="project", root=root, extensions=(".py",))

    def check(self):
        raise RuntimeError("segfault in plugin")


class _ExitTool(Tool):
    def __init__(self, root: Path) -> None:
        super().__init__(id="exit", tool="exit", label="exit-lint", source="project", root=root, extensions=(".py",))

    def check(self):
        out = run_process([sys.executable, "-c", "import sys; sys.stderr.write('config is broken\\n'); sys.exit(3)"], self.root, 10)
        if out.returncode:
            raise ToolFailed(out.stderr.strip())
        return [], None


def test_a_timed_out_tool_is_na_not_zero(plain_repo: Path) -> None:
    started = time.monotonic()
    result = run_tools(plain_repo, [_SlowTool(plain_repo, timeout=0.5)])
    assert time.monotonic() - started < 10, "the tool's process must be killed at the timeout"
    run = result.tools[0]
    assert (run.status, run.reason) == ("na", "slow-lint timed out after 0.5s")
    tree = findings.apply_to_tree(_tree(plain_repo), result)
    util = _file(tree, "util.py")["metrics"]
    assert util["finding_count"] is None and util["error_count"] is None
    assert util["na_reasons"]["finding_count"] == "slow-lint timed out after 0.5s"
    assert tree["metrics"]["finding_count"] is None


def test_a_crashing_tool_is_na_and_others_still_count(plain_repo: Path) -> None:
    result = run_tools(plain_repo, [_CrashTool(plain_repo), _ExitTool(plain_repo), *ruff.plan(plain_repo)])
    crash, exited, ruff_run = result.tools
    assert crash.reason == "crash-lint crashed: RuntimeError: segfault in plugin"
    assert exited.reason == "exit-lint failed: config is broken"
    assert ruff_run.ok and ruff_run.finding_count == 3
    tree = findings.apply_to_tree(_tree(plain_repo), result)
    # One failed checker on a file makes its count unknown, so N/A.
    assert _file(tree, "util.py")["metrics"]["finding_count"] is None
    assert tree["findings"]["tools"][0]["status"] == "na"


def test_missing_ruff_is_na(plain_repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ruff, "ruff_bin", lambda: None)
    result = run_tools(plain_repo, ruff.plan(plain_repo))
    assert result.tools[0].reason == "ruff failed: ruff is not installed"
    tree = findings.apply_to_tree(_tree(plain_repo), result)
    assert _file(tree, "util.py")["metrics"]["finding_count"] is None


def test_running_checks_leave_files_na() -> None:
    tree = {"type": "folder", "path": "/r", "metrics": {}, "children": [{"type": "file", "path": "/r/a.py", "metrics": {}}]}
    findings.apply_to_tree(tree, findings.FindingsResult(root="/r", status="running"))
    assert tree["children"][0]["metrics"]["na_reasons"]["finding_count"] == "Checks are still running"
    assert tree["findings"]["status"] == "running"


# -- caching --------------------------------------------------------------------


class _CountingTool(Tool):
    calls = 0

    def __init__(self, root: Path, fail: bool = False) -> None:
        super().__init__(id="count", tool="count", label="count-lint", source="project", root=root, extensions=(".py",))
        self.fail = fail

    def check(self):
        type(self).calls += 1
        if self.fail:
            raise ToolFailed("flaky")
        return [Finding(str(self.root / "pkg" / "util.py"), 1, 1, 1, "X1", "x", "warning", self.id)], None


def test_results_are_cached_by_fingerprint_but_failures_are_not(plain_repo: Path, tmp_path: Path) -> None:
    store = FindingsCache(tmp_path / "cache")
    _CountingTool.calls = 0
    first = collect(plain_repo, fingerprint="fp1", tools=[_CountingTool(plain_repo)], cache=store)
    again = collect(plain_repo, fingerprint="fp1", tools=[_CountingTool(plain_repo)], cache=store)
    assert _CountingTool.calls == 1 and again.findings == first.findings
    store.clear_memory()
    from_disk = collect(plain_repo, fingerprint="fp1", tools=[_CountingTool(plain_repo)], cache=store)
    assert _CountingTool.calls == 1 and from_disk.as_dict() == first.as_dict()
    collect(plain_repo, fingerprint="fp2", tools=[_CountingTool(plain_repo)], cache=store)
    assert _CountingTool.calls == 2

    collect(plain_repo, fingerprint="fp3", tools=[_CountingTool(plain_repo, fail=True)], cache=store)
    collect(plain_repo, fingerprint="fp3", tools=[_CountingTool(plain_repo, fail=True)], cache=store)
    assert _CountingTool.calls == 4


# -- serving --------------------------------------------------------------------


def test_scan_job_serves_findings_and_the_viewer_gets_them(plain_repo: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from app.services import scan_jobs
    from app.services.findings import runner

    monkeypatch.setenv("SRCLY_CACHE_DIR", str(tmp_path / "srcly-cache"))
    monkeypatch.setattr(runner, "findings_cache", FindingsCache(tmp_path / "findings-cache"))
    findings.manager.clear()
    job = scan_jobs.manager.start(plain_repo, force=True)
    assert job.wait(60) and job.phase == "complete"
    assert job.findings_job is not None and job.findings_job.wait(60)

    tree = json.loads(job.result_json_overlaid())
    assert tree["findings"]["status"] == "ok"
    assert _file(tree, "util.py")["metrics"]["finding_count"] == 3

    client = TestClient(app)
    assert client.get(f"/api/scans/{job.id}/findings").json()["status"] == "ok"
    util = str(plain_repo / "pkg" / "util.py")
    data = client.get("/api/files/findings", params={"path": util}).json()
    assert data["status"] == "ok"
    assert [t["label"] for t in data["tools"]] == ["ruff (srcly defaults)"]
    assert [(f["rule"], f["line"]) for f in data["findings"]] == [("F401", 1), ("B006", 4), ("F821", 10)]
    markers = client.get("/api/files/markers", params={"path": util}).json()["markers"]
    assert [m["line"] for m in markers["finding_count"]] == [1, 4, 10]
    assert markers["error_count"] == [{"line": 10, "end_line": 10, "note": "ruff F821: Undefined name `undefined_name`"}]
    readme = client.get("/api/files/findings", params={"path": str(plain_repo / "README.md")}).json()
    assert (readme["status"], readme["reason"]) == ("na", "No checker for .md files")


def test_findings_preset_says_when_checks_are_missing() -> None:
    root = Node.model_validate(
        {"name": "r", "type": "folder", "path": "/r", "metrics": {}, "findings": {"status": "na", "reason": "ruff is not installed"}}
    )
    result = quadrants.build_quadrants(root, "findings")
    assert result["unavailable"] == "No checks: ruff is not installed"
    assert [q["name"] for q in result["quadrants"]] == ["Flagged tangle", "Clean but complex", "Quick cleanup", "Clean"]


def test_report_lists_the_checks_that_ran(plain_repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import reporting
    from app.services.findings import runner

    monkeypatch.setattr(runner, "findings_cache", FindingsCache(tmp_path / "findings-cache"))
    payload = reporting.build_report_payload(plain_repo, metric="finding_count", verbose=False)
    ranked = payload["hotspots"]["rankings"]
    assert [(Path(r["path"]).name, r["value"]) for r in ranked[:3]] == [("app.ts", 4), ("util.py", 3), ("clean.py", 0)]
    assert payload["manifest"]["checks"]["status"] == "ok"
    line = reporting._checks_line(payload["manifest"]["checks"])
    assert line.startswith("- Lint/type checks: ruff (srcly defaults): 3 findings, 1 errors")


def test_findings_metrics_are_in_the_catalog() -> None:
    from app.services import metric_catalog

    for metric_id in ("finding_count", "error_count"):
        spec = metric_catalog.get(metric_id)
        assert (spec.group, spec.direction, spec.scope, spec.aggregation) == ("Findings", "higher-worse", "file", "sum")
        assert spec.compare == "direction"
        assert spec.languages == ["ts", "tsx", "python", "code"]


@pytest.mark.skipif(os.name == "nt", reason="process groups")
def test_run_process_kills_the_whole_group(tmp_path: Path) -> None:
    marker = tmp_path / "child-alive"
    child = _write(tmp_path / "child.py", f"import time\ntime.sleep(2)\nopen({str(marker)!r}, 'w').close()\n")
    parent = _write(
        tmp_path / "parent.py",
        f"import subprocess, sys, time\nsubprocess.Popen([sys.executable, {str(child)!r}])\ntime.sleep(30)\n",
    )
    started = time.monotonic()
    with pytest.raises(findings.tools.ToolTimeout):
        run_process([sys.executable, str(parent)], tmp_path, 0.5)
    assert time.monotonic() - started < 5
    time.sleep(2.5)
    assert not marker.exists(), "the tool's child process outlived the timeout"
