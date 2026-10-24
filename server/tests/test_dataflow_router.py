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
