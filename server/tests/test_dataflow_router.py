"""``/api/dataflow/*`` against the fake engine."""

import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.dataflow import engine as dataflow_engine
from app.services.dataflow.availability import Availability, Launch
from app.services.dataflow.engine import EngineRegistry

FAKE = Path(__file__).with_name("fake_engine.py")


@pytest.fixture
def use_fake(monkeypatch):
    registries: list[EngineRegistry] = []

    def install(*flags: str, available: Availability | None = None) -> EngineRegistry:
        launch = Launch((sys.executable, str(FAKE), *flags), FAKE.parent, "test")
        found = available or Availability(True, node=sys.executable, launch=launch)
        registry = EngineRegistry(probe=lambda root: found)
        monkeypatch.setattr(dataflow_engine, "registry", registry)
        registries.append(registry)
        return registry

    yield install
    for registry in registries:
        registry.close_all()


@pytest.fixture
def client():
    return TestClient(app)


def test_status_never_spawns(client, use_fake, tmp_path):
    registry = use_fake()
    body = client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()
    assert body == {"available": True, "state": "idle", "node": sys.executable, "stale": False}
    assert registry.live_count() == 0


def test_status_names_a_reason_without_node(client, use_fake, tmp_path):
    use_fake(available=Availability(False, "node-not-found", "Node.js was not found on PATH."))
    body = client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()
    assert body["available"] is False and body["state"] == "na" and body["reason"] == "node-not-found"
    routes = client.get("/api/dataflow/routes", params={"path": str(tmp_path)}).json()
    assert routes["outcome"] == "not-analyzed" and routes["reason"] == "node-not-found" and routes["routes"] == []


def test_routes_starts_the_engine_and_lists_routes(client, use_fake, tmp_path):
    registry = use_fake()
    body = client.get("/api/dataflow/routes", params={"path": str(tmp_path)}).json()
    assert body["outcome"] == "ok" and body["generation"] == 1 and body["programHash"] == "hash-1"
    assert [route["pathPattern"] for route in body["routes"]] == ["/records"]
    assert registry.live_count() == 1
    status = client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()
    assert status["state"] == "ready" and status["generation"] == 1 and status["engine"] == "fake"


def test_start_builds_in_the_background_with_progress(client, use_fake, tmp_path):
    use_fake("--delay", "routes=0.6")
    started = client.post("/api/dataflow/start", json={"path": str(tmp_path)}).json()
    assert started["available"] is True and started["state"] in ("starting", "running")
    time.sleep(0.3)
    middle = client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()
    assert middle["state"] == "starting" and middle["progress"]["phase"] == "program"
    for _ in range(40):
        done = client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()
        if done["state"] == "ready":
            break
        time.sleep(0.05)
    assert done["state"] == "ready" and "progress" not in done


def test_stale_generation_is_an_outcome(client, use_fake, tmp_path):
    use_fake()
    client.get("/api/dataflow/routes", params={"path": str(tmp_path)})
    body = client.get("/api/dataflow/routes", params={"path": str(tmp_path), "expectedGeneration": 7}).json()
    assert body["outcome"] == "stale" and body["generation"] == 1


def test_stale_sources_show_in_status_and_refresh_rebuilds(client, use_fake, tmp_path):
    use_fake("--stale")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "f.tsx").write_text("export const x = 1;\n")
    first = client.get("/api/dataflow/routes", params={"path": str(tmp_path)}).json()
    assert first["generation"] == 1
    status = client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()
    assert status["stale"] is True and status["generation"] == 1 and status["programHash"] == "hash-next"
    # A graph fetched with the old generation is still answered; one that names it after a refresh is stale.
    refreshed = client.post("/api/dataflow/refresh", json={"path": str(tmp_path)}).json()
    assert refreshed["outcome"] == "ok" and refreshed["generation"] == 2 and refreshed["programHash"] == "hash-2"
    assert client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()["stale"] is False
    old = client.get("/api/dataflow/route-graph", params={"path": str(tmp_path), "route": "/records", "expectedGeneration": 1}).json()
    assert old["outcome"] == "stale" and old["generation"] == 2 and old["graph"] is None
    new = client.get("/api/dataflow/route-graph", params={"path": str(tmp_path), "route": "/records", "expectedGeneration": 2}).json()
    assert new["outcome"] == "ok" and new["graph"]["generation"] == 2


def test_refusals_are_not_analyzed_with_the_reason(client, use_fake, tmp_path):
    use_fake("--refuse", "non-strict-tsconfig")
    body = client.get("/api/dataflow/routes", params={"path": str(tmp_path)}).json()
    assert body == {"outcome": "not-analyzed", "reason": "non-strict-tsconfig", "message": "refused: non-strict-tsconfig", "routes": []}


def test_crash_is_503_once_then_not_analyzed(client, use_fake, tmp_path):
    use_fake("--crash", "routes")
    first = client.get("/api/dataflow/routes", params={"path": str(tmp_path)})
    assert first.status_code == 503
    assert first.json()["detail"]["reason"] == "engine-crashed"
    second = client.get("/api/dataflow/routes", params={"path": str(tmp_path)})
    assert second.status_code == 200 and second.json()["reason"] == "engine-crashed"
    status = client.get("/api/dataflow/status", params={"path": str(tmp_path)}).json()
    assert status["state"] == "na" and status["reason"] == "engine-crashed"


def test_delete_closes_the_engine(client, use_fake, tmp_path):
    registry = use_fake()
    client.get("/api/dataflow/routes", params={"path": str(tmp_path)})
    assert client.delete("/api/dataflow", params={"path": str(tmp_path)}).json() == {"closed": True}
    assert registry.live_count() == 0
    assert client.delete("/api/dataflow", params={"path": str(tmp_path)}).json() == {"closed": False}


@pytest.mark.parametrize("path, code", [(None, 400), ("relative/dir", 400), ("/no/such/srcly/path", 404)])
def test_bad_paths_are_rejected(client, use_fake, path, code):
    use_fake()
    params = {"path": path} if path else {}
    assert client.get("/api/dataflow/status", params=params).status_code == code
    assert client.get("/api/dataflow/routes", params=params).status_code == code


def test_route_graph_and_unknown_route(client, use_fake, tmp_path):
    use_fake()
    body = client.get("/api/dataflow/route-graph", params={"path": str(tmp_path), "route": "/records"}).json()
    assert body["outcome"] == "ok" and body["generation"] == 1
    assert body["graph"]["route"]["pathPattern"] == "/records" and body["graph"]["nodes"][0]["kind"] == "route"
    missing = client.get("/api/dataflow/route-graph", params={"path": str(tmp_path), "route": "/nope"})
    assert missing.status_code == 404 and missing.json()["detail"]["reason"] == "not-found"


def test_route_path_explains_an_edge_and_404s_an_unknown_one(client, use_fake, tmp_path):
    use_fake()
    client.get("/api/dataflow/routes", params={"path": str(tmp_path)})
    body = client.get("/api/dataflow/route-path", params={"path": str(tmp_path), "route": "/records", "edge": "edge:1"}).json()
    assert body["outcome"] == "ok" and body["path"]["edge"]["id"] == "edge:1"
    assert [row["kind"] for row in body["path"]["rows"]] == ["input", "terminal"]
    missing = client.get("/api/dataflow/route-path", params={"path": str(tmp_path), "route": "/records", "edge": "nope"})
    assert missing.status_code == 404


def test_file_exports_lists_a_folder_and_404s_a_missing_path(client, use_fake, tmp_path):
    use_fake()
    (tmp_path / "src" / "components").mkdir(parents=True)
    (tmp_path / "src" / "components" / "Card.tsx").write_text("export function Card() { return null; }\n")
    client.get("/api/dataflow/routes", params={"path": str(tmp_path)})
    body = client.get("/api/dataflow/file-exports", params={"path": str(tmp_path), "file": "src/components"}).json()
    assert body["outcome"] == "ok" and body["exports"]["target"]["kind"] == "folder"
    assert body["exports"]["counts"] == {"files": 2, "exports": 3, "traceable": 1}
    assert [item["name"] for item in body["exports"]["files"][0]["exports"]] == ["Card", "CardProps"]
    single = client.get("/api/dataflow/file-exports", params={"path": str(tmp_path), "file": "src/components/Card.tsx"}).json()
    assert single["exports"]["target"]["kind"] == "file" and single["exports"]["counts"]["files"] == 1
    missing = client.get("/api/dataflow/file-exports", params={"path": str(tmp_path), "file": "missing/dir"})
    assert missing.status_code == 404


def test_route_surface_is_the_backbone_before_the_graph(client, use_fake, tmp_path):
    use_fake()
    client.get("/api/dataflow/routes", params={"path": str(tmp_path)})
    surface = client.get("/api/dataflow/route-surface", params={"path": str(tmp_path), "route": "/records"}).json()
    assert surface["outcome"] == "partial" and surface["graph"]["phase"] == "surface"
    assert surface["graph"]["origins"] == [] and surface["graph"]["gaps"] == []
    graph = client.get("/api/dataflow/route-graph", params={"path": str(tmp_path), "route": "/records"}).json()["graph"]
    assert graph["phase"] == "complete"
    # The same boxes, by id, in both phases.
    assert [node["id"] for node in surface["graph"]["nodes"]] == [node["id"] for node in graph["nodes"]]
    missing = client.get("/api/dataflow/route-surface", params={"path": str(tmp_path), "route": "/nope"})
    assert missing.status_code == 404


def test_anchor_graph_by_span_and_by_name(client, use_fake, tmp_path):
    use_fake()
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "f.tsx").write_text("export function Card(props) { return <h2>{props.item.title}</h2>; }\n")
    span = {"startLine": 1, "startColumn": 42, "endLine": 1, "endColumn": 58}
    body = {"path": str(tmp_path), "file": "src/f.tsx", "span": span, "text": "props.item.title", "direction": "forward"}
    forward = client.post("/api/dataflow/anchor-graph", json=body).json()
    assert forward["outcome"] == "ok" and forward["generation"] == 1
    graph = forward["graph"]
    assert graph["direction"] == "forward" and graph["anchor"]["text"] == "props.item.title"
    assert [node["kind"] for node in graph["nodes"]] == ["scope", "anchor", "terminal"]
    assert graph["nodes"][1]["parent"] == "scope:f" and graph["edges"][0]["kind"] == "render-terminal"
    back = client.post("/api/dataflow/anchor-graph", json={**body, "direction": "backward"}).json()["graph"]
    assert back["counts"]["down"] == 0 and back["terminals"] == []
    # A declaration's own link is structural: the model accepts it beside the proof statuses.
    assert [edge["status"] for edge in back["edges"]] == ["structural"]
    named = client.post("/api/dataflow/anchor-graph", json={"path": str(tmp_path), "file": "src/f.tsx", "name": "props", "line": 1}).json()
    assert named["graph"]["anchor"]["text"] == "props" and named["graph"]["direction"] == "both"
    missing = client.post("/api/dataflow/anchor-graph", json={"path": str(tmp_path), "file": "src/f.tsx", "name": "nope", "line": 1})
    assert missing.status_code == 404 and missing.json()["detail"]["reason"] == "not-found"
    neither = client.post("/api/dataflow/anchor-graph", json={"path": str(tmp_path), "file": "src/f.tsx"})
    assert neither.status_code == 422
    outside = client.post("/api/dataflow/anchor-graph", json={**body, "file": "/etc/hosts"})
    assert outside.status_code == 400
