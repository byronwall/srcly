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
    assert list((static / "assets").glob("RefactorView-*.js"))
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


def test_installed_refactor_cli():
    import json

    result = subprocess.run(["srcly", "refactor", "catalog"], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    catalog = json.loads(result.stdout)
    assert {"move-symbol", "extract-function", "add-member"} <= {op["name"] for op in catalog["operations"]}
    assert "python" in catalog["languages"]


def test_installed_python_refactor(tmp_path, monkeypatch):
    import json
    import sys

    monkeypatch.setenv("SRCLY_CACHE_DIR", str(tmp_path / "cache"))
    root = tmp_path / "repo"
    root.mkdir()
    (root / "state.py").write_text("value = 42\n")
    (root / "consumer.py").write_text("from state import value\n")
    (root / ".srcly-refactor.json").write_text(json.dumps({"checks": {"unit": [sys.executable, "-c", "from consumer import value; assert value == 42"]}}))
    for args in [["init", "-q"], ["config", "user.email", "test@srcly.invalid"], ["config", "user.name", "Package test"], ["add", "."], ["commit", "-qm", "fixture"]]:
        subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)
    plan = tmp_path / "plan.srcly"
    plan.write_text('refactor 1\nlanguage python\nmove-file "state.py" -> "model.py"\ncheckpoint unit\n')
    result = subprocess.run(["srcly", "refactor", "preview", str(plan), "--path", str(root)], cwd=tmp_path, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    preview = json.loads(result.stdout)
    assert preview["status"] == "ready"
    result = subprocess.run(["srcly", "refactor", "apply", preview["id"], "--all"], cwd=tmp_path, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout)["status"] == "complete"
    assert (root / "state.py").exists() and not (root / "model.py").exists()


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


def test_bundled_refactoring_compiler(tmp_path, monkeypatch):
    import json

    from app.services.refactor import compiler

    monkeypatch.delenv("SRCLY_ENGINE_DEV", raising=False)
    (tmp_path / "tsconfig.json").write_text(json.dumps({"compilerOptions": {"strict": True}, "include": ["*.ts"]}))
    (tmp_path / "state.ts").write_text("export const count = 1;\n")
    (tmp_path / "consumer.ts").write_text('import { count } from "./state";\nexport const twice = count * 2;\n')
    assert compiler.inspect(tmp_path, "tsconfig.json")["diagnostics"] == []
    edits = compiler.inspect(tmp_path, "tsconfig.json", {"kind": "move-file", "file": "state.ts", "to": "model.ts"})["changes"]
    assert {edit["path"] for edit in edits} == {"state.ts", "model.ts", "consumer.ts"}
    assert "./model" in next(edit["after"] for edit in edits if edit["path"] == "consumer.ts")
