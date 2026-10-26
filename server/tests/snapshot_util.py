"""Committed JSON snapshots the client's tests read (``tests/snapshots/``).

The server owns them: a test fails when one is stale, and
``SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest`` rewrites it.
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Any

SNAPSHOTS = Path(__file__).parent / "snapshots"


def machine_paths() -> list[str]:
    """Absolute paths that only exist on this machine: home, temp dirs, this checkout."""
    found = {str(Path.home()), str(Path(__file__).resolve().parents[2])}
    for temp in (tempfile.gettempdir(), "/private/var/folders", "/private/tmp"):
        found.update({temp, str(Path(temp).resolve())})
    return sorted(p for p in found if len(p) > 4)


def check_snapshot(name: str, payload: Any) -> None:
    path = SNAPSHOTS / name
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    # A snapshot that holds this machine's paths passes here and fails in CI.
    leaked = [p for p in machine_paths() if p in text]
    assert not leaked, f"{name} contains machine-specific paths {leaked}; make them relative to the fixture root"
    if os.environ.get("SRCLY_UPDATE_SNAPSHOTS"):
        path.write_text(text, encoding="utf-8")
        return
    assert path.exists() and path.read_text(encoding="utf-8") == text, (
        f"{path.name} is stale; regenerate with SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest {Path(__file__).parent.name}"
    )
