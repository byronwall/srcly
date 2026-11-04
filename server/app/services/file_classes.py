"""
What kind of file a path is, from its repo-relative path alone, with the reason.

The findings queue ranks ``code``. Every other class stays visible in reports,
counted with its reason, so a snapshot or a long doc is never silently dropped
and never mistaken for a refactor target. The rules are path-only on purpose:
cheap, deterministic and easy to explain; the reason names the rule that fired.
"""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Literal

FileClass = Literal["code", "test", "docs", "fixture", "generated", "vendored", "config", "data"]
CLASSES: tuple[FileClass, ...] = ("code", "test", "docs", "fixture", "generated", "vendored", "config", "data")

_VENDORED_DIRS = {"vendor", "vendors", "third_party", "third-party", "node_modules", "bower_components"}
_GENERATED_DIRS = {"dist", "build", "generated", "__generated__", "out"}
_FIXTURE_DIRS = {"fixtures", "__fixtures__", "fixture", "testdata", "__snapshots__", "snapshots", "examples", "golden"}
_TEST_DIRS = {"test", "tests", "__tests__", "e2e", "spec", "specs"}
_DOC_SUFFIXES = {".md", ".mdx", ".mdc", ".markdown", ".rst", ".txt", ".adoc"}
_DATA_SUFFIXES = {".csv", ".tsv", ".jsonl", ".ndjson", ".parquet", ".sql"}
_CONFIG_SUFFIXES = {".json", ".jsonc", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".lock", ".env"}
_LOCKFILES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock", "poetry.lock", "Cargo.lock", "Gemfile.lock"}


def classify(path: str) -> tuple[FileClass, str]:
    """``(class, reason)`` for a repo-relative path (``::symbol`` suffixes are ignored)."""
    p = PurePosixPath(path.split("::", 1)[0].replace("\\", "/"))
    name, suffix = p.name, p.suffix.lower()
    dirs = [part.lower() for part in p.parts[:-1]]

    if hit := next((d for d in dirs if d in _VENDORED_DIRS), None):
        return "vendored", f"under {hit}/"
    if ".min." in name:
        return "vendored", "minified (.min.)"
    if name in _LOCKFILES:
        return "generated", "lockfile"
    if ".generated." in name or name.endswith(("_pb2.py", ".pb.go")):
        return "generated", "generated file name"
    if hit := next((d for d in dirs if d in _GENERATED_DIRS), None):
        return "generated", f"under {hit}/"
    if suffix == ".snap":
        return "fixture", "test snapshot (.snap)"
    if hit := next((d for d in dirs if d in _FIXTURE_DIRS), None):
        return "fixture", f"under {hit}/"
    if suffix in _DOC_SUFFIXES:
        return "docs", f"{suffix} document"
    if hit := next((d for d in dirs if d in _TEST_DIRS), None):
        return "test", f"under {hit}/"
    if name.startswith("test_") or name.endswith(("_test.py", "_test.go")) or ".test." in name or ".spec." in name:
        return "test", "test file name"
    if name == "conftest.py":
        return "test", "pytest conftest"
    if suffix in _DATA_SUFFIXES:
        return "data", f"{suffix} data"
    if suffix in _CONFIG_SUFFIXES or (name.startswith(".") and not suffix) or name.startswith(".env"):
        return "config", f"{suffix or name} config"
    return "code", "source"
