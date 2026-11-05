"""The line-oriented .srcly refactoring language. Parsing never executes code."""
from __future__ import annotations

import re
import json
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


def tokens(line: str) -> list[str]:
    """JSON-quoted strings allow an agent to express exact, multiline selections."""
    words = []
    while line := line.lstrip():
        if line.startswith("#"):
            break
        if line.startswith('"'):
            word, end = json.JSONDecoder().raw_decode(line)
        elif line.startswith("'"):
            end = line.find("'", 1) + 1
            if not end:
                raise RefactorError("Unterminated quoted string.")
            word = line[1:end - 1]
        else:
            match = re.match(r"[^\s#]+", line)
            if not match:
                break
            word, end = match.group(), match.end()
        words.append(word)
        line = line[end:]
    return words


def parse(source: str) -> dict:
    if len(source) > 100_000:
        raise RefactorError("Plan exceeds 100 KB.")
    config = "tsconfig.json"
    language = "typescript"
    handles: dict[str, dict] = {}
    kinds: dict[str, str] = {}
    steps = []
    version = False
    for number, line in enumerate(source.splitlines(), 1):
        try:
            words = tokens(line)
            if not words:
                continue
            if not version:
                if words != ["refactor", "1"]:
                    raise RefactorError("Start the plan with 'refactor 1'.")
                version = True
            elif words[0] == "project" and len(words) == 2 and not steps:
                config = safe_path(words[1])
            elif words[0] == "language" and len(words) == 2 and words[1] in {"typescript", "python"} and not steps:
                language = words[1]
            elif words[0] == "checkpoint" and len(words) == 2:
                if not re.fullmatch(r"[A-Za-z_]\w*", words[1]):
                    raise RefactorError("A checkpoint needs a named check from .srcly-refactor.json.")
                steps.append({"kind": "checkpoint", "target": words[1], "to": "", "line": number, "label": line.strip()})
            elif words[0] == "let" and len(words) in {5, 6} and words[2] == "=" and not steps:
                name = words[1]
                if not re.fullmatch(r"[A-Za-z_]\w*", name) or name in handles:
                    raise RefactorError(f"Invalid or duplicate handle: {name}")
                kind = words[3]
                if (kind == "file" and len(words) != 5) or (kind in {"symbol", "selection"} and len(words) != 6) or kind not in {"file", "symbol", "selection"}:
                    raise RefactorError('Declare a file, symbol <path> <name>, or selection <path> <exact text>.')
                handles[name] = {"file": safe_path(words[4]), "kind": kind}
                if kind != "file":
                    handles[name]["name" if kind == "symbol" else "text"] = words[5]
                kinds[name] = kind
            elif words[0] == "solid-context" and len(words) == 10 and words[2] == "->" and words[4] == "provider" and words[6] == "hook" and words[8] == "within":
                target, owner = words[1], words[9]
                if target.startswith("$"):
                    if kinds.get(target[1:]) != "file":
                        raise RefactorError("solid-context needs a file handle or path for the state module.")
                else:
                    safe_path(target)
                if not owner.startswith("$") or kinds.get(owner[1:]) != "symbol":
                    raise RefactorError("The provider root must be a declared symbol handle.")
                steps.append({"kind": "solid-context", "target": target, "to": safe_path(words[3]), "provider": words[5], "hook": words[7], "owner": owner, "line": number, "label": line.strip()})
            elif words[0] in {"move-file", "move-symbol", "rename", "extract-function", "extract-component", "state-machine"} and len(words) in {4, 5} and words[2] == "->":
                operation = words[0]
                target = words[1]
                if target.startswith("$"):
                    if target[1:] not in handles:
                        raise RefactorError(f"Unknown handle {target}; declare it before the first step.")
                else:
                    safe_path(target)
                expected = "selection" if operation.startswith("extract-") else "symbol" if operation in {"move-symbol", "rename", "state-machine"} else None
                if expected and (not target.startswith("$") or kinds[target[1:]] != expected):
                    raise RefactorError(f"{operation} needs a ${expected} handle.")
                if len(words) == 5 and (operation != "move-symbol" or words[4] != "reexport"):
                    raise RefactorError("Only move-symbol accepts the optional 'reexport' flag.")
                destination = safe_path(words[3]) if operation.startswith("move-") else words[3]
                steps.append({"kind": operation, "target": target, "to": destination, "reexport": len(words) == 5, "line": number, "label": line.strip()})
                if operation.startswith("extract-"):
                    kinds[target[1:]] = "symbol"
            elif words[0] in {"add-member", "update-member", "remove-member", "add-type", "update-type", "remove-type"} and len(words) == (2 if words[0] == "remove-type" else 3):
                operation, target = words[:2]
                if operation == "add-type":
                    safe_path(target)
                elif not target.startswith("$") or kinds.get(target[1:]) != "symbol":
                    raise RefactorError(f"{operation} needs a declared symbol handle.")
                steps.append({"kind": operation, "target": target, "to": words[2] if len(words) == 3 else "", "line": number, "label": line.strip()})
            else:
                raise RefactorError("Unknown or malformed operation. Read /api/refactor/catalog for the supported grammar and examples.")
        except ValueError as exc:
            raise RefactorError(f"Line {number}: {exc}", line=number) from exc
    if not version or not steps:
        raise RefactorError("Add at least one refactoring step.")
    if len(steps) > 100:
        raise RefactorError("A plan can contain at most 100 steps.")
    if language == "python" and any(step["kind"] not in {"move-file", "checkpoint"} for step in steps):
        raise RefactorError("Python currently supports move-file (including module renames) and checkpoint.", code="python-operation-unavailable")
    return {"version": 1, "language": language, "config": config, "handles": handles, "steps": steps}
