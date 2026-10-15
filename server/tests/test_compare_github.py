"""PR refs through the gh seam: run_gh failures, list caching, pr:<n> resolution incl. stacked PRs and fetches."""

import subprocess
from pathlib import Path

import pytest

from app.services.compare import github
from app.services.compare.git_refs import GitError, list_changes, resolve_ref
from app.services.compare.service import build_compare
from tests.test_compare_snapshots import _git, _write


@pytest.fixture(autouse=True)
def _fresh_gh_cache():
    github.clear_cache()
    yield
    github.clear_cache()


def _sha(repo: Path, ref: str) -> str:
    return _git(repo, "rev-parse", ref).strip()


@pytest.fixture
def stacked(tmp_path: Path) -> dict:
    """
    ``origin`` (bare) with main → stack-1 (PR #1, base main) → stack-2 (PR #2, base stack-1),
    plus ``refs/pull/<n>/head`` refs the way GitHub publishes them, and a local
    clone that has only ``main``.
    """
    origin = tmp_path / "origin.git"
    _git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    work = tmp_path / "author"
    _git(tmp_path, "clone", "-q", str(origin), str(work))
    _git(work, "checkout", "-q", "-b", "main")
    _write(work / "pkg" / "__init__.py", "")
    _write(work / "pkg" / "core.py", "def f():\n    return 1\n")
    _git(work, "add", "-A")
    _git(work, "commit", "-q", "-m", "base")
    _git(work, "checkout", "-q", "-b", "stack-1")
    _write(work / "pkg" / "one.py", "def one():\n    return 1\n")
    _write(work / "pkg" / "core.py", "def f():\n    return 2\n")
    _git(work, "add", "-A")
    _git(work, "commit", "-q", "-m", "stack 1")
    _git(work, "checkout", "-q", "-b", "stack-2")
    _write(work / "pkg" / "two.py", "def two():\n    return 2\n")
    _git(work, "add", "-A")
    _git(work, "commit", "-q", "-m", "stack 2a")
    _write(work / "pkg" / "two.py", "def two():\n    return 22\n")
    _git(work, "commit", "-q", "-am", "stack 2b")
    _git(work, "push", "-q", "origin", "main", "stack-1", "stack-2")
    _git(work, "push", "-q", "origin", "stack-1:refs/pull/1/head", "stack-2:refs/pull/2/head")

    local = tmp_path / "local"
    # file:// forces a real transport; a plain path would hardlink every object.
    _git(tmp_path, "clone", "-q", "--single-branch", "-b", "main", origin.as_uri(), str(local))
    prs = {
        1: {
            "number": 1,
            "title": "First layer",
            "url": "https://github.com/o/r/pull/1",
            "headRefName": "stack-1",
            "baseRefName": "main",
            "headRefOid": _sha(work, "stack-1"),
            "baseRefOid": _sha(work, "main"),
            "isDraft": False,
            "reviewDecision": "",
            "updatedAt": "2026-10-14T10:00:00Z",
            "author": {"login": "me"},
            "statusCheckRollup": [{"conclusion": "SUCCESS"}],
            "changedFiles": 2,
        },
        2: {
            "number": 2,
            "title": "Second layer",
            "url": "https://github.com/o/r/pull/2",
            "headRefName": "stack-2",
            "baseRefName": "stack-1",
            "headRefOid": _sha(work, "stack-2"),
            "baseRefOid": _sha(work, "stack-1"),
            "isDraft": True,
            "reviewDecision": "REVIEW_REQUIRED",
            "updatedAt": "2026-10-15T10:00:00Z",
            "author": {"login": "me"},
            "statusCheckRollup": [{"conclusion": "SUCCESS"}, {"status": "IN_PROGRESS"}],
            "changedFiles": 1,
        },
    }
    return {"origin": origin, "work": work.resolve(), "local": local.resolve(), "prs": prs}


@pytest.fixture
def fake_gh(monkeypatch, stacked):
    calls: list[tuple[str, ...]] = []

    def run_gh(repo, *args, timeout=github.DEFAULT_TIMEOUT):
        calls.append(args)
        if args[:2] == ("pr", "list"):
            prs = list(stacked["prs"].values())
            if "--head" in args:
                branch = args[args.index("--head") + 1]
                prs = [p for p in prs if p["headRefName"] == branch]
            return prs
        if args[:2] == ("pr", "view"):
            return stacked["prs"][int(args[2])]
        raise AssertionError(f"unexpected gh call {args}")

    monkeypatch.setattr(github, "run_gh", run_gh)
    return calls


def _refs_and_state(repo: Path) -> tuple[str, str, str, str, bool]:
    return (
        _git(repo, "for-each-ref", "--format=%(refname) %(objectname)"),
        _git(repo, "rev-parse", "--abbrev-ref", "HEAD"),
        _git(repo, "status", "--porcelain"),
        _git(repo, "stash", "list"),
        (repo / ".git" / "FETCH_HEAD").exists(),
    )


# -- run_gh -------------------------------------------------------------------


def _fake_run(monkeypatch, result=None, raises=None):
    def run(*_args, **_kwargs):
        if raises is not None:
            raise raises
        return result

    monkeypatch.setattr(github.subprocess, "run", run)


def test_run_gh_parses_json(monkeypatch, tmp_path):
    _fake_run(monkeypatch, subprocess.CompletedProcess([], 0, stdout='[{"number": 3}]', stderr=""))
    assert github.run_gh(tmp_path, "pr", "list") == [{"number": 3}]


@pytest.mark.parametrize(
    ("raises", "reason"),
    [
        (FileNotFoundError("gh"), "gh is not installed"),
        (subprocess.TimeoutExpired(["gh"], 10), "gh did not answer within 10s"),
    ],
)
def test_run_gh_missing_or_slow(monkeypatch, tmp_path, raises, reason):
    _fake_run(monkeypatch, raises=raises)
    with pytest.raises(github.GhUnavailable) as err:
        github.run_gh(tmp_path, "pr", "list")
    assert err.value.reason == reason


@pytest.mark.parametrize(
    ("stderr", "reason"),
    [
        ("To get started with GitHub CLI, please run:  gh auth login", "gh is not signed in (run gh auth login)"),
        ("error connecting to api.github.com", "GitHub is unreachable (offline?)"),
        ("no git remotes found", "This repo has no GitHub remote"),
        ("something odd\nmore", "something odd"),
    ],
)
def test_run_gh_nonzero_exit_reasons(monkeypatch, tmp_path, stderr, reason):
    _fake_run(monkeypatch, subprocess.CompletedProcess([], 1, stdout="", stderr=stderr))
    with pytest.raises(github.GhUnavailable) as err:
        github.run_gh(tmp_path, "pr", "list")
    assert err.value.reason == reason


def test_list_prs_is_cached_and_scoped_to_me(fake_gh, stacked):
    repo = stacked["local"]
    prs = github.list_prs(repo)
    assert [p["number"] for p in prs] == [2, 1]  # newest update first
    github.list_prs(repo)
    assert len(fake_gh) == 1
    assert "--author" in fake_gh[0] and "@me" in fake_gh[0]
    github.list_prs(repo, mine=False)
    assert "--author" not in fake_gh[1]
    # A PR in a fresh list needs no `gh pr view`.
    assert github.pr_info(repo, 2)["title"] == "Second layer"
    assert len(fake_gh) == 2


def test_checks_summary(stacked):
    assert github.checks_summary(stacked["prs"][1]) == "pass"
    assert github.checks_summary(stacked["prs"][2]) == "pending"
    assert github.checks_summary({"statusCheckRollup": [{"conclusion": "FAILURE"}]}) == "fail"
    assert github.checks_summary({}) is None


# -- pr:<n> -------------------------------------------------------------------


def test_stacked_pr_shows_only_its_own_changes(fake_gh, stacked):
    repo = stacked["work"]
    base, head = resolve_ref(repo, "pr:2", side="base"), resolve_ref(repo, "pr:2", side="head")
    assert base.sha == _sha(repo, "stack-1")
    assert head.sha == _sha(repo, "stack-2")
    assert (head.label, head.subject) == ("#2", "Second layer")
    assert head.pr["baseRefName"] == "stack-1"
    changes = list_changes(repo, base, head)
    assert [c.path for c in changes] == ["pkg/two.py"]
    assert len(changes) == stacked["prs"][2]["changedFiles"]

    first = list_changes(repo, resolve_ref(repo, "#1", side="base"), resolve_ref(repo, "#1"))
    assert [c.path for c in first] == ["pkg/core.py", "pkg/one.py"]


def test_missing_pr_head_is_fetched_as_objects_only(fake_gh, stacked):
    repo = stacked["local"]
    head_sha = stacked["prs"][2]["headRefOid"]
    with pytest.raises(subprocess.CalledProcessError):
        _git(repo, "cat-file", "-e", head_sha)  # not local yet
    before = _refs_and_state(repo)

    head = resolve_ref(repo, "pr:2")
    base = resolve_ref(repo, "pr:2", side="base")

    assert head.sha == head_sha
    assert base.sha == stacked["prs"][2]["baseRefOid"]
    assert [c.path for c in list_changes(repo, base, head)] == ["pkg/two.py"]
    # No branch, remote-tracking ref, FETCH_HEAD, stash, or checkout change.
    assert _refs_and_state(repo) == before


def test_whole_pr_compare_payload_carries_pr_context_and_timings(fake_gh, stacked):
    repo = stacked["local"]
    before = _refs_and_state(repo)
    payload = build_compare(repo, "pr:2", "pr:2")
    assert payload["summary"]["files"]["total"] == 1
    assert payload["head"]["pr"]["number"] == 2
    assert (payload["head"]["label"], payload["head"]["subject"]) == ("#2", "Second layer")
    assert payload["base"]["pr"]["baseRefName"] == "stack-1"
    assert set(payload["timings"]["phases"]) == {"resolving", "base", "head", "diffing"}
    assert {"checkout", "scan", "graph", "cleanup"} <= set(payload["timings"]["head"])
    assert _refs_and_state(repo) == before

    again = build_compare(repo, "pr:2", "pr:2")
    assert again["head"]["cached"] is True
    assert set(again["timings"]["head"]) == {"cache"}


def test_pr_ref_without_gh_is_a_git_error(monkeypatch, stacked):
    def unavailable(*_args, **_kwargs):
        raise github.GhUnavailable("gh is not installed")

    monkeypatch.setattr(github, "run_gh", unavailable)
    with pytest.raises(GitError, match="Could not read PR #2: gh is not installed"):
        resolve_ref(stacked["local"], "pr:2")
