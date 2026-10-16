"""Committed JSON snapshots the client's tests read (``tests/snapshots/``).

The server owns them: a test fails when one is stale, and
``SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest`` rewrites it.
"""

import json
import os
from pathlib import Path
from typing import Any

SNAPSHOTS = Path(__file__).parent / "snapshots"


def check_snapshot(name: str, payload: Any) -> None:
    path = SNAPSHOTS / name
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if os.environ.get("SRCLY_UPDATE_SNAPSHOTS"):
        path.write_text(text, encoding="utf-8")
        return
    assert path.exists() and path.read_text(encoding="utf-8") == text, (
        f"{path.name} is stale; regenerate with SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest {Path(__file__).parent.name}"
    )
