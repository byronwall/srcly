"""What a findings run produces: findings, and one ``ToolRun`` per tool."""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

Severity = Literal["error", "warning"]
Source = Literal["project", "srcly defaults"]


@dataclass
class Finding:
    path: str
    """Absolute path of the file."""
    line: int
    end_line: int
    column: int
    rule: str
    message: str
    severity: Severity
    tool: str
    """The ``ToolRun.id`` that reported it."""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ToolRun:
    """One tool invocation and how it went."""

    id: str
    """Unique within a result: ``tsc:client/tsconfig.app.json``, ``ruff``."""
    tool: str
    """``tsc`` | ``eslint`` | ``ruff`` | ``srcly-ts``."""
    label: str
    """What the UI shows: "tsc (client/tsconfig.app.json)", "ruff (srcly defaults)"."""
    source: Source
    """``project``: the repo's own tool or config ran. ``srcly defaults``: srcly's bundled rules."""
    root: str
    """Directory the run covers (absolute)."""
    extensions: list[str]
    """File extensions it checks."""
    status: Literal["ok", "na"] = "ok"
    reason: str = ""
    """Why it is N/A: missing, failed, timed out."""
    seconds: float = 0.0
    finding_count: int = 0
    error_count: int = 0
    files: Optional[list[str]] = None
    """Files it checked, when the tool says. ``None``: every file with one of
    ``extensions`` under ``root``."""
    exclude_dirs: list[str] = field(default_factory=list)
    """Folders it leaves to other tools (srcly's TS rules skip tsc projects)."""

    @property
    def ok(self) -> bool:
        return self.status == "ok"

    def covers(self, path: str) -> bool:
        """Whether this run was meant to check ``path`` (a failed run still covers it)."""
        if os.path.splitext(path)[1].lower() not in self.extensions:
            return False
        if not _under(path, self.root) or any(_under(path, d) for d in self.exclude_dirs):
            return False
        if self.ok and self.files is not None:
            return path in self._file_set
        return True

    @property
    def _file_set(self) -> frozenset[str]:
        cached = self.__dict__.get("_files_cache")
        if cached is None:
            cached = frozenset(self.files or ())
            self.__dict__["_files_cache"] = cached
        return cached

    def summary(self) -> dict[str, Any]:
        """The public view (no file list)."""
        return {
            "id": self.id,
            "tool": self.tool,
            "label": self.label,
            "source": self.source,
            "status": self.status,
            "reason": self.reason,
            "seconds": round(self.seconds, 2),
            "finding_count": self.finding_count,
            "error_count": self.error_count,
            "files_checked": len(self.files) if self.files is not None else None,
        }

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FindingsResult:
    root: str
    status: Literal["running", "ok", "na"]
    """``ok`` once every planned tool finished (each may still be N/A)."""
    reason: str = ""
    tools: list[ToolRun] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)

    def info(self) -> dict[str, Any]:
        """What the tree root carries (``models.FindingsInfo``)."""
        return {
            "status": self.status,
            "reason": self.reason,
            "tools": [t.summary() for t in self.tools],
            "finding_count": sum(t.finding_count for t in self.tools if t.ok),
        }

    def by_file(self) -> dict[str, list[Finding]]:
        out: dict[str, list[Finding]] = {}
        for f in self.findings:
            out.setdefault(f.path, []).append(f)
        return out

    def covering(self, path: str) -> list[ToolRun]:
        return [t for t in self.tools if t.covers(path)]

    def as_dict(self) -> dict[str, Any]:
        return {
            "root": self.root,
            "status": self.status,
            "reason": self.reason,
            "tools": [t.as_dict() for t in self.tools],
            "findings": [f.as_dict() for f in self.findings],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FindingsResult":
        return cls(
            root=data["root"],
            status=data["status"],
            reason=data.get("reason", ""),
            tools=[ToolRun(**t) for t in data.get("tools", [])],
            findings=[Finding(**f) for f in data.get("findings", [])],
        )


def _under(path: str, folder: str) -> bool:
    return path == folder or path.startswith(folder.rstrip(os.sep) + os.sep)


def rel_label(path: Path, base: Path) -> str:
    """``path`` relative to ``base`` for labels, falling back to its name."""
    try:
        rel = path.resolve().relative_to(base.resolve()).as_posix()
    except ValueError:
        return path.name
    return rel or path.name
