"""The tool contract and the guarded process runner every external tool uses."""

from __future__ import annotations

import os
import signal
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Sequence

from app.services.findings.model import Finding, Source, ToolRun


class ToolFailed(Exception):
    """The tool ran but gave no usable result (crash, config error, bad output)."""


class ToolTimeout(ToolFailed):
    pass


def _env_timeout(name: str, default: float) -> float:
    raw = os.environ.get(name)
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


# Generous: these run in the background, never in front of the treemap.
# ``SRCLY_FINDINGS_TIMEOUT`` overrides every tool's limit.
DEFAULT_TIMEOUTS = {"tsc": 120.0, "eslint": 120.0, "ruff": 60.0, "srcly-ts": 60.0}


def timeout_for(tool: str) -> float:
    return _env_timeout("SRCLY_FINDINGS_TIMEOUT", DEFAULT_TIMEOUTS.get(tool, 60.0))


@dataclass
class Tool:
    """A planned tool run. Subclasses implement ``check``."""

    id: str
    tool: str
    label: str
    source: Source
    root: Path
    extensions: tuple[str, ...]
    timeout: float = 60.0
    signature_paths: tuple[Path, ...] = field(default_factory=tuple)
    """Binary and config files whose change should invalidate cached findings."""
    exclude_dirs: tuple[Path, ...] = field(default_factory=tuple)
    """Folders left to other tools."""

    def check(self) -> tuple[list[Finding], Optional[list[str]]]:
        """Run and return (findings, files checked or None). Raise ``ToolFailed``."""
        raise NotImplementedError

    def signature(self) -> str:
        parts = [self.id, self.label]
        for path in self.signature_paths:
            try:
                parts.append(f"{path}:{path.stat().st_mtime_ns}")
            except OSError:
                parts.append(f"{path}:-")
        return "|".join(parts)

    def new_run(self) -> ToolRun:
        return ToolRun(
            id=self.id,
            tool=self.tool,
            label=self.label,
            source=self.source,
            root=str(self.root),
            extensions=list(self.extensions),
            exclude_dirs=[str(d) for d in self.exclude_dirs],
        )


class MissingTool(Tool):
    """A tool that should run but can't: its files show N/A with ``reason``."""

    def __init__(self, id: str, tool: str, label: str, root: Path, extensions: Sequence[str], reason: str) -> None:
        super().__init__(id=id, tool=tool, label=label, source="srcly defaults", root=root, extensions=tuple(extensions))
        self.reason = reason

    def check(self):
        raise ToolFailed(self.reason)


def run(tool: Tool) -> tuple[ToolRun, list[Finding]]:
    """Run one tool; any failure becomes an N/A ``ToolRun`` with the reason, never zero findings."""
    result = tool.new_run()
    started = time.monotonic()
    try:
        findings, files = tool.check()
    except ToolTimeout:
        result.status, result.reason = "na", f"{tool.label} timed out after {tool.timeout:g}s"
        findings = []
    except ToolFailed as exc:
        result.status, result.reason = "na", f"{tool.label} failed: {exc}"
        findings = []
    except Exception as exc:  # noqa: BLE001 - a broken tool must not break the scan
        result.status, result.reason = "na", f"{tool.label} crashed: {type(exc).__name__}: {exc}"
        findings = []
    else:
        result.files = files
        result.finding_count = len(findings)
        result.error_count = sum(1 for f in findings if f.severity == "error")
    result.seconds = time.monotonic() - started
    return result, findings


@dataclass
class ProcessOutput:
    returncode: int
    stdout: str
    stderr: str


def run_process(cmd: Sequence[str], cwd: Path, timeout: float) -> ProcessOutput:
    """
    Run ``cmd`` in its own process group and kill the whole group on timeout,
    so a tool's children (node workers) die with it.
    """
    env = {**os.environ, "NO_COLOR": "1", "FORCE_COLOR": "0", "CI": "1"}
    try:
        proc = subprocess.Popen(
            list(cmd),
            cwd=str(cwd),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
    except OSError as exc:
        raise ToolFailed(f"could not start {Path(cmd[0]).name}: {exc.strerror or exc}") from exc
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        _kill_group(proc)
        proc.communicate()
        raise ToolTimeout(str(exc)) from exc
    return ProcessOutput(proc.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace"))


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        proc.kill()


def first_line(text: str, limit: int = 200) -> str:
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line[:limit]
    return ""


def find_up(start: Path, relative: str, stop: Optional[Path] = None) -> Optional[Path]:
    """The nearest ``<dir>/<relative>`` from ``start`` upwards (to ``stop`` inclusive, else the filesystem root)."""
    current = start.resolve()
    stop = stop.resolve() if stop else None
    while True:
        candidate = current / relative
        if candidate.exists():
            return candidate
        if current == stop or current.parent == current:
            return None
        current = current.parent


_PRUNED_DIRS = frozenset({
    "node_modules", ".git", ".hg", ".svn", ".venv", "venv", "env", "__pycache__", "dist", "build",
    "out", "coverage", ".next", ".nuxt", ".turbo", ".cache", ".mypy_cache", ".ruff_cache", ".pytest_cache",
    "site-packages", "vendor",
})


def find_within(root: Path, names: frozenset[str], max_depth: int = 4) -> list[Path]:
    """Files named one of ``names`` under ``root`` (shallow, skipping dependency and build dirs), sorted."""
    root = root.resolve()
    if root.is_file():
        return [root] if root.name in names else []
    found: list[Path] = []
    base_depth = len(root.parts)
    for dirpath, dirnames, filenames in os.walk(root):
        depth = len(Path(dirpath).parts) - base_depth
        dirnames[:] = [] if depth >= max_depth else sorted(
            d for d in dirnames if d not in _PRUNED_DIRS and not (d.startswith(".") and d not in {".config"})
        )
        found.extend(Path(dirpath) / name for name in sorted(filenames) if name in names)
    return sorted(found)
