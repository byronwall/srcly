"""Ref resolution and change listing via the git CLI."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

WORKTREE = "WORKTREE"
"""Pseudo-ref for the files on disk, including uncommitted and untracked edits."""
MERGE_BASE = "merge-base"
"""Pseudo-ref for ``git merge-base <default branch> HEAD``."""
PR_REF = re.compile(r"^(?:pr:|#)(\d+)$")
"""``pr:<n>`` (or ``#<n>``): a GitHub PR. Head side is its head commit; base side is its merge-base."""

ChangeStatus = Literal["added", "removed", "modified", "renamed"]


class GitError(RuntimeError):
    pass


@dataclass(frozen=True)
class ResolvedRef:
    ref: str
    """What the user asked for (``main``, ``HEAD~2``, ``WORKTREE``, ...)."""
    sha: Optional[str]
    """Full commit SHA, or None for the working tree."""
    label: str
    """Short display name: ``abc1234`` or ``working tree``."""
    subject: str = ""
    pr: Optional[dict[str, Any]] = field(default=None, compare=False, hash=False)
    """PR context (number, title, url, branches, author) for a ``pr:<n>`` ref."""

    @property
    def is_worktree(self) -> bool:
        return self.sha is None


@dataclass(frozen=True)
class FileChange:
    path: str
    """Repo-relative path on the head side (the old path for removals)."""
    status: ChangeStatus
    old_path: Optional[str] = None
    """Repo-relative path on the base side when it differs (renames)."""
    additions: int = 0
    deletions: int = 0

    @property
    def base_path(self) -> Optional[str]:
        if self.status == "added":
            return None
        return self.old_path or self.path

    @property
    def head_path(self) -> Optional[str]:
        return None if self.status == "removed" else self.path


def run_git(repo: Path, *args: str) -> str:
    try:
        proc = subprocess.run(
            ["git", "-c", "core.quotepath=off", *args],
            cwd=repo,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError as exc:
        raise GitError(f"git is not available: {exc}") from exc
    if proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def repo_root(path: Path) -> Path:
    """The top level of the git work tree containing ``path``."""
    start = path if path.is_dir() else path.parent
    return Path(run_git(start, "rev-parse", "--show-toplevel").strip()).resolve()


def default_branch(repo: Path) -> str:
    """``origin/HEAD``'s branch if set, else the first of main/master that exists."""
    try:
        ref = run_git(repo, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD").strip()
        if ref:
            return ref
    except GitError:
        pass
    for name in ("main", "master"):
        try:
            run_git(repo, "rev-parse", "--verify", "--quiet", f"{name}^{{commit}}")
            return name
        except GitError:
            continue
    raise GitError("Could not find a default branch (origin/HEAD, main, or master)")


Side = Literal["base", "head"]


def resolve_ref(repo: Path, ref: str, side: Side = "head") -> ResolvedRef:
    """
    Resolve ``ref`` to a commit (or the working tree). ``side`` matters only for
    ``pr:<n>``: the head side is the PR's head commit, the base side is the
    merge-base of the PR's own base branch and that head, as GitHub diffs it.
    """
    if ref == WORKTREE:
        return ResolvedRef(ref=ref, sha=None, label="working tree")
    match = PR_REF.match(ref.strip())
    if match:
        return _resolve_pr(repo, ref, int(match.group(1)), side)
    target = ref
    if ref == MERGE_BASE:
        target = run_git(repo, "merge-base", default_branch(repo), "HEAD").strip()
    sha = run_git(repo, "rev-parse", "--verify", f"{target}^{{commit}}").strip()
    subject = run_git(repo, "log", "-1", "--format=%s", sha).strip()
    return ResolvedRef(ref=ref, sha=sha, label=sha[:7], subject=subject)


def _has_commit(repo: Path, sha: str) -> bool:
    try:
        run_git(repo, "cat-file", "-e", f"{sha}^{{commit}}")
        return True
    except GitError:
        return False


def _fetch_objects(repo: Path, *refspecs: str) -> None:
    """
    Fetch commits from ``origin`` without touching any ref: no branch, no
    remote-tracking ref (``--refmap=``), no FETCH_HEAD, no tags. Objects only.
    """
    run_git(
        repo,
        "fetch",
        "--quiet",
        "--no-tags",
        "--no-write-fetch-head",
        "--refmap=",
        "origin",
        *refspecs,
    )


def pr_context(pr: dict[str, Any]) -> dict[str, Any]:
    author = pr.get("author") or {}
    return {
        "number": pr["number"],
        "title": pr.get("title", ""),
        "url": pr.get("url", ""),
        "headRefName": pr.get("headRefName", ""),
        "baseRefName": pr.get("baseRefName", ""),
        "author": author.get("login", "") if isinstance(author, dict) else str(author),
        "isDraft": bool(pr.get("isDraft")),
        "changedFiles": pr.get("changedFiles"),
    }


def _resolve_pr(repo: Path, ref: str, number: int, side: Side) -> ResolvedRef:
    from app.services.compare import github

    try:
        pr = github.pr_info(repo, number)
    except github.GhUnavailable as exc:
        raise GitError(f"Could not read PR #{number}: {exc.reason}") from exc

    head_sha = pr.get("headRefOid") or ""
    base_name = pr.get("baseRefName") or ""
    base_oid = pr.get("baseRefOid") or ""
    if not head_sha:
        raise GitError(f"PR #{number} has no head commit")

    missing = [s for s in (head_sha, base_oid) if s and not _has_commit(repo, s)]
    if missing:
        specs = []
        if head_sha in missing:
            specs.append(f"refs/pull/{number}/head")
        if base_oid in missing and base_name:
            specs.append(f"refs/heads/{base_name}")
        try:
            _fetch_objects(repo, *specs)
        except GitError as exc:
            if not _has_commit(repo, head_sha):
                raise GitError(f"PR #{number}'s head {head_sha[:7]} is not local and could not be fetched: {exc}") from exc
    if not _has_commit(repo, head_sha):
        raise GitError(f"PR #{number}'s head {head_sha[:7]} is not available locally")

    if side == "head":
        # The PR title says more than the head commit's subject.
        sha = head_sha
        label = f"#{number}"
        subject = pr.get("title", "")
    else:
        # GitHub diffs a PR against merge-base(base branch tip, head). The tip
        # GitHub reports is exact; local branch names are fallbacks for when
        # that commit can't be fetched.
        sha = ""
        for candidate in (base_oid, f"origin/{base_name}", base_name):
            if not candidate:
                continue
            try:
                sha = run_git(repo, "merge-base", candidate, head_sha).strip()
                break
            except GitError:
                continue
        if not sha:
            raise GitError(f"Could not find PR #{number}'s base branch {base_name!r} locally")
        label = sha[:7]
        subject = run_git(repo, "log", "-1", "--format=%s", sha).strip()
    return ResolvedRef(ref=ref, sha=sha, label=label, subject=subject, pr=pr_context(pr))


_STATUS = {"A": "added", "D": "removed", "M": "modified", "T": "modified", "R": "renamed", "C": "added"}


def list_changes(repo: Path, base: ResolvedRef, head: ResolvedRef) -> list[FileChange]:
    """
    Files that differ between ``base`` and ``head``, with rename detection and
    line counts. A working-tree head also counts untracked (non-ignored) files.
    """
    if base.sha is None:
        raise GitError("The base side must be a commit")
    range_args = [base.sha] if head.sha is None else [base.sha, head.sha]

    name_status = run_git(repo, "diff", "-z", "--name-status", "-M", *range_args)
    numstat = run_git(repo, "diff", "-z", "--numstat", "-M", *range_args)
    lines = _parse_numstat(numstat)

    changes: list[FileChange] = []
    tokens = name_status.split("\0")
    i = 0
    while i < len(tokens) and tokens[i]:
        code = tokens[i]
        kind = code[0]
        if kind in ("R", "C"):
            old, new = tokens[i + 1], tokens[i + 2]
            i += 3
        else:
            old = new = tokens[i + 1]
            i += 2
        status = _STATUS.get(kind)
        if status is None:  # unmerged / unknown
            continue
        adds, dels = lines.get(new, lines.get(old, (0, 0)))
        if status == "renamed":
            changes.append(FileChange(path=new, status="renamed", old_path=old, additions=adds, deletions=dels))
        elif status == "added" and kind == "C":
            changes.append(FileChange(path=new, status="added", additions=adds, deletions=dels))
        else:
            changes.append(FileChange(path=new, status=status, additions=adds, deletions=dels))

    if head.sha is None:
        untracked = run_git(repo, "ls-files", "-z", "--others", "--exclude-standard")
        for path in filter(None, untracked.split("\0")):
            changes.append(FileChange(path=path, status="added", additions=_count_lines(repo / path)))

    changes.sort(key=lambda c: c.path)
    return changes


def _parse_numstat(raw: str) -> dict[str, tuple[int, int]]:
    """``--numstat -z``: ``adds\\tdels\\tpath\\0`` or, for renames, ``adds\\tdels\\t\\0old\\0new\\0``."""
    out: dict[str, tuple[int, int]] = {}
    tokens = raw.split("\0")
    i = 0
    while i < len(tokens) and tokens[i]:
        adds, dels, path = tokens[i].split("\t", 2)
        counts = (_int(adds), _int(dels))
        if path == "":
            out[tokens[i + 2]] = counts
            i += 3
        else:
            out[path] = counts
            i += 1
    return out


def _int(value: str) -> int:
    # Binary files report "-".
    return int(value) if value.isdigit() else 0


def _count_lines(path: Path) -> int:
    try:
        with open(path, "rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0
