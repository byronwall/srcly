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
AUTO = "auto"
"""Base pseudo-ref that follows the head: its open PR's base, else the merge-base with the default branch."""
PR_REF = re.compile(r"^(?:pr:|#)(\d+)$")
"""``pr:<n>`` (or ``#<n>``): a GitHub PR. Head side is its head commit; base side is its merge-base."""
WORKTREE_PREFIX = "worktree:"
"""``worktree:<path>``: the files on disk in another worktree of this repo (head only)."""

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
    dir: Optional[Path] = None
    """For a working-tree side: the worktree scanned (None = the repo itself)."""

    def root(self, repo: Path) -> Path:
        """Where this side's files live on disk when it is a working tree."""
        return self.dir or repo

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


def run_git(repo: Path, *args: str, input: Optional[str] = None) -> str:
    try:
        proc = subprocess.run(
            ["git", "-c", "core.quotepath=off", *args],
            cwd=repo,
            input=input,
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
    if ref.startswith(WORKTREE_PREFIX):
        if side == "base":
            raise GitError("A worktree can only be the head side (its files on disk are not a commit)")
        return _resolve_worktree(repo, ref)
    target = ref
    if ref == MERGE_BASE:
        target = run_git(repo, "merge-base", default_branch(repo), "HEAD").strip()
    sha = run_git(repo, "rev-parse", "--verify", f"{target}^{{commit}}").strip()
    subject = run_git(repo, "log", "-1", "--format=%s", sha).strip()
    return ResolvedRef(ref=ref, sha=sha, label=sha[:7], subject=subject)


def _resolve_worktree(repo: Path, ref: str) -> ResolvedRef:
    """``worktree:<path>``: must be a worktree of this same repository (shared object store)."""
    raw = ref[len(WORKTREE_PREFIX) :]
    path = Path(raw).expanduser()
    if not path.is_dir():
        raise GitError(f"Worktree not found: {raw}")
    try:
        top = Path(run_git(path, "rev-parse", "--show-toplevel").strip()).resolve()
        common = Path(run_git(top, "rev-parse", "--path-format=absolute", "--git-common-dir").strip()).resolve()
        ours = Path(run_git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir").strip()).resolve()
    except GitError as exc:
        raise GitError(f"{raw} is not a git worktree: {exc}") from exc
    if common != ours:
        raise GitError(f"{raw} is a worktree of a different repository")
    if top == repo.resolve():
        return ResolvedRef(ref=ref, sha=None, label="working tree")
    try:
        branch = run_git(top, "symbolic-ref", "--quiet", "--short", "HEAD").strip()
    except GitError:
        branch = ""
    label = branch or f"detached {run_git(top, 'rev-parse', '--short', 'HEAD').strip()}"
    home = str(Path.home())
    shown = "~" + str(top)[len(home) :] if str(top).startswith(home + "/") else str(top)
    return ResolvedRef(ref=ref, sha=None, label=label, subject=f"files on disk in {shown}", dir=top)


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
        sha = _pr_merge_base(repo, pr, head_sha)
        label = sha[:7]
        subject = run_git(repo, "log", "-1", "--format=%s", sha).strip()
    return ResolvedRef(ref=ref, sha=sha, label=label, subject=subject, pr=pr_context(pr))


def _pr_merge_base(repo: Path, pr: dict[str, Any], head_sha: str) -> str:
    """merge-base of the PR's base branch tip (GitHub's, else local names) and ``head_sha``."""
    base_name = pr.get("baseRefName") or ""
    for candidate in (pr.get("baseRefOid") or "", f"origin/{base_name}", base_name):
        if not candidate:
            continue
        try:
            return run_git(repo, "merge-base", candidate, head_sha).strip()
        except GitError:
            continue
    raise GitError(f"Could not find PR #{pr.get('number')}'s base branch {base_name!r} locally")


def branch_of(repo: Path, ref: str) -> Optional[str]:
    """The branch name ``ref`` names (``feature``, ``origin/feature``), or None for a SHA, tag or expression."""
    if ref in (WORKTREE, "HEAD"):
        try:
            name = run_git(repo, "symbolic-ref", "--quiet", "--short", "HEAD").strip()
            return name or None
        except GitError:
            return None
    try:
        full = run_git(repo, "rev-parse", "--symbolic-full-name", ref).strip()
    except GitError:
        return None
    if full.startswith("refs/heads/"):
        return full[len("refs/heads/") :]
    if full.startswith("refs/remotes/"):
        # origin/feature -> feature
        return full[len("refs/remotes/") :].partition("/")[2] or None
    return None


def resolve_auto_base(repo: Path, head_input: str, head: ResolvedRef, branch: Optional[str] = None) -> ResolvedRef:
    """
    The base for ``auto``: a PR head uses its PR base; a branch with an open
    PR uses that PR's base (so stacked branches show only their own changes);
    anything else uses the merge-base with the default branch. ``gh`` being
    unavailable just means no PR is found.
    """
    match = PR_REF.match(head_input.strip())
    if match:
        return resolve_ref(repo, head_input, side="base")
    head_commit = head.sha or run_git(head.root(repo), "rev-parse", "HEAD").strip()
    if head.dir is not None:
        branch = branch or branch_of(head.dir, WORKTREE)
    branch = branch or branch_of(repo, head_input)
    pr = None
    if branch:
        from app.services.compare import github

        try:
            pr = github.pr_for_branch(repo, branch)
        except github.GhUnavailable:
            pr = None
    if pr is not None:
        sha = _pr_merge_base(repo, pr, head_commit)
    else:
        sha = run_git(repo, "merge-base", default_branch(repo), head_commit).strip()
    subject = run_git(repo, "log", "-1", "--format=%s", sha).strip()
    return ResolvedRef(ref=AUTO, sha=sha, label=sha[:7], subject=subject, pr=pr_context(pr) if pr else None)


MAX_COMMITS = 100


def list_commits(repo: Path, base: ResolvedRef, head: ResolvedRef, limit: int = MAX_COMMITS) -> dict[str, Any]:
    """
    First-parent commits in ``base..head``, oldest first, for stepping through
    a PR or range, each with its first parent: a step compares a commit with
    its parent. That is the previous commit in the list, except for the first
    one when the branch merged its base in later (its parent predates ``base``).
    A working-tree head lists up to its HEAD commit. Only the newest ``limit``
    are kept.
    """
    if base.sha is None:
        raise GitError("The base side must be a commit")
    head_sha = head.sha or run_git(head.root(repo), "rev-parse", "HEAD").strip()
    raw = run_git(
        repo,
        "log",
        "--first-parent",
        "--reverse",
        "--format=%H%x00%h%x00%s%x00%an%x00%ct%x00%P",
        f"{base.sha}..{head_sha}",
    )
    commits = []
    for line in raw.splitlines():
        sha, short, subject, author, date, parents = (line.split("\0") + [""] * 6)[:6]
        commits.append(
            {
                "sha": sha,
                "short": short,
                "subject": subject,
                "author": author,
                "date": int(date) if date.isdigit() else 0,
                "parent": parents.split(" ")[0] or None,
            }
        )
    return {"commits": commits[-limit:], "total": len(commits), "truncated": len(commits) > limit}


_STATUS = {"A": "added", "D": "removed", "M": "modified", "T": "modified", "R": "renamed", "C": "added"}


def list_changes(repo: Path, base: ResolvedRef, head: ResolvedRef) -> list[FileChange]:
    """
    Files that differ between ``base`` and ``head``, with rename detection and
    line counts. A working-tree head also counts untracked (non-ignored) files.
    """
    if base.sha is None:
        raise GitError("The base side must be a commit")
    range_args = [base.sha] if head.sha is None else [base.sha, head.sha]
    # A working-tree head diffs from inside that worktree; the object store is shared.
    repo = head.root(repo) if head.sha is None else repo

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
