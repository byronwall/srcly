"""Commit stepping: listing a PR's commits, per-commit compares, one new side per step, pre-warm."""

import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.compare import jobs, snapshots
from app.services.compare.git_refs import list_commits, resolve_ref
from app.services.compare.service import build_compare
from tests.test_compare_github import _fresh_gh_cache, fake_gh, stacked  # noqa: F401 - fixtures


def test_pr_commits_are_first_parent_oldest_first(fake_gh, stacked):  # noqa: F811
    repo = stacked["work"]
    listing = list_commits(repo, resolve_ref(repo, "pr:2", side="base"), resolve_ref(repo, "pr:2"))
    assert [c["subject"] for c in listing["commits"]] == ["stack 2a", "stack 2b"]
    assert listing["total"] == 2 and listing["truncated"] is False
    first, second = listing["commits"]
    assert first["parent"] == stacked["prs"][2]["baseRefOid"] and second["parent"] == first["sha"]
    capped = list_commits(repo, resolve_ref(repo, "main"), resolve_ref(repo, "stack-2"), limit=2)
    assert [c["subject"] for c in capped["commits"]] == ["stack 2a", "stack 2b"]
    assert capped["total"] == 3 and capped["truncated"] is True


def test_commits_api_resolves_pr_base(fake_gh, stacked):  # noqa: F811
    client = TestClient(app)
    res = client.get("/api/compare/commits", params={"path": str(stacked["work"]), "base": "pr:2", "head": "pr:2"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["base"]["sha"] == stacked["prs"][2]["baseRefOid"]
    assert [c["subject"] for c in data["commits"]] == ["stack 2a", "stack 2b"]
    bad = client.get("/api/compare/commits", params={"path": str(stacked["work"]), "base": "nope", "head": "pr:2"})
    assert bad.status_code == 400


def test_each_step_shows_only_that_commit_and_scans_one_new_side(fake_gh, stacked, monkeypatch):  # noqa: F811
    repo = stacked["work"]
    base = resolve_ref(repo, "pr:2", side="base").sha
    listing = list_commits(repo, resolve_ref(repo, base), resolve_ref(repo, "pr:2"))["commits"]
    c = [x["sha"] for x in listing]
    assert listing[0]["parent"] == base

    first = build_compare(repo, base, c[0])
    assert [f["path"] for f in first["files"]] == ["pkg/two.py"]
    assert first["files"][0]["status"] == "added"

    scans: list[str] = []
    real = snapshots._scan_commit
    monkeypatch.setattr(snapshots, "_scan_commit", lambda r, ref, *a, **k: scans.append(ref.sha) or real(r, ref, *a, **k))
    second = build_compare(repo, c[0], c[1])
    assert [f["path"] for f in second["files"]] == ["pkg/two.py"]
    assert second["files"][0]["status"] == "modified"
    assert second["base"]["cached"] is True
    assert scans == [c[1]]  # the previous step's head is a cache hit


def test_concurrent_loads_of_one_commit_scan_once(stacked, monkeypatch):  # noqa: F811
    repo = stacked["work"]
    ref = resolve_ref(repo, "stack-1")
    scans = []
    real = snapshots._scan_commit

    def slow(*args, **kwargs):
        scans.append(1)
        time.sleep(0.2)
        return real(*args, **kwargs)

    monkeypatch.setattr(snapshots, "_scan_commit", slow)
    threads = [threading.Thread(target=snapshots.load_side, args=(repo, ref)) for _ in range(3)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(scans) == 1


def test_prewarm_caches_the_next_commit(stacked):  # noqa: F811
    repo = stacked["work"]
    client = TestClient(app)
    ref = resolve_ref(repo, "stack-2")
    assert not snapshots.is_cached(repo, ref)
    res = client.post("/api/compare/prewarm", json={"path": str(repo), "ref": "stack-2"})
    assert res.status_code == 202 and res.json()["state"] in {"started", "running"}
    deadline = time.monotonic() + 30
    while not snapshots.is_cached(repo, ref) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert snapshots.is_cached(repo, ref)
    assert client.post("/api/compare/prewarm", json={"path": str(repo), "ref": "stack-2"}).json()["state"] == "cached"
    assert client.post("/api/compare/prewarm", json={"path": str(repo), "ref": "WORKTREE"}).status_code == 400
    assert not jobs.manager.busy()


def test_first_step_uses_its_parent_when_base_was_merged_in_later(stacked):  # noqa: F811
    """A branch that merged main after its first commit: base..head's first commit predates the merge-base."""
    from tests.test_compare_snapshots import _git, _write

    work = stacked["work"]
    _git(work, "checkout", "-q", "-b", "late", "main")
    _write(work / "pkg" / "late.py", "x = 1\n")
    _git(work, "add", "-A")
    _git(work, "commit", "-q", "-m", "late 1")
    first = _git(work, "rev-parse", "HEAD").strip()
    _git(work, "checkout", "-q", "main")
    _write(work / "pkg" / "mainline.py", "y = 1\n")
    _git(work, "add", "-A")
    _git(work, "commit", "-q", "-m", "main moves")
    _git(work, "checkout", "-q", "late")
    _git(work, "merge", "-q", "--no-edit", "main")
    base = resolve_ref(work, "main")  # == merge-base(main, late), newer than late's first commit's parent
    commits = list_commits(work, base, resolve_ref(work, "late"))["commits"]
    assert commits[0]["sha"] == first
    assert commits[0]["parent"] != base.sha
    step = build_compare(work, commits[0]["parent"], first)
    assert [f["path"] for f in step["files"]] == ["pkg/late.py"]
