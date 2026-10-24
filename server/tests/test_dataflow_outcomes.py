"""
Every op in every outcome shape, through the fake engine and the router (T5).

The fake builds its replies from the emitted JSON Schemas, so each reply is
validated against its schema here: if the fake drifts from the contract, the
test fails. The same table of shapes is written to ``tests/snapshots`` for the
client's tests, so both sides read one set of shapes.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import jsonschema
import pytest

import fake_engine
from fake_engine import OPS, RESULT_SHAPES, SHAPES, FakeEngine, example, schema_for
from snapshot_util import check_snapshot
from test_dataflow_router import FAKE, client, use_fake  # noqa: F401  (fixtures)

GRAPH_OPS = ("routeGraph", "anchorGraph", "valueFlow", "functionEffects", "routePath", "fileExports")
SPAN = {"startLine": 1, "startColumn": 42, "endLine": 1, "endColumn": 58}


def fake(root: str = "/fixture") -> FakeEngine:
    return FakeEngine(argparse.Namespace(root=root, source=f"{root}/src", protocol=1, outcome=[], stale=False))


def params_for(op: str) -> dict:
    if op == "routeGraph":
        return {"route": "/records"}
    if op == "routes" or op == "hello" or op == "status":
        return {}
    if op == "functionEffects":
        return {"file": "src/f.tsx", "line": 1}
    if op == "routePath":
        return {"route": "/records", "edge": "edge:1"}
    if op == "fileExports":
        return {"file": "src/components"}
    return {"file": "src/f.tsx", "span": SPAN, "text": "props.item.title", "direction": "forward"}


def request(client, op: str, tmp_path: Path, **extra):
    path = str(tmp_path)
    if op == "routeGraph":
        return client.get("/api/dataflow/route-graph", params={"path": path, "route": "/records", **extra})
    body = {"path": path, "file": "src/f.tsx", "span": SPAN, "text": "props.item.title", **extra}
    if op == "anchorGraph":
        return client.post("/api/dataflow/anchor-graph", json={**body, "direction": "forward"})
    if op == "functionEffects":
        return client.post("/api/dataflow/function-effects", json={"path": path, "file": "src/f.tsx", "line": 1})
    if op == "routePath":
        return client.get("/api/dataflow/route-path", params={"path": path, "route": "/records", "edge": "edge:1"})
    if op == "fileExports":
        return client.get("/api/dataflow/file-exports", params={"path": path, "file": "src"})
    return client.post("/api/dataflow/value-flow", json=body)


@pytest.mark.parametrize("op", OPS)
def test_every_base_reply_matches_its_schema(op):
    engine = fake()
    engine.state.update(built=True, generation=1)
    jsonschema.validate(engine.result_for(op, params_for(op)), schema_for(op))


@pytest.mark.parametrize("shape", RESULT_SHAPES)
@pytest.mark.parametrize("op", GRAPH_OPS)
def test_every_shape_matches_its_schema_and_names_its_outcome(op, shape):
    engine = fake()
    engine.state.update(built=True, generation=1)
    engine.outcomes[op] = shape
    result = engine.result_for(op, params_for(op))
    jsonschema.validate(result, schema_for(op))
    assert result["outcome"] == shape
    check_snapshot(f"fake-engine.{op}.{shape}.json", result)


def test_example_covers_every_schema_kind():
    """The schema example builder never invents a field and never misses a required one."""
    for op in OPS:
        schema = schema_for(op)
        instance = example(schema)
        jsonschema.validate(instance, schema)
        assert set(instance) == set(schema.get("required", []))


@pytest.mark.parametrize("shape", SHAPES)
@pytest.mark.parametrize("op", GRAPH_OPS)
def test_router_reports_each_shape_as_its_outcome(client, use_fake, tmp_path, op, shape):
    use_fake("--outcome", f"{op}={shape}")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "f.tsx").write_text("export function Card(props) { return <h2>{props.item.title}</h2>; }\n")
    response = request(client, op, tmp_path)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["outcome"] == shape
    payload = body.get("graph") or body.get("ledger") or body.get("effects") or body.get("path") or body.get("exports")
    if shape in RESULT_SHAPES:
        assert payload is not None and payload["outcome"] == shape
        jsonschema.validate(payload, schema_for(op))
    else:
        assert payload is None
    if shape == "stale":
        assert body["programHash"] == "hash-2"
    if shape == "not-analyzed":
        assert body["reason"] == "no-ts-files"
    if shape == "budget":
        assert "bound" in body["message"]


@pytest.mark.parametrize("op", GRAPH_OPS)
def test_protocol_mismatch_is_not_analyzed_for_every_op(client, use_fake, tmp_path, op):
    use_fake("--protocol", "2")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "f.tsx").write_text("export const x = 1;\n")
    body = request(client, op, tmp_path).json()
    assert body["outcome"] == "not-analyzed" and body["reason"] == "engine-protocol-mismatch"


@pytest.mark.parametrize("op", GRAPH_OPS)
def test_a_crash_mid_op_is_503_once_then_not_analyzed(client, use_fake, tmp_path, op):
    use_fake("--crash", op)
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "f.tsx").write_text("export const x = 1;\n")
    first = request(client, op, tmp_path)
    assert first.status_code == 503 and first.json()["detail"]["reason"] == "engine-crashed"
    second = request(client, op, tmp_path)
    assert second.status_code == 200 and second.json()["outcome"] == "not-analyzed" and second.json()["reason"] == "engine-crashed"


def test_fake_engine_still_runs_as_a_process():
    assert FAKE.exists() and fake_engine.main.__name__ == "main"
    assert json.loads(json.dumps(example(schema_for("hello")))) == example(schema_for("hello"))
