"""The real engine on engine/examples/solid-route. Skips without Node or engine/node_modules."""

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.dataflow import engine as dataflow_engine
from app.services.dataflow.availability import ENGINE_DIR
from app.services.dataflow.engine import EngineRegistry

SOLID_ROUTE = ENGINE_DIR / "examples" / "solid-route"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None or not (ENGINE_DIR / "node_modules" / "tsx").is_dir(),
    reason="needs node and `cd engine && pnpm install`",
)


def test_routes_on_solid_route(monkeypatch):
    monkeypatch.setenv("SRCLY_ENGINE_DEV", "1")
    registry = EngineRegistry()
    monkeypatch.setattr(dataflow_engine, "registry", registry)
    try:
        client = TestClient(app)
        assert client.get("/api/dataflow/status", params={"path": str(SOLID_ROUTE)}).json()["state"] == "idle"
        body = client.get("/api/dataflow/routes", params={"path": str(SOLID_ROUTE)}).json()
        assert body["outcome"] == "ok"
        assert [route["pathPattern"] for route in body["routes"]] == ["/records"]
        assert Path(body["routes"][0]["absPath"]) == SOLID_ROUTE / "src" / "routes" / "records.tsx"
        status = client.get("/api/dataflow/status", params={"path": str(SOLID_ROUTE)}).json()
        assert status["state"] == "ready" and status["generation"] == body["generation"]
        assert status["typescriptFrom"] in ("project", "bundled") and status["rssBytes"] > 0
        graph = client.get("/api/dataflow/route-graph", params={"path": str(SOLID_ROUTE), "route": "/records"}).json()["graph"]
        frame = next(node for node in graph["nodes"] if node["label"] == "RouteFrame")
        assert sorted(node["label"] for node in graph["nodes"] if node["parent"] == frame["id"]) == [
            "Show", "Solid route fixture", "ViewerCard", "props.title",
        ]
        viewer = next(o["nodeId"] for o in graph["origins"] if o["label"] == "createResource(loadViewer)")
        lit = client.get(
            "/api/dataflow/route-graph", params={"path": str(SOLID_ROUTE), "route": "/records", "source": viewer}
        ).json()["graph"]
        assert lit["selectedSource"] == viewer and lit["destinations"]
    finally:
        registry.close_all()


SRCLY_CLIENT = ENGINE_DIR.parent / "client"


@pytest.mark.skipif(not (SRCLY_CLIENT / "src" / "components" / "HotSpotItem.tsx").is_file(), reason="needs srcly's client source")
def test_value_flow_line_135(monkeypatch):
    """The M3 acceptance anchor through the real engine and the HTTP API."""
    monkeypatch.setenv("SRCLY_ENGINE_DEV", "1")
    registry = EngineRegistry()
    monkeypatch.setattr(dataflow_engine, "registry", registry)
    try:
        client = TestClient(app)
        file = SRCLY_CLIENT / "src" / "components" / "HotSpotItem.tsx"
        line = next(i for i, text in enumerate(file.read_text().splitlines(), 1) if text.strip() == "{props.node.name}")
        column = file.read_text().splitlines()[line - 1].index("props.node.name") + 1
        span = {"startLine": line, "startColumn": column, "endLine": line, "endColumn": column + len("props.node.name")}
        body = {"path": str(SRCLY_CLIENT), "file": str(file), "span": span, "text": "props.node.name"}
        picked = client.post("/api/dataflow/select", json=body).json()
        assert picked["result"]["candidates"][0]["text"] == "props.node.name"
        ledger = client.post("/api/dataflow/value-flow", json=body).json()["ledger"]
        assert ledger["outcome"] == "ok"
        assert [(row["kind"], row["label"], row["status"]) for row in ledger["rows"]] == [
            ("input", "props.node.name", "proven"),
            ("transfer", "props.node", "proven"),
            ("terminal", "props.node.name", "proven"),
        ]
        outside = client.post("/api/dataflow/value-flow", json={**body, "file": "/etc/hosts"})
        assert outside.status_code == 400
    finally:
        registry.close_all()
