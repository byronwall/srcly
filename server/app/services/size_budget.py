"""The size budget: code files over 5,000 tokens (bytes / 4) may only shrink.

``srcly report`` writes ``size_budget.json``: each code file over the budget,
with its size now and its baseline. The baseline is the smallest size seen
since the file went over, so it only ratchets down. ``srcly check --ratchet``
fails when a file over the budget is larger than its baseline, or a file
goes over the budget for the first time.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from app.services import file_classes

BUDGET_TOKENS = 5000
BYTES_PER_TOKEN = 4
FILE_NAME = "size_budget.json"


def measure(root: Path) -> dict[str, int]:
    """Bytes of each code file over the budget, by root-relative path."""
    from app.services.analysis import discover_files

    root = root.resolve()
    out: dict[str, int] = {}
    for path in discover_files(root).files:
        rel = Path(path).relative_to(root).as_posix()
        if file_classes.classify(rel)[0] != "code":
            continue
        try:
            size = Path(path).stat().st_size
        except OSError:
            continue
        if size // BYTES_PER_TOKEN > BUDGET_TOKENS:
            out[rel] = size
    return out


def build(root: Path, previous: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    old = (previous or {}).get("files", {})
    files = {}
    for rel, size in sorted(measure(root).items()):
        baseline = min(size, old[rel]["baseline_bytes"]) if rel in old else size
        files[rel] = {"bytes": size, "tokens": size // BYTES_PER_TOKEN, "baseline_bytes": baseline}
    return {"budget_tokens": BUDGET_TOKENS, "bytes_per_token": BYTES_PER_TOKEN, "files": files}


def read(path: Path) -> Optional[dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write(root: Path, out_dir: Path) -> Path:
    target = out_dir / FILE_NAME
    data = build(root, read(target))
    target.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return target


def check(root: Path, budget_file: Path) -> tuple[int, str]:
    """(exit code, what to print) for ``srcly check --ratchet``."""
    data = read(budget_file)
    if data is None:
        return 2, f"No size budget at {budget_file}: run `srcly report` first."
    old = data.get("files", {})
    grew, new = [], []
    now = measure(root)
    for rel, size in sorted(now.items()):
        if rel not in old:
            new.append(f"  {rel}: {size // BYTES_PER_TOKEN} tokens, over the {BUDGET_TOKENS}-token budget")
        elif size > old[rel]["baseline_bytes"]:
            base = old[rel]["baseline_bytes"]
            new_tokens, base_tokens = size // BYTES_PER_TOKEN, base // BYTES_PER_TOKEN
            grew.append(f"  {rel}: {base_tokens} → {new_tokens} tokens (+{size - base} bytes)")
    lines = []
    if grew:
        lines += ["Files over the size budget that grew (they may only shrink):", *grew]
    if new:
        lines += ["Files that went over the size budget:", *new]
    if lines:
        lines.append("Split or shrink them, then run `srcly report` to record the new sizes.")
        return 1, "\n".join(lines)
    shrunk = sum(1 for rel, size in now.items() if rel in old and size < old[rel]["baseline_bytes"])
    tail = f" {shrunk} shrank; `srcly report` records the lower baseline." if shrunk else ""
    return 0, f"Size budget holds: {len(now)} files over {BUDGET_TOKENS} tokens, none grew.{tail}"
