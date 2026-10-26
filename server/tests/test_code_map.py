"""Keep docs/CODE_MAP.md pointing at files and handlers that exist."""

import fnmatch
import re
import subprocess
from functools import cache
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CODE_MAP = REPO / "docs" / "CODE_MAP.md"

# A backticked token that looks like a repo path: has a slash or a known extension.
PATH_TOKEN = re.compile(r"`([\w./*-]+/[\w./*-]*|[\w.-]+\.(?:py|tsx?|mjs|md|sh|json))`")
# `routers/scans.py:start_scan` style handler references.
HANDLER_TOKEN = re.compile(r"`([\w./-]+\.py):(\w+)`")


@cache
def _tracked() -> tuple[str, ...]:
    """Every file git knows about, plus untracked ones not ignored (a change in progress)."""
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout
    return tuple(out.splitlines())


def _matches(token: str) -> list[str]:
    """Tracked paths a token names: a full path, a folder, a glob, or a path's tail."""
    token = token.strip("/")
    files = _tracked()
    if "*" in token:
        return [f for f in files if fnmatch.fnmatch(f, token) or fnmatch.fnmatch(f, f"*/{token}")]
    return [
        f for f in files
        if f == token or f.startswith(token + "/") or f.endswith("/" + token) or f"/{token}/" in f"/{f}"
    ]


def _table_rows():
    """Yield each table row minus its first cell (the feature name, not a path)."""
    for line in CODE_MAP.read_text().splitlines():
        if line.startswith("|") and not line.startswith("| ---"):
            yield "|".join(line.split("|")[2:])


def test_code_map_paths_exist():
    missing = []
    for row in _table_rows():
        for token in PATH_TOKEN.findall(row):
            if token.startswith(("/api", "--", "~")) or "://" in token:
                continue
            if not _matches(token):
                missing.append(f"{token}  (row: {row[:80]})")
    assert not missing, "docs/CODE_MAP.md references missing paths:\n" + "\n".join(missing)


def test_code_map_handlers_exist():
    missing = []
    for row in _table_rows():
        for file_token, func in HANDLER_TOKEN.findall(row):
            files = [f for f in _matches(file_token) if f.endswith(".py")]
            if not files:
                missing.append(f"{file_token} (file)")
                continue
            pattern = re.compile(rf"^\s*((async\s+)?def|class) {func}\b", re.M)
            if not any(pattern.search((REPO / f).read_text()) for f in files):
                missing.append(f"{file_token}:{func}")
    assert not missing, "docs/CODE_MAP.md names missing handlers:\n" + "\n".join(missing)
