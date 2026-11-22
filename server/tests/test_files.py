import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures.change_lens_repo import _git


def _client() -> TestClient:
    return TestClient(app)


def test_get_file_content_text(tmp_path: Path) -> None:
    txt = tmp_path / "note.txt"
    txt.write_text("hello world\n", encoding="utf-8")

    client = _client()
    resp = client.get(f"/api/files/content?path={txt}")

    assert resp.status_code == 200
    # FastAPI should treat this as plain text.
    assert resp.text == "hello world\n"
    assert resp.headers["content-type"].startswith("text/plain")


def test_get_file_content_binary_image(tmp_path: Path) -> None:
    png = tmp_path / "test.png"
    # Minimal PNG-like header bytes; content does not need to be a valid image
    # for the purposes of this test, only that it is served as binary.
    data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    png.write_bytes(data)

    client = _client()
    resp = client.get(f"/api/files/content?path={png}")

    assert resp.status_code == 200
    assert resp.content == data
    assert resp.headers["content-type"].startswith("image/png")


def test_get_file_content_not_found(tmp_path: Path) -> None:
    missing = tmp_path / "missing.txt"

    client = _client()
    resp = client.get(f"/api/files/content?path={missing}")

    assert resp.status_code == 404
    assert resp.json()["detail"] == "File not found"


@pytest.mark.skipif(os.name == "nt", reason="requires worktree symlinks")
def test_pinned_historical_source_does_not_follow_live_symlink(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")
    pinned = repo / "chosen.py"
    other = repo / "other.py"
    original = "def exact_historical(value):\n    if value:\n        return 1\n    return 0\n"
    pinned.write_text(original, encoding="utf-8")
    other.write_text("a = 'different historical blob'\n", encoding="utf-8")
    _git(repo, "add", "--", "chosen.py", "other.py")
    _git(repo, "commit", "-qm", "two historical files")
    commit = _git(repo, "rev-parse", "HEAD")
    tree = _git(repo, "rev-parse", "HEAD^{tree}")
    client = _client()
    query = {"repoRoot": str(repo), "path": str(pinned), "ref": commit}
    marks_at_commit = client.get("/api/files/markers", params=query)
    assert marks_at_commit.status_code == 200
    assert marks_at_commit.json()["markers"]

    pinned.unlink()
    pinned.symlink_to("other.py")
    for ref in (commit, tree):
        res = client.get("/api/files/content", params={**query, "ref": ref})
        assert res.status_code == 200 and res.text == original
        markers = client.get("/api/files/markers", params={**query, "ref": ref})
        assert markers.status_code == 200 and markers.json() == marks_at_commit.json()

    outside = tmp_path / "outside.py"
    outside.write_text("don't read me", encoding="utf-8")
    for path in (str(outside), f"{repo}/../outside.py"):
        denied = client.get("/api/files/content", params={**query, "path": path})
        assert denied.status_code == 400 and "inside" in denied.json()["detail"]
    assert client.get("/api/files/content", params={**query, "ref": "main"}).status_code == 400





