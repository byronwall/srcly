import json
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Metrics, Node
from app.routers import scans as scans_router
from app.services import analysis, scan_jobs
from app.services.scan_jobs import ScanJobManager
from app.services.scan_workers import ScanCancelled


class FakeScan:
    """Stand-in for analysis.scan_codebase that the test steps through."""

    def __init__(self) -> None:
        self.release = threading.Event()
        self.started = threading.Event()
        self.fail_with: Exception | None = None

    def __call__(self, root_path, *, verbose, cancel, observer):
        observer.discovering(0, str(root_path))
        observer.analyzing(2)
        observer.file_done(1, 2, str(root_path / "a.py"), None)
        self.started.set()
        while not self.release.wait(0.01):
            cancel.raise_if_cancelled()
        cancel.raise_if_cancelled()
        if self.fail_with is not None:
            raise self.fail_with
        observer.file_done(2, 2, str(root_path / "b.py"), "timeout", "exceeded 10s")
        observer.building()
        return Node(name="root", type="folder", path=str(root_path), metrics=Metrics(), children=[])


@pytest.fixture
def fake_scan(monkeypatch) -> FakeScan:
    fake = FakeScan()
    monkeypatch.setattr(scan_jobs.analysis, "scan_codebase", fake)
    return fake


@pytest.fixture
def fresh_manager(monkeypatch) -> ScanJobManager:
    mgr = ScanJobManager()
    monkeypatch.setattr(scans_router, "manager", mgr)
    return mgr


def test_job_reports_progress_and_completes(fake_scan, tmp_path: Path) -> None:
    job = ScanJobManager().start(tmp_path)
    assert fake_scan.started.wait(5)

    mid = job.snapshot()
    assert mid["phase"] == "analyzing"
    assert (mid["files_done"], mid["files_total"]) == (1, 2)

    fake_scan.release.set()
    assert job.wait(5)

    done = job.snapshot()
    assert done["phase"] == "complete"
    assert done["files_failed"] == 1
    assert done["failures"] == [{"path": str(tmp_path.resolve() / "b.py"), "reason": "timeout", "detail": "exceeded 10s"}]
    assert job.result is not None
    assert done["version"] > mid["version"]


def test_concurrent_starts_for_same_path_share_a_job(fake_scan, tmp_path: Path) -> None:
    mgr = ScanJobManager()
    first = mgr.start(tmp_path)
    second = mgr.start(tmp_path / ".")
    assert first is second

    fake_scan.release.set()
    assert first.wait(5)
    # Once finished, a new request starts a fresh scan.
    third = mgr.start(tmp_path)
    assert third is not first
    assert third.wait(5)


def test_cancel_marks_job_cancelled(fake_scan, tmp_path: Path) -> None:
    mgr = ScanJobManager()
    job = mgr.start(tmp_path)
    assert fake_scan.started.wait(5)

    mgr.cancel(job.id)

    assert job.wait(5)
    assert job.snapshot()["phase"] == "cancelled"
    assert job.result is None


def test_scan_error_marks_job_failed(fake_scan, tmp_path: Path) -> None:
    fake_scan.fail_with = RuntimeError("disk on fire")
    fake_scan.release.set()

    job = ScanJobManager().start(tmp_path)

    assert job.wait(5)
    snapshot = job.snapshot()
    assert snapshot["phase"] == "failed"
    assert snapshot["error"] == "RuntimeError: disk on fire"


def test_manager_prunes_old_finished_jobs(fake_scan, tmp_path: Path) -> None:
    fake_scan.release.set()
    mgr = ScanJobManager(max_finished=2)
    ids = []
    for i in range(4):
        target = tmp_path / str(i)
        target.mkdir()
        job = mgr.start(target)
        assert job.wait(5)
        ids.append(job.id)
    mgr.start(tmp_path)  # pruning happens on start

    assert mgr.get(ids[0]) is None
    assert mgr.get(ids[-1]) is not None


def _read_events(response) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    event_name = None
    for line in response.iter_lines():
        if line.startswith("event: "):
            event_name = line[len("event: "):]
        elif line.startswith("data: ") and event_name:
            events.append((event_name, json.loads(line[len("data: "):])))
            if event_name in ("complete", "failed", "cancelled"):
                break
    return events


def test_sse_stream_emits_progress_then_complete(fake_scan, fresh_manager, tmp_path: Path) -> None:
    client = TestClient(app)
    started = client.post("/api/scans", json={"path": str(tmp_path)})
    assert started.status_code == 202
    job_id = started.json()["id"]
    assert fake_scan.started.wait(5)

    # The result is not available until the scan completes.
    assert client.get(f"/api/scans/{job_id}/result").status_code == 409

    threading.Timer(0.3, fake_scan.release.set).start()
    with client.stream("GET", f"/api/scans/{job_id}/events") as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        events = _read_events(response)

    names = [name for name, _ in events]
    assert names[0] == "progress"
    assert names[-1] == "complete"
    assert events[0][1]["phase"] == "analyzing"
    assert events[-1][1]["files_done"] == 2

    result = client.get(f"/api/scans/{job_id}/result")
    assert result.status_code == 200
    assert result.json()["name"] == "root"


def test_sse_stream_reports_cancellation(fake_scan, fresh_manager, tmp_path: Path) -> None:
    client = TestClient(app)
    job_id = client.post("/api/scans", json={"path": str(tmp_path)}).json()["id"]
    assert fake_scan.started.wait(5)

    threading.Timer(0.3, lambda: client.delete(f"/api/scans/{job_id}")).start()
    with client.stream("GET", f"/api/scans/{job_id}/events") as response:
        events = _read_events(response)

    assert events[-1][0] == "cancelled"


def test_scan_api_rejects_unknown_job_and_bad_path(fresh_manager, tmp_path: Path) -> None:
    client = TestClient(app)
    assert client.get("/api/scans/nope").status_code == 404
    assert client.get("/api/scans/nope/events").status_code == 404
    assert client.post("/api/scans", json={"path": str(tmp_path / "missing")}).status_code == 404


def test_real_scan_job_end_to_end(fresh_manager, tmp_path: Path) -> None:
    (tmp_path / "a.py").write_text("def f(x):\n    return x\n")
    (tmp_path / "b.ts").write_text("export const y = 1;\n")

    job = fresh_manager.start(tmp_path)

    assert job.wait(60)
    snapshot = job.snapshot()
    assert snapshot["phase"] == "complete", snapshot
    assert snapshot["files_total"] == 2
    assert snapshot["files_done"] == 2
    assert sorted(child.name for child in job.result.children) == ["a.py", "b.ts"]


def test_snapshot_lists_in_flight_files_oldest_first(tmp_path: Path) -> None:
    job = scan_jobs.ScanJob(root_path=tmp_path)
    job.analyzing(3)
    job.file_started("a.py")
    job.file_started("b.py")

    assert [item["path"] for item in job.snapshot()["in_progress"]] == ["a.py", "b.py"]

    job.file_done(1, 3, "a.py", None)
    assert [item["path"] for item in job.snapshot()["in_progress"]] == ["b.py"]
