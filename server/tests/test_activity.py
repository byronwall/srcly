"""Git activity: commit_count / churn_lines per file from one ``git log --numstat`` pass."""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import activity, analysis, metric_catalog, reporting
from app.services.compare.git_refs import GitTimeout
from app.services.scan_jobs import ScanJob, serialize_tree


def git(repo: Path, *args: str, env: dict | None = None) -> str:
    return subprocess.run(
        ["git", *args], cwd=repo, check=True, capture_output=True, text=True, env={**os.environ, **(env or {})}
    ).stdout


def commit(repo: Path, message: str, *, days_ago: float = 0) -> None:
    when = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - days_ago * 86400))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", message, env={"GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when})


def write(repo: Path, rel: str, text: str) -> None:
    # Distinct content per file, so git's rename detection only pairs real renames.
    stem = rel.replace("/", "_").replace(".", "_").replace("new_name", "old_name")
    text = text.replace("x_", f"{stem}_")
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def lines(n: int, tag: str = "x") -> str:
    return "".join(f"{tag}_{i} = {i}\n" for i in range(n))


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A repo with an old commit, a rename, a merge and a bulk commit."""
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.email", "t@example.com")
    git(repo, "config", "user.name", "T")
    git(repo, "config", "commit.gpgsign", "false")

    write(repo, "src/old_name.py", lines(20))
    write(repo, "src/stable.py", lines(5))
    commit(repo, "ancient", days_ago=400)
    write(repo, "src/stable.py", lines(6))
    commit(repo, "half a year ago", days_ago=200)

    write(repo, "src/old_name.py", lines(22))
    commit(repo, "edit before rename", days_ago=10)
    git(repo, "mv", "src/old_name.py", "src/new_name.py")
    write(repo, "src/new_name.py", lines(22) + "extra = 1\n")
    commit(repo, "rename", days_ago=9)
    write(repo, "src/new_name.py", lines(25))
    commit(repo, "edit after rename", days_ago=8)

    git(repo, "checkout", "-q", "-b", "feature")
    write(repo, "src/feature.py", lines(3))
    commit(repo, "feature work", days_ago=5)
    git(repo, "checkout", "-q", "main")
    write(repo, "src/mainline.py", lines(4))
    commit(repo, "mainline work", days_ago=4)
    git(repo, "merge", "-q", "--no-ff", "feature", "-m", "merge feature",
        env={"GIT_AUTHOR_DATE": time.strftime("%Y-%m-%dT%H:%M:%S"), "GIT_COMMITTER_DATE": time.strftime("%Y-%m-%dT%H:%M:%S")})

    for i in range(30):
        write(repo, f"gen/file_{i:02}.py", lines(10 + i, "g"))
    commit(repo, "bulk generated", days_ago=1)
    return repo


def oracle(repo: Path, rel: str, since: str | None) -> tuple[int, int]:
    """What ``git log --follow`` says for one file: (commits, added + removed)."""
    args = ["log", "--no-merges", "--follow", "--numstat", "--format=%x1e"]
    if since:
        args.append(f"--since={since}")
    out = git(repo, *args, "--", rel)
    commits = out.count("\x1e")
    churn = 0
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            churn += sum(int(p) for p in parts[:2] if p.isdigit())
    return commits, churn


TRACKED = ["src/new_name.py", "src/stable.py", "src/feature.py", "src/mainline.py", "gen/file_00.py", "gen/file_29.py"]


@pytest.mark.parametrize("window", ["30d", "90d", "1y", "all"])
def test_counts_match_git_log(repo: Path, window: str) -> None:
    result = activity.collect(repo, window)
    assert result.ok, result.reason
    for rel in TRACKED:
        expected = oracle(repo, rel, activity.WINDOWS[window])
        assert tuple(result.files.get(rel, (0, 0))) == expected, (rel, window)


def test_rename_history_goes_to_the_current_path(repo: Path) -> None:
    files = activity.collect(repo, "all").files
    assert "src/old_name.py" not in files
    assert files["src/new_name.py"][0] == 4  # ancient + edit + rename + edit
    assert activity.collect(repo, "30d").files["src/new_name.py"][0] == 3


def test_merges_are_not_counted(repo: Path) -> None:
    files = activity.collect(repo, "90d").files
    assert files["src/feature.py"] == [1, 3]
    assert files["src/mainline.py"] == [1, 4]


def test_bulk_commit_counts_once_per_file(repo: Path) -> None:
    files = activity.collect(repo, "90d").files
    assert files["gen/file_00.py"] == [1, 10]
    assert files["gen/file_29.py"] == [1, 39]


def test_window_excludes_old_commits(repo: Path) -> None:
    assert "src/stable.py" not in activity.collect(repo, "90d").files
    assert activity.collect(repo, "1y").files["src/stable.py"][0] == 1
    assert activity.collect(repo, "all").files["src/stable.py"][0] == 2


def test_unknown_window_is_rejected(repo: Path) -> None:
    with pytest.raises(ValueError):
        activity.collect(repo, "7d")


def test_shallow_clone_is_na(repo: Path, tmp_path: Path) -> None:
    shallow = tmp_path / "shallow"
    git(tmp_path, "clone", "-q", "--depth", "1", f"file://{repo}", str(shallow))
    result = activity.collect(shallow)
    assert result.status == "na" and "Shallow clone" in result.reason


def test_no_git_is_na(tmp_path: Path) -> None:
    plain = tmp_path / "plain"
    plain.mkdir()
    (plain / "a.py").write_text("x = 1\n")
    result = activity.collect(plain)
    assert result.status == "na" and result.reason == "Not a Git repository"


def test_empty_repo_is_na(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    git(empty, "init", "-q")
    assert activity.collect(empty).reason == "No commits yet"


def test_dirty_tree_is_a_note_not_na(repo: Path) -> None:
    assert activity.collect(repo).note == ""
    write(repo, "src/stable.py", lines(9))
    result = activity.collect(repo)
    assert result.ok and result.note == "1 file has uncommitted changes, not counted"


def test_log_timeout_is_na(repo: Path, monkeypatch) -> None:
    real = activity.run_git

    def slow_log(cwd, *args, **kwargs):
        if args and args[0] == "log":
            raise GitTimeout("git log timed out after 30s")
        return real(cwd, *args, **kwargs)

    monkeypatch.setattr(activity, "run_git", slow_log)
    result = activity.collect(repo)
    assert result.status == "na" and result.reason.startswith("Git timed out")


def test_real_subprocess_timeout_is_na(repo: Path) -> None:
    result = activity.collect(repo, timeout=1e-6)
    assert result.status == "na" and "timed out" in result.reason


def test_failures_are_not_cached(repo: Path, monkeypatch) -> None:
    calls = []
    real = activity._measure

    def counting(*args, **kwargs):
        calls.append(args)
        return real(*args, **kwargs)

    monkeypatch.setattr(activity, "_measure", counting)
    activity.collect(repo, "90d")
    activity.collect(repo, "90d")
    assert len(calls) == 1  # memory hit
    activity.activity_cache.clear_memory()
    activity.collect(repo, "90d")
    assert len(calls) == 1  # disk hit
    activity.collect(repo, "30d")
    assert len(calls) == 2  # new window
    write(repo, "src/stable.py", lines(8))
    commit(repo, "new head")
    activity.collect(repo, "30d")
    assert len(calls) == 3  # new HEAD


def test_parse_handles_renames_and_binary() -> None:
    log = (
        "\x1eC3\0\n1\t0\tc.txt\0"
        "\x1eC2\0\n2\t1\t\0b.txt\0c.txt\0-\t-\timg.png\0"
        "\x1eC1\0\n5\t0\ta.txt\0"
        "\x1eC0\0\n3\t0\t\0a.txt\0b.txt\0"
    )
    # Oldest first: C0 renames a -> b, C1 adds a new a.txt, C2 renames b -> c.
    # So C0 belongs to c.txt, and only C1 to today's a.txt.
    files = activity.parse_numstat_log(log)
    assert files["c.txt"] == [3, 7]
    assert files["img.png"] == [1, 0]
    assert files["a.txt"] == [1, 5]


def _scan_json(root: Path) -> dict:
    return json.loads(serialize_tree(analysis.scan_codebase(root, verbose=False)))


def _find(node: dict, name: str) -> dict:
    if node["name"] == name:
        return node
    for child in node.get("children") or []:
        hit = _find(child, name)
        if hit:
            return hit
    return {}


def test_tree_overlay_files_folders_and_scopes(repo: Path) -> None:
    write(repo, "src/funcs.py", "def f(a):\n    return a\n")
    commit(repo, "funcs")
    tree = activity.apply_to_scan(_scan_json(repo), repo, "90d")
    new_name = _find(tree, "new_name.py")
    assert new_name["metrics"]["commit_count"] == 3
    src = _find(tree, "src")
    files = [c for c in src["children"] if c["type"] == "file"]
    assert src["metrics"]["commit_count"] == sum(f["metrics"]["commit_count"] for f in files)
    assert src["metrics"]["churn_lines"] == sum(f["metrics"]["churn_lines"] for f in files)
    assert _find(tree, "stable.py")["metrics"]["commit_count"] == 0  # measured zero in the window
    func = _find(tree, "f")
    assert func["type"] == "function" and func["metrics"].get("commit_count") is None
    assert tree["activity"]["status"] == "ok" and tree["activity"]["window"] == "90d"


def test_tree_overlay_on_a_subfolder_scan(repo: Path) -> None:
    tree = activity.apply_to_scan(_scan_json(repo / "src"), repo / "src", "90d")
    assert _find(tree, "new_name.py")["metrics"]["commit_count"] == 3


def test_tree_overlay_na_carries_the_reason(tmp_path: Path) -> None:
    plain = tmp_path / "plain"
    plain.mkdir()
    (plain / "a.py").write_text("def f():\n    return 1\n")
    tree = activity.apply_to_scan(_scan_json(plain), plain)
    file_metrics = _find(tree, "a.py")["metrics"]
    assert file_metrics["commit_count"] is None
    assert file_metrics["na_reasons"]["commit_count"] == "Not a Git repository"
    assert tree["metrics"]["na_reasons"]["churn_lines"] == "Not a Git repository"
    # Source metrics are unaffected, and their own reason doesn't mention activity.
    assert file_metrics["complexity"] == 1 and "Git" not in file_metrics["na_reason"]
    assert tree["activity"] == {**tree["activity"], "status": "na", "reason": "Not a Git repository"}


def test_window_change_reuses_the_ast_result(repo: Path) -> None:
    job = ScanJob(root_path=repo)
    job.run()
    base = job.result_json()
    ninety = json.loads(job.result_json_overlaid("90d"))
    everything = json.loads(job.result_json_overlaid("all"))
    assert job.result_json() is base  # the cached AST tree is untouched
    assert _find(ninety, "stable.py")["metrics"]["commit_count"] == 0
    assert _find(everything, "stable.py")["metrics"]["commit_count"] == 2
    assert job.result_json_overlaid("90d") is job.result_json_overlaid("90d")


def test_api_window_param_and_commits(repo: Path) -> None:
    client = TestClient(app)
    res = client.get("/api/analysis", params={"path": str(repo), "activity_window": "all"})
    assert res.status_code == 200, res.text
    assert res.json()["activity"]["window"] == "all"
    assert client.get("/api/analysis", params={"path": str(repo), "activity_window": "7d"}).status_code == 400

    commits = client.get("/api/files/commits", params={"path": str(repo / "src/new_name.py")}).json()
    assert commits["status"] == "ok"
    assert [c["subject"] for c in commits["commits"]] == ["edit after rename", "rename", "edit before rename", "ancient"]
    assert len(commits["commits"][0]["short"]) >= 7

    catalog = client.get("/api/metrics/catalog").json()
    assert catalog["default_activity_window"] == "90d"
    assert [w["id"] for w in catalog["activity_windows"]] == ["30d", "90d", "1y", "all"]


def test_catalog_entries() -> None:
    for metric in ("commit_count", "churn_lines"):
        spec = metric_catalog.get(metric)
        assert spec.group == "Activity" and spec.scope == "file" and spec.languages is None
        assert spec.rankable and spec.compare == "neutral" and spec.aggregation == "sum"


def test_report_ranks_by_commits(repo: Path) -> None:
    payload = reporting.build_report_payload(repo, metric="commit_count", verbose=False)
    top = payload["hotspots"]["rankings"][0]
    assert top["path"] == "src/new_name.py" and top["value"] == 3 and top["unit"] == "commits"
    assert payload["manifest"]["activity"]["status"] == "ok"
    assert "Git activity: last 90 days" in payload["report_markdown"]
