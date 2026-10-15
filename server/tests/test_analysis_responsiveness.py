"""
GET /api/analysis must not block the server while a scan runs, and
concurrent requests for the same path must share one scan.
"""

import asyncio
import json
import threading
import time
from pathlib import Path

import httpx
import pytest

from app.main import app
from app.models import Metrics, Node
from app.services import scan_jobs
from app.services.scan_jobs import ScanJobManager


class BlockingScan:
    """A scan that runs until the test releases it, counting invocations."""

    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.calls = 0

    def __call__(self, root_path, *, verbose, cancel, observer):
        self.calls += 1
        self.started.set()
        # Bounded wait so a regression fails the test instead of hanging it.
        self.release.wait(10)
        return Node(name="root", type="folder", path=str(root_path), metrics=Metrics(), children=[])


@pytest.fixture
def blocking_scan(monkeypatch) -> BlockingScan:
    fake = BlockingScan()
    monkeypatch.setattr(scan_jobs.analysis, "scan_codebase", fake)
    monkeypatch.setattr(scan_jobs, "manager", ScanJobManager())
    return fake


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://srcly.test")


def test_other_endpoints_respond_while_a_scan_runs(blocking_scan, tmp_path: Path) -> None:
    async def scenario():
        async with _client() as client:
            scan = asyncio.create_task(client.get("/api/analysis", params={"path": str(tmp_path)}))
            assert await asyncio.to_thread(blocking_scan.started.wait, 5)

            started = time.monotonic()
            status = await asyncio.wait_for(client.get("/api-status"), timeout=5)
            context = await asyncio.wait_for(client.get("/api/analysis/context"), timeout=5)
            elapsed = time.monotonic() - started
            assert not scan.done()

            blocking_scan.release.set()
            result = await asyncio.wait_for(scan, timeout=10)
            return status, context, elapsed, result

    status, context, elapsed, result = asyncio.run(scenario())

    assert status.status_code == 200
    assert context.status_code == 200
    assert elapsed < 2, f"server was blocked for {elapsed:.1f}s by the scan"
    assert result.status_code == 200
    assert result.json()["name"] == "root"


def test_concurrent_analysis_requests_share_one_scan(blocking_scan, tmp_path: Path) -> None:
    async def scenario():
        async with _client() as client:
            first = asyncio.create_task(client.get("/api/analysis", params={"path": str(tmp_path)}))
            assert await asyncio.to_thread(blocking_scan.started.wait, 5)
            second = asyncio.create_task(client.get("/api/analysis", params={"path": str(tmp_path)}))
            # The UI's job API joins the same scan as well.
            job = await client.post("/api/scans", json={"path": str(tmp_path)})
            await asyncio.sleep(0.2)
            blocking_scan.release.set()
            return await asyncio.gather(first, second), job

    (first, second), job = asyncio.run(scenario())

    assert blocking_scan.calls == 1
    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert job.json()["path"] == str(tmp_path.resolve())


def test_result_is_encoded_off_the_event_loop(blocking_scan, monkeypatch, tmp_path: Path) -> None:
    encoded_on: list[str] = []
    real_serialize = scan_jobs.serialize_tree

    def recording_serialize(tree):
        encoded_on.append(threading.current_thread().name)
        return real_serialize(tree)

    monkeypatch.setattr(scan_jobs, "serialize_tree", recording_serialize)
    blocking_scan.release.set()

    async def scenario():
        loop_thread = threading.current_thread().name
        async with _client() as client:
            response = await client.get("/api/analysis", params={"path": str(tmp_path)})
        return loop_thread, response

    loop_thread, response = asyncio.run(scenario())

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert encoded_on and all(name != loop_thread for name in encoded_on)


def test_result_json_round_trips_without_defaults(tmp_path: Path) -> None:
    child = Node(name="a.py", type="file", path=str(tmp_path / "a.py"), metrics=Metrics(loc=3))
    tree = Node(name="root", type="folder", path=str(tmp_path), metrics=Metrics(), children=[child])
    job = scan_jobs.ScanJob(root_path=tmp_path)
    job.result = tree

    encoded = job.result_json()

    assert scan_jobs.expand_tree(encoded) == tree
    raw = json.loads(encoded)
    # Defaults and derivable child paths are left out; the root keeps its path.
    assert raw["path"] == str(tmp_path)
    assert raw["metrics"] == {}
    assert "start_line" not in raw
    assert raw["children"][0] == {"name": "a.py", "type": "file", "metrics": {"loc": 3}}
    # Encoded once and reused.
    assert job.result_json() is encoded
