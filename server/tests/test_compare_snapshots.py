"""Compare against a real throwaway git repo: refs, snapshots, cache, CLI."""

import json
import subprocess
from pathlib import Path

import pytest

from app import run
from app.services.compare import snapshots
from app.services.compare.git_refs import GitError, list_changes, resolve_ref
from app.services.compare.service import build_compare


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


BRANCHY = """
def f(x):
    if x > 1:
        if x > 2:
            return 3
        return 2
    return 1
"""


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-q", "-b", "main")
    _write(root / "pkg" / "__init__.py", "")
    _write(root / "pkg" / "core.py", BRANCHY)
    _write(root / "pkg" / "util.py", "def helper():\n    return 1\n")
    _write(root / "pkg" / "old.py", "def legacy():\n    return 0\n")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "base")
    _git(root, "checkout", "-q", "-b", "feature")
    _write(root / "pkg" / "core.py", "from pkg.util import helper\n\ndef f(x):\n    return helper()\n")
    _git(root, "mv", "pkg/old.py", "pkg/renamed.py")
    _write(root / "pkg" / "added.py", "import os\n")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "feature")
    return root.resolve()


def _worktree_count(repo: Path) -> int:
    return _git(repo, "worktree", "list", "--porcelain").count("worktree ")


def test_list_changes_detects_renames_and_line_counts(repo: Path):
    base, head = resolve_ref(repo, "main"), resolve_ref(repo, "feature")
    changes = {c.path: c for c in list_changes(repo, base, head)}
    assert changes["pkg/renamed.py"].status == "renamed"
    assert changes["pkg/renamed.py"].old_path == "pkg/old.py"
    assert changes["pkg/added.py"].status == "added"
    assert changes["pkg/core.py"].status == "modified"
    adds, dels, _ = _git(repo, "diff", "--numstat", "main", "feature", "--", "pkg/core.py").split("\t")
    assert (changes["pkg/core.py"].additions, changes["pkg/core.py"].deletions) == (int(adds), int(dels))


def test_merge_base_and_worktree_refs(repo: Path):
    assert resolve_ref(repo, "merge-base").sha == resolve_ref(repo, "main").sha
    _write(repo / "pkg" / "untracked.py", "a = 1\nb = 2\n")
    _write(repo / "pkg" / "util.py", "def helper():\n    return 2\n")
    changes = {c.path: c for c in list_changes(repo, resolve_ref(repo, "feature"), resolve_ref(repo, "WORKTREE"))}
    assert changes["pkg/untracked.py"].status == "added"
    assert changes["pkg/untracked.py"].additions == 2
    assert changes["pkg/util.py"].status == "modified"


def test_unknown_ref_is_a_git_error(repo: Path):
    with pytest.raises(GitError):
        resolve_ref(repo, "no-such-branch")


def test_compare_scans_commits_without_touching_the_checkout(repo: Path):
    branch_before = _git(repo, "rev-parse", "--abbrev-ref", "HEAD")
    status_before = _git(repo, "status", "--porcelain")
    worktrees_before = _worktree_count(repo)

    payload = build_compare(repo, "main", "feature", include_sides=True)

    assert _git(repo, "rev-parse", "--abbrev-ref", "HEAD") == branch_before
    assert _git(repo, "status", "--porcelain") == status_before
    assert _worktree_count(repo) == worktrees_before
    assert not any(snapshots.snapshots_dir().iterdir())

    files = {f["path"]: f for f in payload["files"]}
    assert files["pkg/core.py"]["deltas"]["complexity"]["verdict"] == "better"
    assert files["pkg/renamed.py"]["oldPath"] == "pkg/old.py"
    # Paths are repo-relative on both sides even though the scans ran elsewhere.
    assert payload["trees"]["base"]["path"] == ""
    assert {"source": "pkg/core.py", "target": "pkg/util.py", "external": False, "crossFolder": False} in payload[
        "edges"
    ]["added"]
    assert payload["base"]["cached"] is False


def test_commit_sides_are_cached_by_sha(repo: Path, monkeypatch):
    build_compare(repo, "main", "feature")

    def no_scan(*_args, **_kwargs):
        raise AssertionError("cached commit sides must not be rescanned")

    monkeypatch.setattr(snapshots.analysis, "scan_codebase", no_scan)
    monkeypatch.setattr(snapshots, "snapshot_checkout", no_scan)
    payload = build_compare(repo, "main", "feature")
    assert payload["base"]["cached"] and payload["head"]["cached"]


def test_checkout_is_removed_when_the_scan_fails(repo: Path, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("scan exploded")

    monkeypatch.setattr(snapshots.analysis, "scan_codebase", boom)
    before = _worktree_count(repo)
    with pytest.raises(RuntimeError):
        build_compare(repo, "main", "feature", force=True)
    assert _worktree_count(repo) == before
    assert not any(snapshots.snapshots_dir().iterdir())


def test_cli_writes_json(repo: Path, tmp_path: Path, capsys):
    out = tmp_path / "compare.json"
    run.main(["compare", "main", "feature", "--repo", str(repo), "--out", str(out)])
    payload = json.loads(out.read_text())
    assert payload["summary"]["files"]["total"] == 3
    run.main(["compare", "main", "feature", "--repo", str(repo)])
    assert "srcly compare:" in capsys.readouterr().out
