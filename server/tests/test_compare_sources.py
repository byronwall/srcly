"""Picker sources: worktrees, branches, PRs with local context, the `auto` base, and the API."""

import os
import shutil
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.compare import github, snapshots
from app.services.compare.service import build_compare
from app.services.compare.sources import load_source, parse_worktrees
from tests.test_compare_github import _fresh_gh_cache, fake_gh, stacked  # noqa: F401 - fixtures
from tests.test_compare_snapshots import _git, _write, repo  # noqa: F401 - fixtures


def _commit_at(cwd: Path, message: str, when: str) -> None:
    env = {**os.environ, "GIT_COMMITTER_DATE": when, "GIT_AUTHOR_DATE": when}
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", message],
        cwd=cwd,
        env=env,
        check=True,
    )


def test_parse_worktrees_porcelain():
    raw = (
        "worktree /a\nHEAD 111\nbranch refs/heads/main\n\n"
        "worktree /b\nHEAD 222\ndetached\nlocked reason\n\n"
        "worktree /c\nHEAD 333\nbranch refs/heads/gone\nprunable gitdir file points to non-existent location\n"
    )
    entries = parse_worktrees(raw)
    assert [(e["path"], e["branch"], e["detached"], e["locked"], e["prunable"]) for e in entries] == [
        ("/a", "main", False, False, False),
        ("/b", None, True, True, False),
        ("/c", "gone", False, False, True),
    ]


def test_worktrees_are_live_newest_first_and_skip_snapshots(repo: Path, tmp_path: Path):  # noqa: F811
    newer = tmp_path / "wt-newer"
    gone = tmp_path / "wt-gone"
    _git(repo, "worktree", "add", "-q", "-b", "newer", str(newer), "main")
    _commit_at(newer, "newer work", "2030-01-01T00:00:00")
    _git(repo, "worktree", "add", "-q", "-b", "gone", str(gone), "main")
    shutil.rmtree(gone)  # now prunable
    snap = snapshots.snapshots_dir() / "leftover"
    snap.parent.mkdir(parents=True, exist_ok=True)
    _git(repo, "worktree", "add", "-q", "--detach", str(snap), "main")

    section = load_source(repo, "worktrees")
    assert section["available"] is True
    items = section["items"]
    assert [w["branch"] for w in items] == ["newer", "feature"]
    assert items[0]["subject"] == "newer work"
    assert [w["current"] for w in items] == [False, True]
    _git(repo, "worktree", "remove", "--force", str(snap))


def test_branches_have_ahead_behind_against_default(repo: Path):  # noqa: F811
    section = load_source(repo, "branches")
    assert section["defaultBranch"] == "main"
    by_name = {b["name"]: b for b in section["items"]}
    assert (by_name["feature"]["ahead"], by_name["feature"]["behind"]) == (1, 0)
    assert by_name["feature"]["worktree"] == str(repo)
    assert by_name["main"]["remote"] is False


def test_remote_branches_listed_without_origin_head(stacked):  # noqa: F811
    work = stacked["work"]
    _git(work, "remote", "set-head", "origin", "main")
    _commit_at(work, "local only", "2030-01-01T00:00:00")  # stack-2 is now ahead of origin/stack-2
    names = {b["name"]: b for b in load_source(work, "branches")["items"]}
    assert "origin/stack-2" in names and names["origin/stack-2"]["remote"] is True
    assert names["stack-2"]["pushed"] is False
    # origin/stack-1 is the same commit as stack-1: folded into it.
    assert "origin/stack-1" not in names and names["stack-1"]["pushed"] is True
    assert "origin/HEAD" not in names and "origin" not in names


def test_prs_carry_local_and_worktree_context(fake_gh, stacked):  # noqa: F811
    work, local = stacked["work"], stacked["local"]
    in_work = {p["number"]: p for p in load_source(work, "prs")["items"]}
    assert in_work[2]["local"] is True
    assert in_work[2]["worktree"] == str(work)  # stack-2 is checked out there
    assert in_work[2]["checks"] == "pending"
    assert in_work[2]["isDraft"] is True
    in_local = {p["number"]: p for p in load_source(local, "prs")["items"]}
    assert in_local[2]["local"] is False  # needs fetch
    assert in_local[2]["worktree"] is None


def test_prs_unavailable_reports_reason(monkeypatch, repo: Path):  # noqa: F811
    def offline(*_a, **_k):
        raise github.GhUnavailable("GitHub is unreachable (offline?)")

    monkeypatch.setattr(github, "run_gh", offline)
    github.clear_cache()
    section = load_source(repo, "prs")
    assert section == {
        "kind": "prs",
        "available": False,
        "reason": "GitHub is unreachable (offline?)",
        "items": [],
        "mine": True,
    }


def test_auto_base_uses_the_branch_pr_base(fake_gh, stacked):  # noqa: F811
    payload = build_compare(stacked["work"], "auto", "stack-2")
    assert [f["path"] for f in payload["files"]] == ["pkg/two.py"]
    assert payload["base"]["pr"]["number"] == 2


def test_auto_base_without_gh_falls_back_to_merge_base(monkeypatch, stacked):  # noqa: F811
    def missing(*_a, **_k):
        raise github.GhUnavailable("gh is not installed")

    monkeypatch.setattr(github, "run_gh", missing)
    payload = build_compare(stacked["work"], "auto", "stack-2")
    assert [f["path"] for f in payload["files"]] == ["pkg/core.py", "pkg/one.py", "pkg/two.py"]
    assert "pr" not in payload["base"]


def test_sources_api(repo: Path, monkeypatch):  # noqa: F811
    monkeypatch.setattr(github, "run_gh", lambda *_a, **_k: [])
    client = TestClient(app)
    res = client.get("/api/compare/sources", params={"kind": "worktrees", "path": str(repo)})
    assert res.status_code == 200
    assert res.json()["items"][0]["branch"] == "feature"
    prs = client.get("/api/compare/sources", params={"kind": "prs", "path": str(repo), "all": True}).json()
    assert (prs["available"], prs["mine"], prs["items"]) == (True, False, [])
    assert client.get("/api/compare/sources", params={"kind": "nope", "path": str(repo)}).status_code == 400
