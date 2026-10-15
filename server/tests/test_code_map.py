"""Keep docs/CODE_MAP.md pointing at files and handlers that exist."""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CODE_MAP = REPO / "docs" / "CODE_MAP.md"

# A backticked token that looks like a repo path: has a slash or a known extension.
PATH_TOKEN = re.compile(r"`([\w./*-]+/[\w./*-]*|[\w.-]+\.(?:py|tsx?|md|sh|json))`")
# `routers/scans.py:start_scan` style handler references.
HANDLER_TOKEN = re.compile(r"`([\w./-]+\.py):(\w+)`")


def _table_rows():
    """Yield each table row minus its first cell (the feature name, not a path)."""
    for line in CODE_MAP.read_text().splitlines():
        if line.startswith("|") and not line.startswith("| ---"):
            yield "|".join(line.split("|")[2:])


def _exists(token: str, bases: list[Path]) -> bool:
    for base in bases:
        candidate = base / token.rstrip("/")
        if "*" in token:
            if list(base.glob(token)):
                return True
        elif candidate.exists():
            return True
    return False


def _bases_for(row: str) -> list[Path]:
    """Short paths resolve against the directories of full paths in the same row."""
    app = REPO / "server" / "app"
    bases = [REPO, REPO / "server", app, app / "services", REPO / "client" / "src"]
    for token in PATH_TOKEN.findall(row):
        if token.startswith(("server/", "client/")):
            parent = (REPO / token).parent
            while parent != REPO and parent not in bases:
                bases.append(parent)
                parent = parent.parent
    return bases


def test_code_map_paths_exist():
    missing = []
    for row in _table_rows():
        bases = _bases_for(row)
        for token in PATH_TOKEN.findall(row):
            if token.startswith(("/api", "--")) or "://" in token:
                continue
            if not _exists(token, bases):
                missing.append(f"{token}  (row: {row[:80]})")
    assert not missing, "docs/CODE_MAP.md references missing paths:\n" + "\n".join(missing)


def test_code_map_handlers_exist():
    missing = []
    for row in _table_rows():
        for file_token, func in HANDLER_TOKEN.findall(row):
            matches = [b / file_token for b in _bases_for(row) if (b / file_token).is_file()]
            if not matches:
                missing.append(f"{file_token} (file)")
                continue
            if not re.search(rf"^\s*(async\s+)?def {func}\b", matches[0].read_text(), re.M):
                missing.append(f"{file_token}:{func}")
    assert not missing, "docs/CODE_MAP.md references missing handlers:\n" + "\n".join(missing)
