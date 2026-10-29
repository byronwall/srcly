"""
The banner the CLI prints on start: what srcly is, what it reads, and what it runs with.

Pure lookups: nothing here starts the engine or a scan.
"""

from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path

from app.services.cache import _srcly_version, cache_dir
from app.services.dataflow import availability


def version_line() -> str:
    return f"srcly {_srcly_version()} (Python {platform.python_version()})"


def banner(target: Path, source: str, url: str, static_dir: str | None) -> str:
    """
    ``source`` says how ``target`` was chosen, e.g. "enclosing Git repo root".
    ``static_dir`` is the client build that the server serves, or None.
    """
    rows = [
        ("Codebase", f"{target}  ({source})"),
        ("Server", url),
        ("Python", sys.executable),
        ("Client", static_dir or "not found: the server answers /api only (run `bash build-srcly.sh` in a checkout)"),
        ("Cache", str(cache_dir())),
        ("Data flow", _dataflow_status(target)),
    ]
    overrides = sorted(f"{key}={value}" for key, value in os.environ.items() if key.startswith("SRCLY_"))
    rows.append(("Overrides", ", ".join(overrides) if overrides else "none (no SRCLY_* variables set)"))
    width = max(len(label) for label, _ in rows)
    lines = [version_line()]
    lines += [f"  {label.ljust(width)}  {value}" for label, value in rows]
    return "\n".join(lines)


def _dataflow_status(target: Path) -> str:
    node = availability.locate_node()
    if node is None:
        return "off: Node.js not found on PATH (set SRCLY_NODE to choose one)"
    launch = availability.locate_bundle(node)
    node_text = f"node {_node_version(node)} at {node}"
    if launch is None:
        return f"off: no engine in this install ({node_text})"
    language = "TypeScript" if availability.has_tsconfig(target) else "Python" if availability.is_python_root(target) else None
    project = f"{language} project" if language else "no tsconfig or Python project, so N/A here"
    return f"{launch.kind} engine, {node_text}; {project}"


def _node_version(node: str) -> str:
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or "?"
    except (OSError, subprocess.SubprocessError):
        return "?"
