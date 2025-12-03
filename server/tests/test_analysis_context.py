from pathlib import Path

import anyio
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app as fastapi_app
from app.routers import analysis as analysis_router
from app.services.analysis import find_repo_root


def _build_test_client(monkeypatch, root_path: Path) -> TestClient:
    """
    Build a TestClient with ROOT_PATH overridden so the context endpoint
    behaves as if the server had been started from ``root_path``.
    """
    # Patch the module-level ROOT_PATH used inside the router.
    monkeypatch.setattr(analysis_router, "ROOT_PATH", root_path)
    return TestClient(fastapi_app)


def test_context_root_path_matches_root_path_constant(tmp_path: Path, monkeypatch) -> None:
    """Context endpoint should report ROOT_PATH as the current root."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()

    client = _build_test_client(monkeypatch, repo_root)

    resp = client.get("/api/analysis/context")
    assert resp.status_code == 200
    data = resp.json()

    assert data["root_path"] == str(repo_root)


def test_context_repo_root_uses_find_repo_root(tmp_path: Path, monkeypatch) -> None:
    """
    Context endpoint should use analysis.find_repo_root so that repo_root_path
    is the enclosing Git root, not just the parent directory.
    """
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()
    subdir = repo_root / "subdir"
    subdir.mkdir()

    client = _build_test_client(monkeypatch, subdir)

    resp = client.get("/api/analysis/context")
    assert resp.status_code == 200
    data = resp.json()

    # find_repo_root should resolve from the subdir back to the repo root.
    assert data["repo_root_path"] == str(find_repo_root(subdir))


