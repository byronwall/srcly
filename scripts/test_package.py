"""Run against an installed wheel, outside the server source directory."""

import re
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

import app
from app.main import app as api


def test_bundled_client():
    static = Path(app.__file__).parent / "static"
    assert (static / "index.html").is_file()
    assert list((static / "assets").glob("highlight.worker-*.js"))
    assert list((static / "assets").glob("DependencyView-*.js"))
    with TestClient(api) as client:
        response = client.get("/")
        assert response.status_code == 200
        assets = re.findall(r'(?:src|href)="(/[^"]+)"', response.text)
        assert assets
        for asset in assets:
            assert client.get(asset).status_code == 200
        for asset in (static / "assets").iterdir():
            response = client.get(f"/assets/{asset.name}")
            assert response.status_code == 200
            assert response.content == asset.read_bytes()


def test_installed_cli():
    result = subprocess.run(["srcly", "--help"], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0
    assert "Interactive codebase treemap" in result.stdout


def test_bundled_engine(tmp_path, monkeypatch):
    """The wheel's engine answers on a copy of solid-route, with no checkout to fall back on."""
    import json
    import shutil

    import pytest

    from app.services.dataflow import availability
    from app.services.dataflow import engine as dataflow_engine
    from app.services.dataflow.engine import EngineRegistry

    engine_dir = Path(app.__file__).parent / "engine"
    assert (engine_dir / "srcly-engine.mjs").is_file()
    assert (engine_dir / "node_modules" / "typescript" / "lib" / "lib.es2022.d.ts").is_file()
    version = json.loads((engine_dir / "VERSION.json").read_text())
    assert version["engine"] and version["typescript"]
    if shutil.which("node") is None:
        pytest.skip("needs node")

    root = tmp_path / "solid-route"
    shutil.copytree(Path(__file__).parents[1] / "engine" / "examples" / "solid-route", root)
    monkeypatch.delenv("SRCLY_ENGINE_DEV", raising=False)
    assert availability.probe(root).launch.kind == "bundle"
    registry = EngineRegistry()
    monkeypatch.setattr(dataflow_engine, "registry", registry)
    try:
        with TestClient(api) as client:
            body = client.get("/api/dataflow/routes", params={"path": str(root)}).json()
            assert body["outcome"] == "ok", body
            assert [route["pathPattern"] for route in body["routes"]] == ["/records"]
            status = client.get("/api/dataflow/status", params={"path": str(root)}).json()
            assert status["typescriptFrom"] == "bundled"
    finally:
        registry.close_all()
