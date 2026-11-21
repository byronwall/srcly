"""A selection (window, ref, times) resolved to a base, a head and one first-parent commit list."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from app.services.compare.git_refs import (
    GitError,
    ResolvedRef,
    branch_of,
    default_branch,
    repo_root,
    resolve_auto_base,
    run_git,
)

EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
"""Git's empty tree: the base of a window that reaches the first commit."""
MAX_COMMITS = 200
"""Newest commits kept in one window. A longer window says so in its notes."""
MAX_LISTED = 5000
"""First-parent commits read when a time window is resolved."""
GIT_TIMEOUT = 30.0
WINDOW_SPANS = {"24h": timedelta(hours=24), "7d": timedelta(days=7)}

_ROOT_NOTE = "The window reaches the first commit of the repository: its base is the empty tree."
_FORMAT = "%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1f%P"


class LensError(Exception):
    """The selection cannot be read. ``status`` is the HTTP status the router answers with."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Params:
    window: str = "branch"
    mode: str = "touched"
    ref: str = "HEAD"
    base: Optional[str] = None
    head: Optional[str] = None
    since: Optional[str] = None
    until: Optional[str] = None
    worktree: Optional[bool] = None


@dataclass
class Commit:
    sha: str
    short: str
    subject: str
    author: str
    ts: int
    parents: list[str]
    upstream_merge: bool = False
    """A merge of the default branch into this branch: its diff is other people's work, so it is not read."""


@dataclass
class Endpoint:
    ref: str
    sha: Optional[str]
    label: str
    ts: Optional[int]


@dataclass
class Window:
    repo: Path
    scope: str
    """The scan root inside the repo (``""`` for the repo root): only files below it are read."""
    params: Params
    base: Endpoint
    tip: Endpoint
    """The head commit. The payload's head is the working tree instead when it holds edits."""
    commits: list[Commit]
    wants_worktree: bool
    since: Optional[int] = None
    until: Optional[int] = None
    notes: list[str] = field(default_factory=list)
    upstream_tree: Optional[str] = None
    """The base with the window's upstream merges applied, when it holds any: what "before" is read from."""

    @property
    def base_tree(self) -> str:
        return self.upstream_tree or self.base.sha or EMPTY_TREE


def local_timezone() -> tuple[str, timezone | ZoneInfo]:
    """The server's IANA zone name and tzinfo; UTC when the name cannot be found."""
    name = os.environ.get("TZ", "")
    if not name:
        try:
            link = os.path.realpath("/etc/localtime")
            if "zoneinfo/" in link:
                name = link.split("zoneinfo/", 1)[1]
        except OSError:
            name = ""
    try:
        return name, ZoneInfo(name)
    except Exception:
        return "UTC", timezone.utc


def iso(ts: Optional[int]) -> Optional[str]:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, local_timezone()[1]).isoformat()


def _parse_time(text: str, what: str) -> int:
    try:
        when = datetime.fromisoformat(text.strip().replace("Z", "+00:00"))
    except ValueError:
        raise LensError(f"{what} is not an ISO 8601 time: {text}") from None
    if when.tzinfo is None:
        when = when.replace(tzinfo=local_timezone()[1])
    return int(when.timestamp())


def _git(repo: Path, *args: str) -> str:
    return run_git(repo, *args, timeout=GIT_TIMEOUT)


def _sha(repo: Path, ref: str) -> str:
    try:
        return _git(repo, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").strip()
    except GitError:
        raise LensError(f"{ref} is not a branch, tag or commit in {repo.name}") from None


def _try_sha(repo: Path, ref: str) -> Optional[str]:
    try:
        return _git(repo, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").strip() or None
    except GitError:
        return None


def _commit_ts(repo: Path, sha: str) -> int:
    return int(_git(repo, "log", "-1", "--format=%ct", sha).strip())


def _log(repo: Path, *revs: str) -> list[Commit]:
    """First-parent commits, newest first."""
    raw = _git(repo, "log", "--first-parent", f"--format={_FORMAT}", *revs)
    commits = []
    for line in raw.split("\n"):
        sha, short, subject, author, ts, parents = (line.split("\x1f") + [""] * 6)[:6]
        if sha:
            commits.append(Commit(sha, short, subject, author, int(ts or 0), parents.split()))
    return commits


def _is_ancestor(repo: Path, older: str, newer: str) -> bool:
    try:
        _git(repo, "merge-base", "--is-ancestor", older, newer)
        return True
    except GitError:
        return False


def _shallow_boundary(repo: Path) -> set[str]:
    try:
        if _git(repo, "rev-parse", "--is-shallow-repository").strip() != "true":
            return set()
        path = Path(_git(repo, "rev-parse", "--path-format=absolute", "--git-path", "shallow").strip())
        return set(path.read_text(encoding="utf-8").split())
    except (GitError, OSError):
        return set()


def resolve(path: Path, params: Params) -> Window:
    try:
        repo = repo_root(path)
    except GitError as exc:
        raise LensError(str(exc), status=409) from None
    head_commit = _try_sha(repo, "HEAD")
    if head_commit is None:
        raise LensError(f"{repo.name} has no commits yet", status=409)
    start = (path if path.is_dir() else path.parent).resolve()
    scope = "" if start == repo else start.relative_to(repo).as_posix()

    notes: list[str] = []
    tip_ref = params.head if params.window == "custom" and params.head else params.ref
    tip_sha = _sha(repo, tip_ref)
    tip_name = branch_of(repo, tip_ref) or tip_ref
    tip = Endpoint(tip_ref, tip_sha, f"{tip_name} @ {tip_sha[:7]}", _commit_ts(repo, tip_sha))

    wants_worktree = params.worktree if params.worktree is not None else tip_sha == head_commit
    if wants_worktree and tip_sha != head_commit:
        wants_worktree = False
        notes.append(f"The working tree is left out: {tip_ref} is not the checked-out commit.")

    window = Window(repo, scope, params, base=tip, tip=tip, commits=[], wants_worktree=wants_worktree, notes=notes)
    if scope:
        notes.append(f"Only files under {scope}/ are read.")
    boundary = _shallow_boundary(repo)
    if boundary:
        notes.append("This clone is shallow: history before its oldest commits is not available.")

    try:
        default = default_branch(repo)
    except GitError:
        default = None

    if params.window == "branch":
        _branch_window(window, default)
    elif params.window in WINDOW_SPANS:
        now = int(time.time())
        _time_window(window, now - int(WINDOW_SPANS[params.window].total_seconds()), now)
    elif params.window == "custom":
        if params.base:
            base_sha = _sha(repo, params.base)
            window.base = Endpoint(params.base, base_sha, f"{branch_of(repo, params.base) or params.base} @ {base_sha[:7]}", _commit_ts(repo, base_sha))
            window.commits = _log(repo, f"{base_sha}..{tip_sha}")[::-1]
            if not _is_ancestor(repo, base_sha, tip_sha):
                notes.append(
                    f"{params.base} is not an ancestor of {tip_ref}. Net compares the two snapshots; touched reads only {tip_ref}'s own commits."
                )
            if params.since or params.until:
                notes.append("The base revision sets this window; since and until are not used.")
        elif params.since or params.until:
            since = _parse_time(params.since, "since") if params.since else 0
            until = _parse_time(params.until, "until") if params.until else int(time.time())
            _time_window(window, since, until)
        else:
            raise LensError("A custom window needs base (and head), or since (and until)")
    else:
        raise LensError(f"Unknown window: {params.window}")

    _trim(window, boundary)
    _mark_upstream_merges(window, default)
    return window


def _branch_window(window: Window, default: Optional[str]) -> None:
    repo, tip, notes = window.repo, window.tip, window.notes
    if default is None:
        notes.append("No default branch was found (origin/HEAD, main or master), so the branch window has no base.")
        return
    default_name = default.removeprefix("origin/")
    branch = branch_of(repo, tip.ref)
    if branch == default_name:
        # On the default branch itself the window is the work not yet upstream.
        upstream = f"origin/{default_name}"
        if _try_sha(repo, upstream) is None:
            notes.append(f"{default_name} is the default branch and has no upstream: the branch window is empty. Pick a time window.")
            return
        base_sha = _git(repo, "merge-base", upstream, tip.sha).strip()
        base_ref = upstream
        label = f"{upstream} @ {base_sha[:7]}"
    else:
        try:
            resolved = resolve_auto_base(repo, tip.ref, ResolvedRef(ref=tip.ref, sha=tip.sha, label=tip.sha[:7]))
        except GitError as exc:
            notes.append(f"No base was found for this branch: {exc}")
            return
        base_sha = resolved.sha
        if resolved.pr:
            target = resolved.pr.get("baseRefName") or default_name
            base_ref = f"merge-base({target}, {branch or tip.ref})"
            notes.append(f"The base comes from open PR #{resolved.pr['number']}, which targets {target}.")
        else:
            target = default_name
            base_ref = f"merge-base({default}, {branch or tip.ref})"
        label = f"{target} @ {base_sha[:7]}"
    window.base = Endpoint(base_ref, base_sha, label, _commit_ts(repo, base_sha))
    window.commits = _log(repo, f"{base_sha}..{tip.sha}")[::-1]
    if not window.commits:
        notes.append(f"{branch or tip.ref} has no commits after {label}.")


def _time_window(window: Window, since: int, until: int) -> None:
    """Commits on the ref whose committer time is in [since, until]: one unbroken first-parent run."""
    window.since, window.until = since, until
    listed = _log(window.repo, "-n", str(MAX_LISTED), window.tip.sha)
    run: list[Commit] = []
    for commit in listed:
        if commit.ts > until:
            if run:
                break
            continue
        if commit.ts < since:
            break
        run.append(commit)
    if not run:
        window.notes.append(f"No commits on {window.tip.ref} between {iso(since)} and {iso(until)}.")
        return
    window.commits = run[::-1]
    newest = run[0]
    if newest.sha != window.tip.sha:
        window.tip = Endpoint(newest.sha, newest.sha, newest.short, newest.ts)
        if window.wants_worktree:
            window.wants_worktree = False
            window.notes.append("The working tree is left out: the window ends before the checked-out commit.")
    _base_from_oldest(window)


def _base_from_oldest(window: Window) -> None:
    oldest = window.commits[0]
    if oldest.parents:
        parent = oldest.parents[0]
        window.base = Endpoint(f"{oldest.short}^", parent, parent[:7], _commit_ts(window.repo, parent))
    else:
        window.base = Endpoint("empty tree", None, "before the first commit", None)
        window.notes.append(_ROOT_NOTE)


def _trim(window: Window, boundary: set[str]) -> None:
    commits = window.commits
    # A shallow clone's oldest commits have no parents on disk. Git would diff
    # them against nothing and report the whole repository as added.
    cut = max((i for i, c in enumerate(commits) if c.sha in boundary), default=-1)
    if cut >= 0:
        edge = commits[cut]
        window.commits = commits = commits[cut + 1 :]
        window.base = Endpoint(edge.sha, edge.sha, edge.short, edge.ts)
        if _ROOT_NOTE in window.notes:
            window.notes.remove(_ROOT_NOTE)
        window.notes.append(f"The window starts at {edge.short}, the oldest commit this shallow clone holds.")
    if len(commits) > MAX_COMMITS:
        total = len(commits)
        window.commits = commits[-MAX_COMMITS:]
        _base_from_oldest(window)
        window.notes.append(
            f"The window holds {total} commits. Only the newest {MAX_COMMITS} are read, so the base moved to {window.base.label}."
        )


def _mark_upstream_merges(window: Window, default: Optional[str]) -> None:
    merges = [c for c in window.commits if len(c.parents) > 1]
    if not merges:
        return
    repo = window.repo
    if default:
        for commit in merges:
            # A merge that is on the default branch itself (a merged PR) is that branch's own history.
            commit.upstream_merge = not _is_ancestor(repo, commit.sha, default) and all(
                _is_ancestor(repo, parent, default) for parent in commit.parents[1:]
            )
    upstream = [c for c in merges if c.upstream_merge]
    counted = len(merges) - len(upstream)
    if counted:
        window.notes.append(
            f"{counted} merge commit{'s' if counted != 1 else ''} in the window: each counts once, as its diff against its first parent."
        )
    if upstream:
        names = ", ".join(c.short for c in upstream)
        window.notes.append(
            f"{names} merged {default} into this branch. Those upstream changes are not counted as work on this branch."
        )
        _apply_upstream(window, upstream)


def _apply_upstream(window: Window, upstream: list[Commit]) -> None:
    """Move the base forward over each upstream merge, so "before" holds what the merge brought in.

    The base tree takes the merge's own diff (first parent to merge) through a
    three-way merge. Git writes the merged tree to the object store; no ref changes.
    """
    repo, base = window.repo, window.base.sha
    tree = window.base_tree
    for commit in upstream:
        if base and all(_is_ancestor(repo, parent, base) for parent in commit.parents[1:]):
            continue  # The base already holds this merge (a branch window).
        try:
            tree = _git(repo, "merge-tree", "--write-tree", f"--merge-base={commit.parents[0]}", tree, commit.sha).split()[0]
        except (GitError, IndexError):
            window.notes.append(
                f"The changes of {commit.short} overlap this branch's own edits and could not be set apart: "
                "before values and net lines can include upstream changes."
            )
            return
    if tree != window.base_tree:
        window.upstream_tree = tree
        window.notes.append(f"Before values are read from {window.base.label} with those upstream changes applied.")
