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
