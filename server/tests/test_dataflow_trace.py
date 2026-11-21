"""``srcly trace`` / ``srcly impact`` on the engine's example projects. Skips without Node or engine/node_modules."""

import json
import os
import shutil
from argparse import Namespace
from pathlib import Path

import pytest

from app.services.dataflow import trace
from app.services.dataflow.availability import ENGINE_DIR

EXAMPLES = ENGINE_DIR / "examples"
SNAPSHOT = Path(__file__).parent / "snapshots" / "trace-save-name.md"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None or not (ENGINE_DIR / "node_modules" / "tsx").is_dir(),
    reason="needs node and `cd engine && pnpm install`",
)


@pytest.fixture(autouse=True)
def _dev_engine(monkeypatch):
    monkeypatch.setenv("SRCLY_ENGINE_DEV", "1")


def _run(capsys, target: str, command: str = "trace", **options) -> tuple[int, str, str]:
    args = Namespace(
        command=command, target=str(EXAMPLES / target), symbol=None, direction="both", format="md",
        depth=None, root=None, limit=12, effects=False, impact=False,
    )
    for key, value in options.items():
        setattr(args, key, value)
    status = trace.run(args)
    out = capsys.readouterr()
    return status, out.out, out.err


def _json(capsys, target: str, **options) -> dict:
    status, out, _ = _run(capsys, target, format="json", **options)
    assert status == 0
    return json.loads(out)


def _ends(result: dict) -> set[tuple[str, int]]:
    return {(n["elementKind"], n["line"]) for n in trace.Graph(result).ends()}


def test_ts_function_forward(capsys):
    result = _json(capsys, "value-flow-basics/src/function-body.ts", symbol="saveName", direction="forward")
    assert result["outcome"] == "ok"
    assert _ends(result) == {("external-effect", 7), ("return", 8)}
    status, text, _ = _run(capsys, "value-flow-basics/src/function-body.ts", symbol="saveName", direction="forward")
    expected = SNAPSHOT.read_text() if SNAPSHOT.is_file() else None
    if expected is None or os.environ.get("SRCLY_UPDATE_SNAPSHOTS"):
        SNAPSHOT.write_text(text)
        expected = text
    assert text == expected


def test_solid_prop_comes_from_its_bindings(capsys):
    result = _json(capsys, "solid-route/src/components/MetricCard.tsx:4:18")
    assert result["outcome"] == "ok" and result["anchor"]["text"] == "props.label"
    origins = {(n["file"], n["label"]) for n in trace.Graph(result).origins()}
    assert ("src/components/RecordSummary.tsx", '"Visible records"') in origins
    assert _ends(result) == {("render-terminal", 4)}


def test_signal_reaches_its_render(capsys):
    result = _json(capsys, "value-flow-basics/src/component-state.tsx", symbol="count")
    assert result["outcome"] == "ok" and result["anchor"]["typeText"] == "Accessor<number>"
    assert _ends(result) == {("render-terminal", 9)}
    assert any(n["label"] == "0" for n in trace.Graph(result).origins())


def test_python_handler_parameter(capsys):
    result = _json(capsys, "python-fastapi/app/routers/items.py", symbol="body")
    assert result["outcome"] == "ok"
    assert [n["label"] for n in trace.Graph(result).origins()] == ["POST /v1/items request body → body"]
    ends = {(n["file"], n["line"]) for n in trace.Graph(result).ends()}
    assert {("app/routers/items.py", 14), ("app/routers/items.py", 15)} <= ends


def test_partial_trace_names_its_stop_and_impact_claims_nothing_safe(capsys):
    result = _json(capsys, "symbol-graph/src/lib/notes.ts", symbol="toDetail")
    assert result["outcome"] == "partial"
    assert {n["reason"] for n in trace.Graph(result).stops()} == {"unproven-handoff", "framework-runtime"}
    status, text, _ = _run(capsys, "symbol-graph/src/lib/notes.ts", command="impact", symbol="toDetail")
    assert status == 0
    assert "fields read: `id`, `sourceId`, `tagsJson`, `title`" in text
    assert "- src/server/notes.ts: fetchNote:8" in text
    assert "- Safe to change (0):\n  - nothing proven safe" in text
    assert "unproven-handoff at src/lib/notes.ts:7" in text


def test_ambiguous_name_lists_candidates(capsys):
    status, out, err = _run(capsys, "value-flow-basics/src/function-body.ts", symbol="name")
    assert status == 2 and out == ""
    assert "parameter `name` line 6" in err and "parameter `name` line 12" in err


def test_effects_and_clear_failures(capsys):
    status, text, _ = _run(capsys, "symbol-graph/src/server/notes.ts", effects=True)
    assert status == 0
    assert "function `fetchNote`" in text and "throw `new Error(`No note ${id}`)`" in text
    status, out, err = _run(capsys, "python-fastapi/app/store.py", effects=True)
    assert status == 1 and out == "" and "TypeScript-only" in err
    status, _, err = _run(capsys, "value-flow-basics/README.md", symbol="x")
    assert status == 1 and "unsupported language" in err
