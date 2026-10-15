import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Metrics, Node
from app.services import cache, scan_jobs
from app.services.cache import AnalysisCache, fingerprint
from app.services.scan_jobs import ScanJobManager


def _touch(path: Path, text: str = "x = 1\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _bump_mtime(path: Path) -> None:
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    _touch(root / "a.py")
    _touch(root / "src" / "b.ts", "export const b = 1;\n")
    return root


class CountingScan:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, root_path, *, verbose, cancel, observer):
        self.calls += 1
        observer.analyzing(2)
        observer.file_done(1, 2, str(root_path / "a.py"), None)
        observer.file_done(2, 2, str(root_path / "src" / "b.ts"), "timeout", "slow")
        return Node(
            name="root",
            type="folder",
            path=str(root_path),
            metrics=Metrics(loc=self.calls),
            children=[],
        )


@pytest.fixture
def counting_scan(monkeypatch) -> CountingScan:
    fake = CountingScan()
    monkeypatch.setattr(scan_jobs.analysis, "scan_codebase", fake)
    monkeypatch.setattr(scan_jobs, "manager", ScanJobManager())
    return fake


# -- fingerprint ---------------------------------------------------------------


def test_fingerprint_is_stable_until_files_change(repo: Path) -> None:
    original = fingerprint(repo)
    assert fingerprint(repo) == original

    _bump_mtime(repo / "a.py")
    edited = fingerprint(repo)
    assert edited != original

    _touch(repo / "src" / "c.ts")
    added = fingerprint(repo)
    assert added != edited

    (repo / "src" / "c.ts").unlink()
    assert fingerprint(repo) == edited


def test_fingerprint_ignores_pruned_directories(repo: Path) -> None:
    original = fingerprint(repo)
    _touch(repo / "node_modules" / "pkg" / "index.js")
    _touch(repo / ".git" / "HEAD", "ref: main\n")
    _touch(repo / ".srcly" / "report.json", "{}")
    assert fingerprint(repo) == original


def test_fingerprint_changes_with_srcly_version(repo: Path, monkeypatch) -> None:
    original = fingerprint(repo)
    monkeypatch.setattr(cache, "_srcly_version", lambda: "999.0.0")
    assert fingerprint(repo) != original


# -- AnalysisCache --------------------------------------------------------------


def test_cache_dir_honours_env_override(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv(cache.CACHE_DIR_ENV, str(tmp_path / "custom"))
    assert cache.cache_dir() == tmp_path / "custom" / "analysis"


def test_saved_entry_survives_restart_and_stays_out_of_the_repo(repo: Path, tmp_path: Path) -> None:
    store_dir = tmp_path / "store"
    before = sorted(p.name for p in repo.rglob("*"))

    AnalysisCache(store_dir).save(repo, fingerprint(repo), b'{"name":"root"}', files_total=2, files_failed=1)

    # A new instance has an empty memory tier, so this reads from disk.
    entry = AnalysisCache(store_dir).load(repo)
    assert entry is not None
    assert entry.data == b'{"name":"root"}'
    assert (entry.files_total, entry.files_failed) == (2, 1)
    assert sorted(p.name for p in repo.rglob("*")) == before
    assert len(list(store_dir.glob("*.json.gz"))) == 1


def test_changed_files_invalidate_memory_and_disk(repo: Path, tmp_path: Path) -> None:
    store = AnalysisCache(tmp_path / "store")
    store.save(repo, fingerprint(repo), b"{}")
    assert store.load(repo) is not None

    _bump_mtime(repo / "src" / "b.ts")

    assert store.load(repo) is None
    assert AnalysisCache(tmp_path / "store").load(repo) is None


def test_corrupt_entry_is_a_miss(repo: Path, tmp_path: Path) -> None:
    store_dir = tmp_path / "store"
    AnalysisCache(store_dir).save(repo, fingerprint(repo), b"{}")
    next(store_dir.glob("*.json.gz")).write_bytes(b"not gzip")
    assert AnalysisCache(store_dir).load(repo) is None


def test_unwritable_cache_dir_does_not_raise(repo: Path, tmp_path: Path) -> None:
    blocker = tmp_path / "file-not-dir"
    blocker.write_text("")
    store = AnalysisCache(blocker / "store")
    store.save(repo, fingerprint(repo), b"{}")
    # Still served from memory.
    assert store.load(repo) is not None


def test_disk_entries_are_pruned(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(cache, "MAX_DISK_ENTRIES", 2)
    store = AnalysisCache(tmp_path / "store")
    for i in range(4):
        root = tmp_path / f"repo{i}"
        _touch(root / "a.py")
        store.save(root, fingerprint(root), b"{}")
        time.sleep(0.01)
    assert len(list((tmp_path / "store").glob("*.meta.json"))) == 2
    assert len(list((tmp_path / "store").glob("*.json.gz"))) == 2
    # The newest entries survive.
    fresh = AnalysisCache(tmp_path / "store")
    assert fresh.load(tmp_path / "repo3") is not None
    assert fresh.load(tmp_path / "repo0") is None


def test_memory_tier_is_bounded(tmp_path: Path) -> None:
    store = AnalysisCache(tmp_path / "store", memory_entries=1)
    for i in range(2):
        root = tmp_path / f"repo{i}"
        _touch(root / "a.py")
        store.save(root, fingerprint(root), b"{}")
    assert len(store._memory) == 1


# -- scan jobs and endpoints ----------------------------------------------------


def test_second_start_is_served_from_cache(counting_scan, repo: Path) -> None:
    first = scan_jobs.manager.start(repo)
    assert first.wait(10) and first.phase == "complete"

    second = scan_jobs.manager.start(repo)

    assert counting_scan.calls == 1
    assert second.finished and second.cached
    snapshot = second.snapshot()
    assert snapshot["phase"] == "complete"
    assert snapshot["cached"] is True
    assert (snapshot["files_total"], snapshot["files_failed"]) == (2, 1)
    assert second.result_json() == first.result_json()


def test_force_and_file_changes_trigger_a_rescan(counting_scan, repo: Path) -> None:
    assert scan_jobs.manager.start(repo).wait(10)

    forced = scan_jobs.manager.start(repo, force=True)
    assert forced.wait(10) and not forced.cached
    assert counting_scan.calls == 2

    _touch(repo / "new.py")
    changed = scan_jobs.manager.start(repo)
    assert changed.wait(10) and not changed.cached
    assert counting_scan.calls == 3


def test_failed_scans_are_not_cached(monkeypatch, repo: Path) -> None:
    def failing_scan(root_path, *, verbose, cancel, observer):
        raise RuntimeError("boom")

    monkeypatch.setattr(scan_jobs.analysis, "scan_codebase", failing_scan)
    monkeypatch.setattr(scan_jobs, "manager", ScanJobManager())
    assert scan_jobs.manager.start(repo).wait(10)
    assert cache.analysis_cache.load(repo) is None


def test_analysis_endpoints_use_and_refresh_the_cache(counting_scan, repo: Path) -> None:
    client = TestClient(app)

    first = client.get("/api/analysis", params={"path": str(repo)})
    second = client.get("/api/analysis", params={"path": str(repo)})
    assert first.status_code == second.status_code == 200
    assert counting_scan.calls == 1
    assert second.json() == first.json()

    refreshed = client.post("/api/analysis/refresh", params={"path": str(repo)})
    assert refreshed.status_code == 200
    assert counting_scan.calls == 2
    assert refreshed.json()["metrics"]["loc"] == 2

    # The refresh replaced the cached tree.
    assert client.get("/api/analysis", params={"path": str(repo)}).json()["metrics"]["loc"] == 2
    assert counting_scan.calls == 2


def test_scan_job_api_reports_cache_hits_and_honours_force(counting_scan, repo: Path) -> None:
    client = TestClient(app)
    first = client.post("/api/scans", json={"path": str(repo)}).json()
    assert scan_jobs.manager.get(first["id"]).wait(10)

    hit = client.post("/api/scans", json={"path": str(repo)})
    assert hit.status_code == 202
    assert hit.json()["phase"] == "complete"
    assert hit.json()["cached"] is True
    assert client.get(f"/api/scans/{hit.json()['id']}/result").json()["name"] == "root"

    forced = client.post("/api/scans", json={"path": str(repo), "force": True}).json()
    assert forced["cached"] is False
    assert scan_jobs.manager.get(forced["id"]).wait(10)
    assert counting_scan.calls == 2
