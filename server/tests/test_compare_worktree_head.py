"""`worktree:<path>` heads: another worktree's files on disk, without touching either checkout."""

from pathlib import Path

import pytest

from app.services.compare import github
from app.services.compare.git_refs import GitError, resolve_ref
from app.services.compare.service import build_compare
from tests.test_compare_github import _fresh_gh_cache  # noqa: F401 - fixture
from tests.test_compare_snapshots import _git, _write, repo  # noqa: F401 - fixture


def _state(path: Path) -> tuple[str, str, str]:
    return (
        _git(path, "rev-parse", "--abbrev-ref", "HEAD"),
        _git(path, "status", "--porcelain", "--untracked-files=all"),
        _git(path, "stash", "list"),
    )


@pytest.fixture
def side_worktree(repo: Path, tmp_path: Path) -> Path:  # noqa: F811
    """A second worktree on branch `side` (one commit past `feature`) with uncommitted and untracked edits."""
    wt = tmp_path / "wt-side"
    _git(repo, "worktree", "add", "-q", "-b", "side", str(wt), "feature")
    _write(wt / "pkg" / "side.py", "def side():\n    return 1\n")
    _git(wt, "add", "-A")
    _git(wt, "commit", "-q", "-m", "side")
    _write(wt / "pkg" / "util.py", "def helper():\n    return 42\n")  # uncommitted
    _write(wt / "pkg" / "scratch.py", "a = 1\nb = 2\nc = 3\n")  # untracked
    return wt.resolve()


@pytest.fixture
def no_gh(monkeypatch):
    def missing(*_a, **_k):
        raise github.GhUnavailable("gh is not installed")

    monkeypatch.setattr(github, "run_gh", missing)


def test_worktree_head_compares_its_files_on_disk(repo: Path, side_worktree: Path, no_gh):  # noqa: F811
    before = (_state(repo), _state(side_worktree))
    payload = build_compare(repo, "auto", f"worktree:{side_worktree}", include_sides=True)
    assert (_state(repo), _state(side_worktree)) == before

    files = {f["path"]: f for f in payload["files"]}
    # merge-base with main: feature's changes + side's commit + uncommitted + untracked.
    assert {"pkg/core.py", "pkg/added.py", "pkg/renamed.py", "pkg/side.py", "pkg/util.py", "pkg/scratch.py"} == set(files)
    assert files["pkg/util.py"]["status"] == "modified"
    assert files["pkg/scratch.py"]["additions"] == 3
    assert payload["head"]["label"] == "side"
    assert payload["head"]["dir"] == str(side_worktree)
    assert payload["head"]["sha"] is None
    assert payload["trees"]["head"]["path"] == ""
    assert payload["trees"]["head"]["name"] == repo.name


def test_worktree_head_uses_its_pr_base(repo: Path, side_worktree: Path, monkeypatch):  # noqa: F811
    pr = {
        "number": 7,
        "title": "Side",
        "url": "https://github.com/o/r/pull/7",
        "headRefName": "side",
        "baseRefName": "feature",
        "headRefOid": _git(side_worktree, "rev-parse", "HEAD").strip(),
        "baseRefOid": _git(repo, "rev-parse", "feature").strip(),
        "author": {"login": "me"},
    }
    monkeypatch.setattr(github, "run_gh", lambda _repo, *args, **_k: [pr] if "--head" in args else [])
    payload = build_compare(repo, "auto", f"worktree:{side_worktree}")
    assert {f["path"] for f in payload["files"]} == {"pkg/side.py", "pkg/util.py", "pkg/scratch.py"}
    assert payload["base"]["pr"]["number"] == 7


def test_worktree_ref_of_the_repo_itself_is_the_working_tree(repo: Path):  # noqa: F811
    ref = resolve_ref(repo, f"worktree:{repo}")
    assert ref.sha is None and ref.dir is None and ref.label == "working tree"


def test_worktree_ref_rejects_base_side_and_foreign_repos(repo: Path, tmp_path: Path):  # noqa: F811
    with pytest.raises(GitError, match="only be the head"):
        resolve_ref(repo, f"worktree:{repo}", side="base")
    other = tmp_path / "other"
    other.mkdir()
    _git(other, "init", "-q")
    with pytest.raises(GitError, match="different repository"):
        resolve_ref(repo, f"worktree:{other}")
    with pytest.raises(GitError, match="not found"):
        resolve_ref(repo, f"worktree:{tmp_path / 'missing'}")
