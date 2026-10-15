"""
What the compare picker can pick: open PRs, live worktrees, and branches.

Each kind loads on its own so the git kinds answer immediately while ``gh``
is still talking to GitHub. A kind that can't load reports why instead of
failing the picker.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from app.services.compare import github
from app.services.compare.git_refs import GitError, default_branch, run_git
from app.services.compare.snapshots import snapshots_dir

MAX_BRANCHES = 300


def _commit_info(repo: Path, shas: list[str]) -> dict[str, tuple[int, str]]:
    """``sha -> (committer unix time, subject)`` for many commits in one git call."""
    unique = sorted(set(filter(None, shas)))
    if not unique:
        return {}
    out: dict[str, tuple[int, str]] = {}
    try:
        raw = run_git(repo, "show", "-s", "--no-notes", "--format=%H%x00%ct%x00%s", *unique)
    except GitError:
        return out
    for line in raw.splitlines():
        parts = line.split("\0")
        if len(parts) == 3 and parts[1].isdigit():
            out[parts[0]] = (int(parts[1]), parts[2])
    return out


def parse_worktrees(porcelain: str) -> list[dict[str, Any]]:
    """Entries of ``git worktree list --porcelain``, in git's order."""
    entries: list[dict[str, Any]] = []
    current: Optional[dict[str, Any]] = None
    for line in porcelain.splitlines():
        if not line:
            current = None
            continue
        key, _, value = line.partition(" ")
        if key == "worktree":
            current = {"path": value, "sha": None, "branch": None, "detached": False}
            current.update(bare=False, locked=False, prunable=False)
            entries.append(current)
        elif current is None:
            continue
        elif key == "HEAD":
            current["sha"] = value
        elif key == "branch":
            current["branch"] = value.removeprefix("refs/heads/")
        elif key in ("detached", "bare", "locked", "prunable"):
            current[key] = True
    return entries


def list_worktrees(repo: Path) -> list[dict[str, Any]]:
    """Live worktrees, newest HEAD commit first. Prunable, bare and srcly's own snapshot checkouts are dropped."""
    snapshots = str(snapshots_dir().resolve())
    entries = [
        e
        for e in parse_worktrees(run_git(repo, "worktree", "list", "--porcelain"))
        if not (e["prunable"] or e["bare"] or not e["sha"])
        and not e["path"].startswith(snapshots)
        and Path(e["path"]).is_dir()
    ]
    info = _commit_info(repo, [e["sha"] for e in entries])
    current = str(repo.resolve())
    items = []
    for e in entries:
        date, subject = info.get(e["sha"], (0, ""))
        items.append(
            {
                "path": e["path"],
                "branch": e["branch"],
                "sha": e["sha"],
                "date": date,
                "subject": subject,
                "locked": e["locked"],
                "current": str(Path(e["path"]).resolve()) == current,
            }
        )
    items.sort(key=lambda w: w["date"], reverse=True)
    return items


def list_branches(repo: Path) -> dict[str, Any]:
    """Local and remote branches, newest commit first, with ahead/behind against the default branch."""
    try:
        default = default_branch(repo)
    except GitError:
        default = None
    fields = [
        "%(refname)",
        "%(refname:short)",
        "%(objectname)",
        "%(committerdate:unix)",
        "%(subject)",
        "%(upstream:short)",
        "%(worktreepath)",
    ]
    track = f"%(ahead-behind:{default})" if default else ""
    fmt = "%00".join(fields + ([track] if track else []))
    args = ["for-each-ref", "--sort=-committerdate", f"--count={MAX_BRANCHES}", f"--format={fmt}"]
    try:
        raw = run_git(repo, *args, "refs/heads", "refs/remotes")
    except GitError:
        # git < 2.41 has no %(ahead-behind); list without counts.
        raw = run_git(repo, *args[:-1], "--format=" + "%00".join(fields), "refs/heads", "refs/remotes")
    items = []
    for line in raw.splitlines():
        parts = line.split("\0")
        refname, name, sha, date, subject, upstream, worktree = parts[:7]
        if refname.startswith("refs/remotes/") and refname.endswith("/HEAD"):
            continue
        ahead = behind = None
        if len(parts) > 7 and parts[7]:
            a, _, b = parts[7].partition(" ")
            ahead, behind = (int(a), int(b)) if a.isdigit() and b.isdigit() else (None, None)
        items.append(
            {
                "name": name,
                "remote": refname.startswith("refs/remotes/"),
                "sha": sha,
                "date": int(date) if date.isdigit() else 0,
                "subject": subject,
                "upstream": upstream or None,
                "pushed": False,
                "worktree": worktree or None,
                "ahead": ahead,
                "behind": behind,
            }
        )
    # A remote branch at the same commit as its local branch adds nothing but a
    # second row: fold it into the local one as "pushed".
    local = {b["name"]: b for b in items if not b["remote"]}
    folded = []
    for b in items:
        if b["remote"]:
            twin = local.get(b["name"].partition("/")[2])
            if twin is not None and twin["sha"] == b["sha"]:
                twin["pushed"] = True
                continue
        folded.append(b)
    return {"defaultBranch": default, "items": folded}


def _has_commit(repo: Path, shas: list[str]) -> set[str]:
    """Which of ``shas`` are commits in this repo, in one ``cat-file --batch-check`` call."""
    if not shas:
        return set()
    try:
        raw = run_git(repo, "cat-file", "--batch-check=%(objectname) %(objecttype)", input="\n".join(shas) + "\n")
    except GitError:
        return set()
    return {parts[0] for parts in (line.split() for line in raw.splitlines()) if parts[-1:] == ["commit"]}


def list_pr_sources(repo: Path, mine: bool = True, refresh: bool = False) -> list[dict[str, Any]]:
    """Open PRs with local context: is the head local, and which worktree has its branch."""
    prs = github.list_prs(repo, mine=mine, refresh=refresh)
    local = _has_commit(repo, [p.get("headRefOid", "") for p in prs if p.get("headRefOid")])
    try:
        worktrees = parse_worktrees(run_git(repo, "worktree", "list", "--porcelain"))
    except GitError:
        worktrees = []
    by_branch = {w["branch"]: w["path"] for w in worktrees if w["branch"] and not w["prunable"]}
    items = []
    for pr in prs:
        author = pr.get("author") or {}
        head = pr.get("headRefOid", "")
        items.append(
            {
                "number": pr["number"],
                "title": pr.get("title", ""),
                "url": pr.get("url", ""),
                "headRefName": pr.get("headRefName", ""),
                "baseRefName": pr.get("baseRefName", ""),
                "headRefOid": head,
                "isDraft": bool(pr.get("isDraft")),
                "reviewDecision": pr.get("reviewDecision") or None,
                "checks": github.checks_summary(pr),
                "updatedAt": pr.get("updatedAt"),
                "author": author.get("login", "") if isinstance(author, dict) else "",
                "changedFiles": pr.get("changedFiles"),
                "worktree": by_branch.get(pr.get("headRefName", "")),
                "local": head in local,
                "crossRepository": bool(pr.get("isCrossRepository")),
            }
        )
    return items


def load_source(repo: Path, kind: str, *, mine: bool = True, refresh: bool = False) -> dict[str, Any]:
    """One picker section: ``{kind, available, reason, items, ...}``. Never raises for a missing source."""
    out: dict[str, Any] = {"kind": kind, "available": True, "reason": None, "items": []}
    try:
        if kind == "prs":
            out["mine"] = mine
            out["items"] = list_pr_sources(repo, mine=mine, refresh=refresh)
        elif kind == "worktrees":
            out["items"] = list_worktrees(repo)
        elif kind == "branches":
            out.update(list_branches(repo))
        else:
            raise ValueError(f"Unknown source kind: {kind}")
    except github.GhUnavailable as exc:
        out.update(available=False, reason=exc.reason)
    except GitError as exc:
        out.update(available=False, reason=str(exc))
    return out
