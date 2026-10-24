"""The hand-written engine-result models stay equal to the engine's emitted schemas."""

import json
from pathlib import Path

import pytest

from app.services.dataflow import models

CONTRACTS = Path(models.__file__).with_name("contracts")


@pytest.mark.parametrize(
    "op, model",
    [("hello", models.HelloResult), ("status", models.StatusResult), ("routes", models.RoutesResult)],
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
