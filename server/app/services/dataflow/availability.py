"""
Where the data-flow engine comes from, and whether a root can use it.

Pure lookups: nothing here starts a process. The reasons a root is N/A that
can be decided without spawning (no Node, no engine, no tsconfig) are decided
here; the rest (non-strict tsconfig, no TS files, a crash) come from the child.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

NODE_ENV = "SRCLY_NODE"
DEV_ENV = "SRCLY_ENGINE_DEV"

# server/app/services/dataflow -> repository root
_REPO_ROOT = Path(__file__).resolve().parents[4]
ENGINE_DIR = _REPO_ROOT / "engine"

_SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", ".output", ".vinxi", "coverage"}


@dataclass(frozen=True)
class Launch:
    """How to start the engine: argv before ``--root``, and the working directory."""

    argv: tuple[str, ...]
    cwd: Path
    kind: str  # "bundle" | "dev" | "test"


@dataclass(frozen=True)
class Availability:
    available: bool
    reason: str | None = None
    message: str | None = None
    node: str | None = None
    launch: Launch | None = None


def locate_node() -> str | None:
    """``SRCLY_NODE`` when set and executable, else ``node`` on PATH."""
    explicit = os.environ.get(NODE_ENV)
    if explicit:
        return explicit if os.access(explicit, os.X_OK) else None
    return shutil.which("node")


def locate_bundle(node: str) -> Launch | None:
    """
    The engine entry, in order: the bundle packaged in the wheel, the
    repository's built bundle, then (only with ``SRCLY_ENGINE_DEV=1``) the
    TypeScript source run through the engine's own ``tsx``.
    """
    try:
        packaged = resources.files("app") / "engine" / "srcly-engine.mjs"
        if packaged.is_file():
            path = Path(os.fspath(packaged))
            return Launch((node, str(path)), path.parent, "bundle")
    except (ModuleNotFoundError, TypeError):
        pass
    built = ENGINE_DIR / "dist" / "srcly-engine.mjs"
    if built.is_file():
        return Launch((node, str(built)), built.parent, "bundle")
    if os.environ.get(DEV_ENV) == "1":
        entry = ENGINE_DIR / "bin" / "srcly-engine.ts"
        if entry.is_file() and (ENGINE_DIR / "node_modules" / "tsx").is_dir():
            # `--import tsx` resolves from the working directory, so run in engine/.
            return Launch((node, "--import", "tsx", str(entry)), ENGINE_DIR, "dev")
    return None


def has_tsconfig(root: Path, max_depth: int = 3) -> bool:
    """A ``tsconfig*.json`` at ``root`` or a few levels below (not in dependency or build folders)."""
    stack = [(root, 0)]
    while stack:
        folder, depth = stack.pop()
        try:
            entries = list(os.scandir(folder))
        except OSError:
            continue
        for entry in entries:
            if entry.is_file() and entry.name.startswith("tsconfig") and entry.name.endswith(".json"):
                return True
            if depth < max_depth and entry.is_dir(follow_symlinks=False):
                if entry.name in _SKIP_DIRS or entry.name.startswith("."):
                    continue
                stack.append((Path(entry.path), depth + 1))
    return False


def probe(root: Path) -> Availability:
    """Whether the engine can be started for ``root``, without starting it."""
    node = locate_node()
    if node is None:
        return Availability(False, "node-not-found", "Node.js was not found on PATH (set SRCLY_NODE to choose one).")
    launch = locate_bundle(node)
    if launch is None:
        return Availability(
            False,
            "engine-missing",
            "The data-flow engine is not bundled in this install (in a checkout, set SRCLY_ENGINE_DEV=1 after `cd engine && pnpm install`).",
            node=node,
        )
    if not has_tsconfig(root):
        return Availability(False, "no-tsconfig", f"No tsconfig.json was found in {root}.", node=node, launch=launch)
    return Availability(True, node=node, launch=launch)


def default_source(root: Path) -> Path:
    """The folder the engine treats as source: ``src`` when it exists, else the root."""
    src = root / "src"
    return src if src.is_dir() else root


def count_source_files(root: Path, limit: int = 20000) -> int:
    """TS/TSX files under ``root`` (outside dependency and build folders), for the first-query timeout."""
    count = 0
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]
        count += sum(1 for name in files if name.endswith((".ts", ".tsx")) and not name.endswith(".d.ts"))
        if count >= limit:
            break
    return count
