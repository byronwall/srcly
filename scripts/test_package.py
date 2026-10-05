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
    assert list((static / "assets").glob("dependencyForce.worker-*.js"))
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
