"""The hand-written engine-result models stay equal to the engine's emitted schemas."""

import json
from pathlib import Path

import pytest

from app.services.dataflow import models

CONTRACTS = Path(models.__file__).with_name("contracts")


@pytest.mark.parametrize(
    "op, model",
    [
        ("hello", models.HelloResult),
        ("status", models.StatusResult),
        ("routes", models.RoutesResult),
        ("routeGraph", models.RouteGraphResult),
        ("selectExpression", models.SelectExpressionResult),
        ("valueFlow", models.ValueFlowResult),
        ("anchorGraph", models.AnchorGraphResult),
        ("functionEffects", models.FunctionEffectsResult),
        ("routePath", models.RoutePathResult),
    ],
)
def test_model_fields_match_the_schema(op, model):
    schema = json.loads((CONTRACTS / f"{op}.schema.json").read_text())
    assert set(model.model_fields) == set(schema["properties"])
    assert set(schema.get("required", [])) <= set(model.model_fields)


def test_nested_route_fields_match():
    schema = json.loads((CONTRACTS / "routes.schema.json").read_text())
    route = schema["properties"]["routes"]["items"]
    assert set(models.RouteSummary.model_fields) == set(route["properties"])
    assert set(models.RouteParameter.model_fields) == set(route["properties"]["parameters"]["items"]["properties"])


def test_outcomes_match_the_engine():
    schema = json.loads((CONTRACTS / "routes.schema.json").read_text())
    assert {outcome.value for outcome in models.Outcome} == set(schema["properties"]["outcome"]["enum"])


def test_error_codes_match_the_engine():
    protocol = Path(__file__).resolve().parents[2] / "engine" / "src" / "srcly" / "protocol.ts"
    if not protocol.exists():
        pytest.skip("engine source not in this tree")
    text = protocol.read_text()
    block = text[text.index("ENGINE_ERROR_CODES = [") : text.index("] as const")]
    codes = {line.strip().strip('",') for line in block.splitlines()[1:] if line.strip()}
    assert codes == set(models.EngineErrorCode.__args__)


def test_route_graph_nested_fields_match():
    schema = json.loads((CONTRACTS / "routeGraph.schema.json").read_text())["properties"]
    assert set(models.FlowNode.model_fields) == set(schema["nodes"]["items"]["properties"])
    assert set(models.FlowEdge.model_fields) == set(schema["edges"]["items"]["properties"])
    assert set(models.RouteOrigin.model_fields) == set(schema["origins"]["items"]["properties"])
    assert set(models.RouteGraphCounts.model_fields) == set(schema["counts"]["properties"])
    assert set(models.RouteGap.model_fields) == set(schema["gaps"]["items"]["properties"])
    assert set(models.RouteLineage.model_fields) == set(schema["lineage"]["anyOf"][0]["properties"])


def test_ledger_nested_fields_match():
    schema = json.loads((CONTRACTS / "valueFlow.schema.json").read_text())["properties"]
    assert set(models.LedgerRow.model_fields) == set(schema["rows"]["items"]["properties"])
    assert set(models.LedgerBindings.model_fields) == set(schema["bindings"]["properties"])
    assert set(models.LedgerCoverage.model_fields) == set(schema["coverage"]["properties"])
    select = json.loads((CONTRACTS / "selectExpression.schema.json").read_text())["properties"]
    assert set(models.SelectCandidate.model_fields) == set(select["candidates"]["items"]["properties"])


def test_anchor_edge_status_matches_the_schema():
    schema = json.loads((CONTRACTS / "anchorGraph.schema.json").read_text())["properties"]
    status = schema["edges"]["items"]["properties"]["status"]
    values = set()
    for option in status.get("anyOf", [status]):
        values.update(option.get("enum", [option["const"]] if "const" in option else []))
    assert values == {member.value for member in models.EvidenceStatus} | {"structural"}


def test_function_effects_nested_fields_match():
    schema = json.loads((CONTRACTS / "functionEffects.schema.json").read_text())["properties"]
    wire = lambda model: {field.alias or name for name, field in model.model_fields.items()}
    assert wire(models.EffectCallable) == set(schema["callable"]["properties"])
    assert wire(models.EffectFact) == set(schema["facts"]["items"]["properties"])
    assert wire(models.EffectFrontier) == set(schema["frontiers"]["items"]["properties"])
    assert wire(models.ResultHandling) == set(schema["resultHandling"]["items"]["properties"])
    assert wire(models.EffectCounts) == set(schema["counts"]["properties"])
    # Round trip through the wire name: the engine says `async`, Python says `async_`.
    callable_ = models.EffectCallable.model_validate({"name": "f", "kind": "function", "async": True, "file": "a.ts", "absPath": "/a.ts", "line": 1, "span": {"startLine": 1, "startColumn": 1, "endLine": 1, "endColumn": 2}})
    assert callable_.async_ is True and callable_.model_dump()["async"] is True


def test_anchor_graph_nested_fields_match():
    schema = json.loads((CONTRACTS / "anchorGraph.schema.json").read_text())["properties"]
    assert set(models.AnchorRef.model_fields) == set(schema["anchor"]["properties"])
    assert set(models.AnchorNode.model_fields) == set(schema["nodes"]["items"]["properties"])
    assert set(models.AnchorEdge.model_fields) == set(schema["edges"]["items"]["properties"])
    assert set(models.AnchorOrigin.model_fields) == set(schema["origins"]["items"]["properties"])
    assert set(models.AnchorTerminal.model_fields) == set(schema["terminals"]["items"]["properties"])
    assert set(models.AnchorCounts.model_fields) == set(schema["counts"]["properties"])
    assert set(models.LedgerCoverage.model_fields) == set(schema["coverage"]["properties"])
    assert set(schema["nodes"]["items"]["properties"]["kind"]["enum"]) == set(
        models.AnchorNode.model_fields["kind"].annotation.__args__
    )
