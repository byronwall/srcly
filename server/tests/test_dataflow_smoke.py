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


def test_anchor_graph_on_solid_route(monkeypatch):
    """ViewerCard's `props.viewer?.name`, both ways, through the real engine and the HTTP API."""
    monkeypatch.setenv("SRCLY_ENGINE_DEV", "1")
    registry = EngineRegistry()
    monkeypatch.setattr(dataflow_engine, "registry", registry)
    try:
        client = TestClient(app)
        file = SOLID_ROUTE / "src" / "components" / "ViewerCard.tsx"
        lines = file.read_text().splitlines()
        line = next(i for i, text in enumerate(lines, 1) if "props.viewer?.name" in text)
        column = lines[line - 1].index("props.viewer?.name") + 1
        span = {"startLine": line, "startColumn": column, "endLine": line, "endColumn": column + len("props.viewer?.name")}
        body = {"path": str(SOLID_ROUTE), "file": str(file), "span": span, "text": "props.viewer?.name", "direction": "both"}
        graph = client.post("/api/dataflow/anchor-graph", json=body).json()["graph"]
        assert graph["outcome"] == "ok" and graph["direction"] == "both"
        kinds = {node["kind"] for node in graph["nodes"]}
        assert {"anchor", "scope", "origin", "terminal"} <= kinds
        assert any(origin["label"] == "createResource(loadViewer)" for origin in graph["origins"])
        assert {node["file"] for node in graph["nodes"]} >= {"src/components/ViewerCard.tsx", "src/routes/records.tsx"}
        named = client.post("/api/dataflow/anchor-graph", json={"path": str(SOLID_ROUTE), "file": str(file), "name": "props", "line": line, "direction": "forward"}).json()
        assert named["graph"]["anchor"]["text"] == "props"
    finally:
        registry.close_all()


PYTHON_FASTAPI = ENGINE_DIR / "examples" / "python-fastapi"


def test_python_root_routes_and_anchor_graph(monkeypatch):
    """A FastAPI root through the real engine over HTTP: its handlers as routes, a body traced to the response."""
    monkeypatch.setenv("SRCLY_ENGINE_DEV", "1")
    registry = EngineRegistry()
    monkeypatch.setattr(dataflow_engine, "registry", registry)
    try:
        client = TestClient(app)
        root = str(PYTHON_FASTAPI)
        status = client.get("/api/dataflow/status", params={"path": root}).json()
        assert status["available"] and status["state"] == "idle"
        body = client.get("/api/dataflow/routes", params={"path": root}).json()
        assert body["outcome"] == "ok"
        assert [route["pathPattern"] for route in body["routes"]] == [
            "DELETE /v1/items/{item_id}", "GET /v1/items", "GET /v1/items/{item_id}", "GET /v1/settings", "POST /v1/items",
        ]
        assert body["typescript"].startswith("mypy ")
        line = next(i for i, text in enumerate((PYTHON_FASTAPI / "app/routers/items.py").read_text().splitlines(), 1) if "def create_item" in text)
        graph = client.post(
            "/api/dataflow/anchor-graph",
            json={"path": root, "file": "app/routers/items.py", "name": "body", "line": line, "direction": "forward"},
        ).json()["graph"]
        assert graph["outcome"] == "ok"
        assert graph["anchor"]["typeText"] == "ItemIn"
        assert ["return item → POST /v1/items", ["http-response"]] in [[t["label"], t["roles"]] for t in graph["terminals"]]
        typed = {node["label"]: node["typeText"] for node in graph["nodes"] if node["kind"] != "scope"}
        assert typed["body.name"] == "str" and typed["save_item(…)"] == "Item"
        refused = client.get("/api/dataflow/route-graph", params={"path": root, "route": "POST /v1/items"})
        assert refused.status_code == 404
    finally:
        registry.close_all()


SRCLY_SERVER = ENGINE_DIR.parent / "server"


def test_srcly_server_handler_body_reaches_its_reads(monkeypatch):
    """srcly's own FastAPI server: the anchor-graph handler's body, traced forward through the real engine."""
    monkeypatch.setenv("SRCLY_ENGINE_DEV", "1")
    registry = EngineRegistry()
    monkeypatch.setattr(dataflow_engine, "registry", registry)
    try:
        client = TestClient(app)
        root = str(SRCLY_SERVER)
        routes = client.get("/api/dataflow/routes", params={"path": root}).json()
        assert "POST /api/dataflow/anchor-graph" in [route["pathPattern"] for route in routes["routes"]]
        source = (SRCLY_SERVER / "app/routers/dataflow.py").read_text().splitlines()
        line = next(i for i, text in enumerate(source, 1) if text.startswith("def anchor_graph("))
        graph = client.post(
            "/api/dataflow/anchor-graph",
            json={"path": root, "file": "app/routers/dataflow.py", "name": "body", "line": line, "direction": "both"},
        ).json()["graph"]
        assert graph["origins"] and graph["origins"][0]["roles"] == ["request"]
        reads = {node["label"]: node["typeText"] for node in graph["nodes"] if node.get("elementKind") == "field-read"}
        assert reads.get("body.path") == "str"
    finally:
        registry.close_all()
