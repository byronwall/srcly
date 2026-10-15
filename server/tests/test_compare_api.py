"""Compare API: refs, job lifecycle, result payload, base-ref file content."""

import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.test_compare_snapshots import repo  # noqa: F401 - fixture


def _wait(client: TestClient, job_id: str, timeout: float = 60.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        snap = client.get(f"/api/compare/{job_id}").json()
        if snap["phase"] in {"complete", "failed", "cancelled"}:
            return snap
        time.sleep(0.05)
    raise AssertionError("compare did not finish")


def test_refs_lists_branches_and_commits(repo: Path):  # noqa: F811
    data = TestClient(app).get("/api/compare/refs", params={"path": str(repo)}).json()
    assert data["current"] == "feature"
    assert data["defaultBranch"] == "main"
    assert {b["name"] for b in data["branches"]} == {"main", "feature"}
    assert [c["subject"] for c in data["commits"]] == ["feature", "base"]


def test_compare_job_returns_payload_with_sides(repo: Path):  # noqa: F811
    client = TestClient(app)
    started = client.post("/api/compare", json={"path": str(repo), "base": "main", "head": "feature"})
    assert started.status_code == 202
    snap = _wait(client, started.json()["id"])
    assert snap["phase"] == "complete", snap
    assert snap["sides"]["base"]["files_total"] > 0

    payload = client.get(f"/api/compare/{snap['id']}/result").json()
    assert payload["summary"]["files"]["total"] == 3
    assert payload["trees"]["head"]["path"] == ""
    assert payload["graphs"]["base"]["nodes"]


def test_bad_ref_fails_the_job(repo: Path):  # noqa: F811
    client = TestClient(app)
    started = client.post("/api/compare", json={"path": str(repo), "base": "nope", "head": "feature"})
    snap = _wait(client, started.json()["id"])
    assert snap["phase"] == "failed"
    assert "nope" in snap["error"]
    assert client.get(f"/api/compare/{snap['id']}/result").status_code == 409


def test_file_content_at_ref_reads_deleted_files(repo: Path):  # noqa: F811
    client = TestClient(app)
    res = client.get("/api/files/content", params={"path": str(repo / "pkg" / "old.py"), "ref": "main"})
    assert res.status_code == 200
    assert "def legacy" in res.text
    missing = client.get("/api/files/content", params={"path": str(repo / "pkg" / "old.py"), "ref": "feature"})
    assert missing.status_code == 404
