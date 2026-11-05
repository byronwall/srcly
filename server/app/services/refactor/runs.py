"""Preview in an owned Git worktree; replay recorded edits with exact preconditions.

The source checkout is read-only. A write-ahead journal recovers an interrupted
step without accepting unknown edits. No reset, stash, checkout or commit runs
in the user's working tree.
"""
from __future__ import annotations

import copy
import difflib
import hashlib
import json
import os
import re
import stat
import threading
import uuid
from pathlib import Path

from app.services import cache
from app.services.compare.git_refs import repo_root, run_git
from app.services.refactor import compiler
from app.services.refactor.plan import RefactorError, parse, safe_path

_lock = threading.RLock()


def directory() -> Path:
    return cache.cache_dir().parent / "refactor"


def contained(root: Path, relative: str) -> Path:
    file = root / safe_path(relative)
    if file.resolve() != file.absolute():
        raise RefactorError(f"Refusing a symlink in an edited path: {relative}")
    return file


def content(file: Path) -> str | None:
    if not file.exists():
        return None
    if file.stat().st_size > 2_000_000:
        raise RefactorError(f"File exceeds the 2 MB edit limit: {file.name}")
    return file.read_bytes().decode("utf-8")


def fingerprint(root: Path) -> str:
    names = sorted(set(run_git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0")) - {""})
    result = hashlib.sha256()
    for name in names:
        if "node_modules" in Path(name).parts:
            continue
        file = root / name
        result.update(name.encode() + b"\0")
        if file.is_symlink():
            result.update(b"link:" + os.readlink(file).encode())
        elif file.is_file():
            result.update(str(stat.S_IMODE(file.stat().st_mode)).encode() + b"\0")
            with file.open("rb") as stream:
                while chunk := stream.read(1024 * 1024):
                    result.update(chunk)
        else:
            result.update(b"missing")
    return result.hexdigest()


def source_state(root: Path) -> tuple[str, str]:
    if run_git(root, "status", "--porcelain", "--untracked-files=all").strip():
        raise RefactorError("The source checkout has uncommitted changes. Commit them before previewing; execution starts from a clean commit.", code="dirty-source")
    return run_git(root, "rev-parse", "HEAD").strip(), fingerprint(root)


def save(run: dict) -> None:
    target = directory() / run["id"] / "run.json"
    temp = target.with_suffix(".tmp")
    with temp.open("w") as stream:
        json.dump(run, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, target)


def load(run_id: str) -> dict:
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise RefactorError("Invalid run id.")
    target = directory() / run_id / "run.json"
    if not target.is_file():
        raise RefactorError("Refactoring run not found.")
    run = json.loads(target.read_text())
    if run.get("pending"):
        recover(run)
    return run


def public(run: dict) -> dict:
    result = {k: v for k, v in run.items() if k not in {"pending", "sourceFingerprint", "workFingerprint"}}
    result["steps"] = [{**{k: v for k, v in step.items() if k != "changes"}, "files": [
        {"path": c["path"], "status": "added" if c["before"] is None else "removed" if c["after"] is None else "modified",
         "diff": "".join(difflib.unified_diff((c["before"] or "").splitlines(keepends=True), (c["after"] or "").splitlines(keepends=True), fromfile=f'a/{c["path"]}', tofile=f'b/{c["path"]}'))}
        for c in step.get("changes", [])]} for step in run["steps"]]
    return result


def _write(file: Path, text: str | None, mode: int | None) -> None:
    if text is None:
        file.unlink(missing_ok=True)
        return
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_name(f".srcly-{uuid.uuid4().hex}.tmp")
    try:
        with temp.open("wb") as stream:
            stream.write(text.encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        temp.chmod(mode or 0o644)
        os.replace(temp, file)
    finally:
        temp.unlink(missing_ok=True)


def _matches(file: Path, change: dict, side: str) -> bool:
    return content(file) == change[side] and (not file.exists() or stat.S_IMODE(file.stat().st_mode) == change[f"{side}Mode"])


def write_changes(root: Path, changes: list[dict], reverse: bool = False) -> None:
    before, after = ("after", "before") if reverse else ("before", "after")
    paths = [(contained(root, c["path"]), c) for c in changes]
    for file, change in paths:
        if not _matches(file, change, before):
            raise RefactorError(f"Files changed since preview: {change['path']}. Revalidate the plan.")
    done = []
    try:
        for file, change in paths:
            _write(file, change[after], change[f"{after}Mode"])
            done.append((file, change))
    except OSError:
        for file, change in reversed(done):
            _write(file, change[before], change[f"{before}Mode"])
        raise


def recover(run: dict) -> None:
    pending = run["pending"]
    root = Path(run["projectRoot"])
    changes = run["steps"][pending["index"]]["changes"]
    for change in changes:
        file = contained(root, change["path"])
        if not any(_matches(file, change, side) for side in ("before", "after")):
            raise RefactorError("Interrupted run contains unknown edits; recovery would overwrite them.")
    side = "after" if pending["reverse"] else "before"
    for change in changes:
        _write(contained(root, change["path"]), change[side], change[f"{side}Mode"])
    if fingerprint(Path(run["worktree"])) != run["workFingerprint"]:
        raise RefactorError("Interrupted run has unrelated worktree edits; recovery preserved them and execution remains blocked.", code="stale-worktree")
    run["pending"] = None
    save(run)


def _link_dependencies(repo: Path, worktree: Path) -> None:
    parents = {Path(".")}
    for name in run_git(repo, "ls-files", "-z").split("\0"):
        if name.endswith("package.json"):
            parents.add(Path(name).parent)
    for parent in sorted(parents):
        source = repo / parent / "node_modules"
        target = worktree / parent / "node_modules"
        if source.is_dir() and not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(source, target_is_directory=True)


def preview(root: Path, source: str) -> dict:
    plan = parse(source)
    root = root.resolve()
    repo = repo_root(root)
    commit, source_hash = source_state(repo)
    run_id = uuid.uuid4().hex
    folder = directory() / run_id
    folder.mkdir(parents=True)
    worktree = folder / "worktree"
    run_git(repo, "-c", "core.hooksPath=/dev/null", "worktree", "add", "--detach", "--quiet", str(worktree), commit)
    project_root = worktree / root.relative_to(repo)
    run = {"id": run_id, "sourceRoot": str(root), "repo": str(repo), "commit": commit, "sourceFingerprint": source_hash,
           "worktree": str(worktree), "projectRoot": str(project_root), "source": source, "plan": plan,
           "status": "previewing", "applied": 0, "steps": [], "pending": None, "error": None, "diagnostics": []}
    save(run)
    applied_changes = []
    try:
        _link_dependencies(repo, worktree)
        baseline = compiler.inspect(project_root, plan["config"])
        run["graph"] = baseline["graph"]
        if baseline["diagnostics"]:
            raise RefactorError("Fix baseline TypeScript errors before refactoring: " + json.dumps(baseline["diagnostics"][:10]), code="baseline-errors")
        handles = copy.deepcopy(plan["handles"])
        for step in plan["steps"]:
            target = handles[step["target"][1:]]["file"] if step["target"].startswith("$") else step["target"]
            action = {"kind": step["kind"], "file": target, "to": step["to"]}
            entry = {**step, "status": "blocked", "changes": []}
            run["steps"].append(entry)
            changes = compiler.inspect(project_root, plan["config"], action)["changes"]
            old_mode = stat.S_IMODE(contained(project_root, target).stat().st_mode)
            for change in changes:
                file = contained(project_root, change["path"])
                change["beforeMode"] = stat.S_IMODE(file.stat().st_mode) if file.exists() else None
                change["afterMode"] = (change["beforeMode"] or old_mode) if change["after"] is not None else None
            entry["changes"] = changes
            # A preview interrupted here is blocked on reload; no execution is allowed.
            save(run)
            write_changes(project_root, changes)
            applied_changes.append(changes)
            checked = compiler.inspect(project_root, plan["config"])
            entry.update(checked)
            if checked["diagnostics"]:
                raise RefactorError(f"Line {step['line']}: TypeScript validation failed: " + json.dumps(checked["diagnostics"][:10]), code="validation-failed", line=step["line"])
            entry["status"] = "validated"
            for handle in handles.values():
                if handle["file"] == target:
                    handle["file"] = step["to"]
        if source_state(repo) != (commit, source_hash):
            raise RefactorError("Source changed while previewing. Revalidate the plan.")
        run["status"] = "ready"
    except (ValueError, OSError, RuntimeError) as exc:
        run["status"] = "blocked"
        run["error"] = str(exc)
        run["diagnostics"] = [getattr(exc, "diagnostic", {"code": "execution-error", "message": str(exc), "line": None})]
        if run["steps"] and run["diagnostics"][0]["line"] is None:
            run["diagnostics"][0]["line"] = run["steps"][-1]["line"]
    finally:
        for changes in reversed(applied_changes):
            write_changes(project_root, changes, reverse=True)
        run["workFingerprint"] = fingerprint(worktree)
        save(run)
    return public(run)


def execute(run_id: str, mode: str) -> dict:
    with _lock:
        run = load(run_id)
        if run["status"] not in {"ready", "running", "complete"}:
            raise RefactorError("This run has no executable preview. Revalidate the plan.")
        repo = Path(run["repo"])
        if mode != "undo" and source_state(repo) != (run["commit"], run["sourceFingerprint"]):
            raise RefactorError("Source changed since preview. Revalidate the plan.", code="stale-source")
        if fingerprint(Path(run["worktree"])) != run["workFingerprint"]:
            raise RefactorError("The execution worktree changed outside this run; no files were overwritten.", code="stale-worktree")
        if mode == "undo":
            if not run["applied"]:
                raise RefactorError("There is no applied step to undo.")
            indices = [run["applied"] - 1]
        else:
            indices = list(range(run["applied"], len(run["steps"])))
            if mode == "next":
                indices = indices[:1]
        for index in indices:
            run["pending"] = {"index": index, "reverse": mode == "undo"}
            save(run)
            write_changes(Path(run["projectRoot"]), run["steps"][index]["changes"], reverse=mode == "undo")
            run["applied"] += -1 if mode == "undo" else 1
            run["pending"] = None
            run["status"] = "complete" if run["applied"] == len(run["steps"]) else "running" if run["applied"] else "ready"
            run["workFingerprint"] = fingerprint(Path(run["worktree"]))
            save(run)
        return public(run)
