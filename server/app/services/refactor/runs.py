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
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from app.services import cache
from app.services.compare.git_refs import repo_root, run_git
from app.services.refactor import compiler
from app.services.refactor.plan import RefactorError, parse, safe_path

_lock = threading.RLock()
TYPE_EDITS = {"add-member", "update-member", "remove-member", "add-type", "update-type", "remove-type"}
EXECUTABLE = {"ready", "running", "complete", "ready-with-errors", "running-with-errors", "complete-with-errors"}


def diagnostic_counts(items: list[dict]) -> Counter:
    # Moving a declaration can shift lines; diagnostic identity is its message,
    # code and file, with multiplicity retained so new instances cannot hide.
    return Counter((item["file"], item["code"], item["message"]) for item in items)


def directory() -> Path:
    return cache.cache_dir().parent / "refactor"


@contextmanager
def locked(run_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise RefactorError("Invalid run id.")
    folder = directory() / run_id
    if not folder.is_dir():
        raise RefactorError("Refactoring run not found.")
    with _lock, (folder / "run.lock").open("a+b") as stream:
        if os.name == "nt":
            import msvcrt
            stream.write(b"\0")
            stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


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
    run["updatedAt"] = datetime.now(timezone.utc).isoformat()
    run.setdefault("createdAt", run["updatedAt"])
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
    result["reviewPath"] = review_path(run)
    result["steps"] = [{**{k: v for k, v in step.items() if k != "changes"}, "files": [
        {"path": c["path"], "status": "added" if c["before"] is None else "removed" if c["after"] is None else "modified",
         "diff": "".join(difflib.unified_diff((c["before"] or "").splitlines(keepends=True), (c["after"] or "").splitlines(keepends=True), fromfile=f'a/{c["path"]}', tofile=f'b/{c["path"]}'))}
        for c in step.get("changes", [])]} for step in run["steps"]]
    return result


def review_path(run: dict) -> str:
    return "/?" + urlencode({"repo": run["sourceRoot"], "view": "refactor", "run": run["id"]})


def recent(root: Path, limit: int = 20) -> list[dict]:
    """Share CLI/UI journals without recovering or mutating any worktree.

    Journals are atomically replaced by save(); listing can read a consistent
    snapshot while an executor owns the lock. Opening a run performs recovery.
    """
    source_root = str(root.resolve())
    found = []
    for journal in directory().glob("*/run.json"):
        if not re.fullmatch(r"[a-f0-9]{32}", journal.parent.name) or journal.is_symlink():
            continue
        try:
            run = json.loads(journal.read_text())
            if run["sourceRoot"] != source_root or run["id"] != journal.parent.name:
                continue
            steps = run["plan"]["steps"]
            first = steps[0] if steps else {}
            handle = run["plan"].get("handles", {}).get(first.get("target", "").removeprefix("$"), {})
            target = " · ".join(filter(None, (handle.get("file"), handle.get("name")))) or first.get("target", "")
            label = f"{target} → {first['to']}" if first.get("to") else target
            updated = run.get("updatedAt") or datetime.fromtimestamp(journal.stat().st_mtime, timezone.utc).isoformat()
            found.append({"id": run["id"], "sourceRoot": source_root, "status": run["status"],
                          "applied": run["applied"], "stepCount": len(steps), "updatedAt": updated,
                          "operation": first.get("kind", ""), "label": label, "reviewPath": review_path(run)})
        except (OSError, ValueError, KeyError, TypeError):
            # An old or incomplete journal must not hide other usable runs.
            continue
    return sorted(found, key=lambda item: (item["updatedAt"], item["id"]), reverse=True)[:limit]


def codemod(run: dict) -> dict:
    return {"format": "srcly-codemod-1", "base": run["commit"], "source": run["source"],
            "status": run["status"], "steps": run["steps"], "typeDiagnostics": run.get("typeDiagnostics", []),
            "execute": {"method": "POST", "path": f"/api/refactor/runs/{run['id']}/execute", "body": {"mode": "all"}},
            "command": ["srcly", "refactor", "apply", run["id"], "--all"]}


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
            # Git's common node_modules/ rule matches directories, not a symlink
            # at that path. Keep a real ignored directory and link its entries.
            target.mkdir(parents=True)
            for entry in source.iterdir():
                (target / entry.name).symlink_to(entry, target_is_directory=entry.is_dir())


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
        baseline = compiler.inspect(project_root, plan["config"], language=plan["language"])
        run["graph"] = baseline["graph"]
        run["baselineDiagnostics"] = baseline["diagnostics"]
        if any(d.get("phase") != "type" for d in baseline["diagnostics"]) or (baseline["diagnostics"] and not any(step["kind"] in TYPE_EDITS for step in plan["steps"])):
            raise RefactorError("Fix baseline compiler errors before refactoring: " + json.dumps(baseline["diagnostics"][:10]), code="baseline-errors")
        previous_diagnostics = baseline["diagnostics"]
        checked = baseline
        handles = copy.deepcopy(plan["handles"])
        for step in plan["steps"]:
            if step["kind"] == "checkpoint":
                from app.services.refactor import checkpoints
                entry = {**step, **checked, "status": "blocked", "changes": []}
                run["steps"].append(entry)
                argv = checkpoints.resolve(project_root, step["target"])
                entry["checkpoint"] = checkpoints.run(project_root, step["target"], argv)
                entry["status"] = "validated"
                continue
            handle = handles[step["target"][1:]] if step["target"].startswith("$") else {"file": step["target"]}
            target = handle["file"]
            action = {**handle, "kind": step["kind"], "to": step["to"], "reexport": step.get("reexport", False)}
            if step["kind"] == "solid-context":
                action.update(provider=step["provider"], hook=step["hook"], owner=handles[step["owner"][1:]])
            entry = {**step, "status": "blocked", "changes": []}
            run["steps"].append(entry)
            proposal = compiler.inspect(project_root, plan["config"], action, language=plan["language"])
            entry.update({key: proposal[key] for key in ("machine", "ownership") if key in proposal})
            changes = proposal["changes"]
            old_file = contained(project_root, target)
            old_mode = stat.S_IMODE(old_file.stat().st_mode) if old_file.exists() else 0o644
            for change in changes:
                file = contained(project_root, change["path"])
                change["beforeMode"] = stat.S_IMODE(file.stat().st_mode) if file.exists() else None
                change["afterMode"] = (change["beforeMode"] or old_mode) if change["after"] is not None else None
            entry["changes"] = changes
            # A preview interrupted here is blocked on reload; no execution is allowed.
            save(run)
            write_changes(project_root, changes)
            applied_changes.append(changes)
            previous_graph = checked["graph"]
            checked = compiler.inspect(project_root, plan["config"], language=plan["language"])
            entry.update(checked)
            if plan["language"] == "python" and step["kind"] == "move-file":
                actual = {(edge["from"], edge["to"]) for edge in checked["graph"]["edges"]}
                expected = {(step["to"] if edge["from"] == target else edge["from"], step["to"] if edge["to"] == target else edge["to"])
                            for edge in previous_graph["edges"] if target in {edge["from"], edge["to"]}}
                if expected - actual:
                    raise RefactorError("Python import relationships were not preserved: " + repr(sorted(expected - actual)), code="python-import-proof-required", line=step["line"])
            for change in changes:
                if (change["after"] is not None and change["path"].endswith((".ts", ".tsx", ".mts", ".cts"))
                        and not change["path"].endswith((".d.ts", ".d.mts", ".d.cts")) and change["path"] not in checked["graph"]["files"]):
                    raise RefactorError(f"The edited source is outside this tsconfig's checked project: {change['path']}", code="target-not-in-project", line=step["line"])
            unexpected = diagnostic_counts(checked["diagnostics"]) - diagnostic_counts(previous_diagnostics)
            if any(d.get("phase") != "type" for d in checked["diagnostics"]) or (unexpected and not proposal.get("intentionalTypeErrors")):
                raise RefactorError(f"Line {step['line']}: Compiler validation failed: " + json.dumps(checked["diagnostics"][:10]), code="validation-failed", line=step["line"])
            entry["status"] = "type-errors" if checked["diagnostics"] else "validated"
            entry["intentionalTypeErrors"] = bool(proposal.get("intentionalTypeErrors"))
            previous_diagnostics = checked["diagnostics"]
            update_handles(handles, step, action, proposal)
        if source_state(repo) != (commit, source_hash):
            raise RefactorError("Source changed while previewing. Revalidate the plan.")
        run["typeDiagnostics"] = previous_diagnostics
        run["status"] = "ready-with-errors" if previous_diagnostics else "ready"
    except (ValueError, OSError, RuntimeError) as exc:
        run["status"] = "blocked"
        run["error"] = str(exc)
        run["diagnostics"] = [getattr(exc, "diagnostic", {"code": "execution-error", "message": str(exc), "line": None})]
        if run["steps"] and run["diagnostics"][0]["line"] is None:
            run["diagnostics"][0]["line"] = run["steps"][-1]["line"]
        if run["steps"] and "checkpoint" in run["diagnostics"][0]:
            run["steps"][-1]["checkpoint"] = run["diagnostics"][0]["checkpoint"]
    finally:
        for changes in reversed(applied_changes):
            try:
                write_changes(project_root, changes, reverse=True)
            except (ValueError, OSError) as exc:
                run["status"] = "blocked"
                run["error"] = f"Preview rollback needs inspection in {worktree}: {exc}"
                break
        run["workFingerprint"] = fingerprint(worktree)
        save(run)
    return public(run)


def update_handles(handles: dict, step: dict, action: dict, proposal: dict) -> None:
    if step["kind"].startswith("extract-"):
        handles[step["target"][1:]] = {"kind": "symbol", "file": action["file"], "name": proposal.get("name", step["to"])}
        return
    for handle in handles.values():
        if handle["file"] != action["file"]:
            continue
        if step["kind"] == "move-file":
            handle["file"] = step["to"]
        elif step["kind"] == "solid-context":
            handle["file"] = step["to"]
            if handle.get("name") in proposal["ownership"]["values"]:
                handle["name"] = "createSrclyState." + handle["name"]
        elif action.get("name") and (handle.get("name") == action["name"] or handle.get("name", "").startswith(action["name"] + ".")):
            if step["kind"] == "move-symbol":
                handle["file"] = step["to"]
            elif step["kind"] == "rename":
                prefix = action["name"].rsplit(".", 1)[0] + "." if "." in action["name"] else ""
                handle["name"] = prefix + step["to"] + handle["name"][len(action["name"]):]


def execute(run_id: str, mode: str) -> dict:
    with locked(run_id):
        run = load(run_id)
        if run["status"] not in EXECUTABLE:
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
            if mode != "undo" and source_state(repo) != (run["commit"], run["sourceFingerprint"]):
                raise RefactorError("Source changed during execution. Revalidate before continuing.", code="stale-source")
            step = run["steps"][index]
            if mode != "undo" and step["kind"] == "checkpoint":
                from app.services.refactor import checkpoints
                try:
                    step["executionCheck"] = checkpoints.run(Path(run["projectRoot"]), step["target"], step["checkpoint"]["argv"])
                except (ValueError, OSError) as exc:
                    run["error"] = str(exc)
                    run["diagnostics"] = [getattr(exc, "diagnostic", {"code": "checkpoint-failed", "message": str(exc), "line": step["line"]})]
                    if "checkpoint" in run["diagnostics"][0]:
                        step["executionCheck"] = run["diagnostics"][0]["checkpoint"]
                    save(run)
                    raise
            run["error"] = None
            run["diagnostics"] = []
            run["pending"] = {"index": index, "reverse": mode == "undo"}
            save(run)
            write_changes(Path(run["projectRoot"]), run["steps"][index]["changes"], reverse=mode == "undo")
            run["applied"] += -1 if mode == "undo" else 1
            run["pending"] = None
            run["status"] = "complete" if run["applied"] == len(run["steps"]) else "running" if run["applied"] else "ready"
            run["typeDiagnostics"] = run["steps"][run["applied"] - 1]["diagnostics"] if run["applied"] else run["baselineDiagnostics"]
            if run["typeDiagnostics"]:
                run["status"] += "-with-errors"
            run["workFingerprint"] = fingerprint(Path(run["worktree"]))
            save(run)
        return public(run)
