"""The line-oriented .srcly refactoring language. Parsing never executes code."""
from __future__ import annotations

import re
import shlex
from pathlib import PurePosixPath


class RefactorError(ValueError):
    def __init__(self, message: str, code: str = "invalid-plan", line: int | None = None):
        super().__init__(message)
        self.diagnostic = {"code": code, "message": message, "line": line}


def safe_path(value: str) -> str:
    path = PurePosixPath(value)
    if (not value or path.is_absolute() or "\\" in value or ":" in value
            or any(p in {"..", ".git", "node_modules"} for p in path.parts)
            or value != path.as_posix() or value == "."):
        raise RefactorError(f"Expected a project-relative path: {value}")
    return value


def parse(source: str) -> dict:
    if len(source) > 100_000:
        raise RefactorError("Plan exceeds 100 KB.")
    config = "tsconfig.json"
    handles: dict[str, dict] = {}
    steps = []
    version = False
    for number, line in enumerate(source.splitlines(), 1):
        try:
            words = shlex.split(line, comments=True)
            if not words:
                continue
            if not version:
                if words != ["refactor", "1"]:
                    raise RefactorError("Start the plan with 'refactor 1'.")
                version = True
            elif words[0] == "project" and len(words) == 2 and not steps:
                config = safe_path(words[1])
            elif words[0] == "let" and len(words) == 5 and words[2:4] == ["=", "file"] and not steps:
                name = words[1]
                if not re.fullmatch(r"[A-Za-z_]\w*", name) or name in handles:
                    raise RefactorError(f"Invalid or duplicate handle: {name}")
                handles[name] = {"file": safe_path(words[4])}
            elif words[0] == "move-file" and len(words) == 4 and words[2] == "->":
                target = words[1]
                if target.startswith("$"):
                    if target[1:] not in handles:
                        raise RefactorError(f"Unknown handle {target}; declare it before the first step.")
                else:
                    safe_path(target)
                steps.append({"kind": "move-file", "target": target, "to": safe_path(words[3]), "line": number, "label": line.strip()})
            else:
                raise RefactorError("Expected project, let <handle> = file <path>, or move-file <path|$handle> -> <path>.")
        except ValueError as exc:
            raise RefactorError(f"Line {number}: {exc}", line=number) from exc
    if not version or not steps:
        raise RefactorError("Add at least one refactoring step.")
    if len(steps) > 100:
        raise RefactorError("A plan can contain at most 100 steps.")
    return {"version": 1, "config": config, "handles": handles, "steps": steps}
