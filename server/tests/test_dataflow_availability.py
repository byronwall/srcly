"""Which roots data flow can analyze, decided without spawning the engine."""

import sys
from pathlib import Path

from app.services.dataflow import availability
from app.services.dataflow.availability import Launch


def _ready(monkeypatch):
    monkeypatch.setattr(availability, "locate_node", lambda: sys.executable)
    monkeypatch.setattr(availability, "locate_bundle", lambda node: Launch((node,), Path("."), "test"))


def test_tsconfig_root_is_typescript(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "tsconfig.json").write_text("{}")
    (tmp_path / "pyproject.toml").write_text("")
    found = availability.probe(tmp_path)
    assert found.available and found.language == "typescript" and found.python is None


def test_jsconfig_root_is_typescript(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "jsconfig.json").write_text("{}")
    found = availability.probe(tmp_path)
    assert found.available and found.language == "typescript"


def test_a_config_name_the_engine_never_reads_does_not_claim_the_root(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "tsconfig.app.json").write_text("{}")
    assert not availability.has_tsconfig(tmp_path)
    assert availability.probe(tmp_path).reason == "no-tsconfig"


def test_javascript_with_no_config_is_analyzed_as_typescript(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.js").write_text("")
    found = availability.probe(tmp_path)
    assert found.available and found.language == "typescript"


def test_a_python_project_keeps_its_stray_scripts_as_python(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "pyproject.toml").write_text("")
    (tmp_path / "tool.js").write_text("")
    assert availability.probe(tmp_path).language == "python"


def test_a_package_json_root_keeps_its_stray_python_as_javascript(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "package.json").write_text("{}")
    (tmp_path / "app.js").write_text("")
    (tmp_path / "tool.py").write_text("")
    assert availability.probe(tmp_path).language == "typescript"


def test_javascript_files_are_counted_for_the_first_query_timeout(tmp_path):
    for name in ("a.js", "b.mjs", "c.cjs", "d.jsx", "e.ts", "f.d.ts", "g.d.mts", "h.css"):
        (tmp_path / name).write_text("")
    assert availability.count_source_files(tmp_path) == 5


def _touch(root: Path, *paths: str) -> None:
    for rel in paths:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("")


def test_typescript_root_names_the_python_apps_inside_it(tmp_path):
    # full-stack-fastapi-template: a workspace pyproject around backend/'s.
    _touch(tmp_path / "a", "pyproject.toml", "frontend/tsconfig.json", "backend/pyproject.toml", "backend/app/__init__.py")
    # paperless-ngx: manage.py in src/ beats the repo's pyproject.
    _touch(tmp_path / "b", "pyproject.toml", "src-ui/tsconfig.json", "src/manage.py", "src/documents/__init__.py")
    # mealie: the root's own pyproject names its package, not its tests.
    _touch(tmp_path / "c", "pyproject.toml", "frontend/tsconfig.json", "mealie/__init__.py", "tests/__init__.py")
    assert availability.python_apps(tmp_path / "a") == ("backend",)
    assert availability.python_apps(tmp_path / "b") == ("src",)
    assert availability.python_apps(tmp_path / "c") == ("mealie",)


def test_python_project_is_python_with_this_interpreter(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "pyproject.toml").write_text("[project]\nname='x'\n")
    found = availability.probe(tmp_path)
    assert found.available and found.language == "python"
    assert found.python == sys.executable


def test_loose_python_files_make_a_python_root(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "app.py").write_text("x = 1\n")
    assert availability.probe(tmp_path).language == "python"


def test_python_root_without_mypy_names_the_checker(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "main.py").write_text("print('hi')\n")
    monkeypatch.setattr(availability, "python_checker", lambda: None)
    found = availability.probe(tmp_path)
    assert (found.available, found.reason, found.language) == (False, "python-checker-not-found", "python")
    assert "mypy" in (found.message or "")


def test_neither_language_is_no_tsconfig(tmp_path, monkeypatch):
    _ready(monkeypatch)
    (tmp_path / "README.md").write_text("hi")
    found = availability.probe(tmp_path)
    assert (found.available, found.reason) == (False, "no-tsconfig")
    assert "Python project" in (found.message or "")


def test_python_files_are_counted_for_the_first_query_timeout(tmp_path):
    (tmp_path / "a.py").write_text("")
    (tmp_path / "b.ts").write_text("")
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "c.py").write_text("")
    assert availability.count_source_files(tmp_path, language="python") == 1
    assert availability.count_source_files(tmp_path) == 1
