"""``srcly compare --dataflow``: the "Data-flow changes" list, on a fixture app at two refs."""

import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.compare import dataflow_changes
from app.services.compare.git_refs import FileChange
from app.services.compare.service import build_compare, render_markdown
from app.services.dataflow import engine as dataflow_engine
from app.services.dataflow.availability import ENGINE_DIR, python_checker
from app.services.dataflow.engine import EngineRegistry

FIXTURE = ENGINE_DIR / "test" / "srcly" / "__fixtures__" / "flow-diff"

needs_engine = pytest.mark.skipif(
    shutil.which("node") is None or not (ENGINE_DIR / "node_modules" / "tsx").is_dir() or python_checker() is None,
    reason="needs node, `cd engine && pnpm install` and mypy",
)


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout


@pytest.fixture(scope="module")
def payload(tmp_path_factory) -> dict:
    """The compare payload of the fixture's base commit against its head commit, from the real engine."""
    import os

    repo = tmp_path_factory.mktemp("flow-diff") / "repo"
    patch = pytest.MonkeyPatch()
    for name in [n for n in os.environ if n.startswith("GIT_")]:
        patch.delenv(name)
    patch.setenv("SRCLY_ENGINE_DEV", "1")
    patch.setenv("SRCLY_CACHE_DIR", str(tmp_path_factory.mktemp("cache")))
    registry = EngineRegistry()
    patch.setattr(dataflow_engine, "registry", registry)
    try:
        shutil.copytree(FIXTURE / "base", repo)
        _git(repo, "init", "-q", "-b", "main")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "base")
        shutil.copytree(FIXTURE / "head", repo, dirs_exist_ok=True)
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "head")
        return build_compare(repo.resolve(), "HEAD~1", "HEAD", dataflow=True)
    finally:
        registry.close_all()
        patch.undo()


def _rows(payload: dict) -> list[tuple[str, str, str]]:
    return [(item["category"], item["scope"] or item["file"], item["key"]) for item in payload["dataflowChanges"]["changes"]]


@needs_engine
def test_fixture_change_list_is_exact_and_ordered_for_a_reviewer(payload):
    rows = _rows(payload)
    assert rows[:2] == [
        ("boundary-pair", "saveNote", "request:request.body.title -> database:db.note.update"),
        ("boundary-pair", "usageUrl", "environment:process.env.USAGE_KEY -> network:fetch"),
    ]
    assert len(rows) == 31
    for row in [
        ("origin-added", "loadRows", "network:fetch"),
        ("effect-added", "formatPrice", "write/module-write:lastPrice"),
        ("read-removed", "UserCard", "parameter:props.user.email"),
        ("status-regressed", "handleSubmit", "status"),
        ("stop-added", "handleSubmit", "unresolved-callee:track"),
        ("origin-added", "create_item", "database:connection.execute"),
        ("finding-added", "src/Dashboard.tsx", 'impossible-defense:props.settings.density ?? "comfortable"'),
        ("relay-changed", "src/Dashboard.tsx", "relayHops"),
    ]:
        assert row in rows


@needs_engine
def test_moved_function_and_renamed_local_give_no_change(payload):
    scopes = {item["scope"] for item in payload["dataflowChanges"]["changes"]}
    assert not scopes & {"slugify", "orderTotal", "shownPrice", "health"}
    # They were traced on both sides (their lines are in the diff), so this is "no change", not "not measured".
    assert not [entry for entry in payload["dataflowChanges"]["notMeasured"] if entry.get("scope") in {"slugify", "orderTotal"}]


@needs_engine
def test_python_reads_and_effects_are_not_measured_never_no_change(payload):
    missing = payload["dataflowChanges"]["notMeasured"]
    assert {"file": "api/app/main.py", "scope": None, "what": "parameter reads of its functions", "reason": "The engine records none for this language"} in missing
    assert {"file": "api/app/main.py", "scope": None, "what": "effects of its functions", "reason": "The engine records none for this language"} in missing
    text = render_markdown(payload)
    assert "### Not measured (N/A, not \"no change\")" in text
    assert "api/app/main.py: parameter reads of its functions" in text


@needs_engine
def test_markdown_names_both_sides_the_proof_and_what_the_cap_hid(payload):
    text = render_markdown(payload, limit=3)
    section = text[text.index("## Data-flow changes") :]
    assert section.count("\n- `") == 3 + 0
    total = len(payload["dataflowChanges"]["changes"])
    assert f"The cap of 3 items hid {total - 3} more changes" in section


def _scope(name: str, **fields) -> dict:
    base = {"name": name, "file": "a.ts", "line": 1, "endLine": 5, "status": "ok", "reason": None, "origins": [], "ends": [], "pairs": [], "reads": [], "effects": [], "stops": [], "untracedEnds": 0}
    return {**base, **fields}


def _item(kind: str, label: str, line: int = 2) -> dict:
    return {"key": f"{kind}:{label}", "kind": kind, "label": label, "file": "a.ts", "line": line, "status": "proven"}


def _file(*scopes: dict) -> dict:
    return {"status": "ok", "reason": "", "language": "typescript", "skipped": 0, "scopes": {scope["name"]: scope for scope in scopes}}


CHANGE = [FileChange(path="a.ts", status="modified")]


def test_equal_keys_on_other_lines_are_no_change():
    before = _file(_scope("f", ends=[_item("stdout", "console.log", 2)], line=1))
    after = _file(_scope("f", ends=[_item("stdout", "console.log", 40)], line=39))
    result = dataflow_changes.diff_sides({"a.ts": before}, {"a.ts": after}, CHANGE, with_findings=False)
    assert result["changes"] == [] and result["notMeasured"] == [] and result["scopesCompared"] == 1


def test_a_side_the_engine_could_not_read_is_not_measured():
    before = {"status": "na", "reason": "Data flow not analyzed: boom", "scopes": {}, "skipped": 0, "language": None}
    after = _file(_scope("f", ends=[_item("stdout", "console.log")]))
    result = dataflow_changes.diff_sides({"a.ts": before}, {"a.ts": after}, CHANGE, with_findings=False)
    assert result["changes"] == []
    assert result["notMeasured"] == [{"file": "a.ts", "scope": None, "what": "the base side", "reason": "Data flow not analyzed: boom"}]
    assert "No data-flow change was found in the functions that were measured." in dataflow_changes.render_markdown(result)


def test_a_function_the_base_did_not_trace_is_not_called_new():
    after = _file(_scope("f", ends=[_item("stdout", "console.log")]))
    result = dataflow_changes.diff_sides({"a.ts": _file()}, {"a.ts": after}, CHANGE, base_text=lambda path: "export function f() {}\n", with_findings=False)
    assert result["changes"] == []
    assert [entry["scope"] for entry in result["notMeasured"]] == ["f"]
    fresh = dataflow_changes.diff_sides({"a.ts": _file()}, {"a.ts": after}, CHANGE, base_text=lambda path: "export function g() {}\n", with_findings=False)
    assert [(item["category"], item["note"]) for item in fresh["changes"]] == [("end-added", "new function")]


def test_a_new_source_to_sink_pair_ranks_first_and_carries_its_proof():
    env, sink = _item("environment", "process.env.KEY"), _item("network", "fetch", 3)
    pair = {"key": f"{env['key']} -> {sink['key']}", "origin": env, "end": sink, "status": "assumed"}
    before = _file(_scope("f", reads=[_item("parameter", "props.a")]))
    after = _file(_scope("f", origins=[env], ends=[sink], pairs=[pair], status="partial", line=9))
    result = dataflow_changes.diff_sides({"a.ts": before}, {"a.ts": after}, CHANGE, with_findings=False)
    assert [item["category"] for item in result["changes"]] == ["boundary-pair", "read-removed", "status-regressed"]
    text = dataflow_changes.render_markdown(result)
    assert "a value from **environment** `process.env.KEY` now reaches **the network** `fetch` (a.ts:1 → a.ts:9, lines 2 → 3). Trace: **assumed**, not proven." in text
    assert "The trace of `f` went from proven to partial (a.ts:1 → a.ts:9)." in text
