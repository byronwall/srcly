"""Committed snapshots and fixtures must not carry machine-specific absolute paths.

One that does passes on the machine that wrote it and fails everywhere else
(ranking-parity.json once kept its fixture's absolute root path).
"""

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIXTURE_DIRS = re.compile(r"(^|/)(snapshots|__fixtures__|fixtures)/")
MACHINE_PATH = re.compile(r"/Users/[^/\s\"]+|/home/[^/\s\"]+|/private/(?:var|tmp)/|[A-Za-z]:\\\\Users\\\\")


def test_committed_fixtures_hold_no_machine_paths():
    files = subprocess.run(
        ["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.splitlines()
    leaks = []
    for name in files:
        if not FIXTURE_DIRS.search(name):
            continue
        text = (REPO / name).read_text(encoding="utf-8", errors="ignore")
        leaks += [f"{name}: {m.group(0)}" for m in MACHINE_PATH.finditer(text)]
    assert not leaks, "absolute machine paths in committed fixtures:\n" + "\n".join(leaks)
