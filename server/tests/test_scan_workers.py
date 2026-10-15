import multiprocessing
import signal
import time
from pathlib import Path

import pytest

from app import main as app_main
from app import run
from app.services import analysis
from app.services.scan_workers import (
    CancelToken,
    ScanCancelled,
    cancel_all_scans,
    run_file_analyses,
    track_scan,
)
from scan_worker_helpers import fake_analyze


def _paths(tmp_path: Path, *names: str) -> list[str]:
    return [str(tmp_path / name) for name in names]


def _assert_no_live_workers() -> None:
    # Give terminated processes a moment to be reaped.
    deadline = time.monotonic() + 2
    while multiprocessing.active_children() and time.monotonic() < deadline:
        time.sleep(0.05)
    assert multiprocessing.active_children() == []


def test_pool_returns_results_and_reports_errors(tmp_path: Path) -> None:
    files = _paths(tmp_path, "a.py", "error.py", "b.py")
    done: list[tuple[int, str, object]] = []

    outcome = run_file_analyses(
        files,
        timeout_seconds=10,
        max_workers=2,
        analyze_fn=fake_analyze,
        on_file_done=lambda completed, total, path, failure: done.append((completed, path, failure)),
    )

    assert sorted(r["filename"] for r in outcome.results) == sorted([files[0], files[2]])
    assert [(f.path, f.reason) for f in outcome.failures] == [(files[1], "error")]
    assert [c for c, _, _ in done] == [1, 2, 3]
    _assert_no_live_workers()


def test_pool_kills_hung_worker_and_keeps_going(tmp_path: Path) -> None:
    files = _paths(tmp_path, "hang.py", "a.py", "b.py", "c.py")

    started = time.monotonic()
    outcome = run_file_analyses(files, timeout_seconds=0.5, max_workers=2, analyze_fn=fake_analyze)
    elapsed = time.monotonic() - started

    assert [(f.path, f.reason) for f in outcome.failures] == [(files[0], "timeout")]
    assert len(outcome.results) == 3
    assert elapsed < 10
    _assert_no_live_workers()


def test_pool_survives_worker_crash(tmp_path: Path) -> None:
    files = _paths(tmp_path, "crash.py", "a.py", "b.py")

    outcome = run_file_analyses(files, timeout_seconds=10, max_workers=1, analyze_fn=fake_analyze)

    assert [(f.path, f.reason) for f in outcome.failures] == [(files[0], "crash")]
    assert len(outcome.results) == 2
    _assert_no_live_workers()


def test_pool_reuses_and_recycles_workers(tmp_path: Path) -> None:
    files = _paths(tmp_path, *(f"f{i}.py" for i in range(6)))

    outcome = run_file_analyses(
        files, timeout_seconds=10, max_workers=1, max_tasks_per_worker=2, analyze_fn=fake_analyze
    )

    pids = [r["pid"] for r in outcome.results]
    # One worker at a time, recycled every 2 tasks: 3 distinct processes.
    assert len(set(pids)) == 3
    assert pids[0] == pids[1]


def test_workers_ignore_sigint(tmp_path: Path) -> None:
    outcome = run_file_analyses(
        _paths(tmp_path, "sigint.py"), timeout_seconds=10, max_workers=1, analyze_fn=fake_analyze
    )

    assert outcome.results[0]["sigint_ignored"] is True


def test_pool_cancel_stops_promptly_and_cleans_up(tmp_path: Path) -> None:
    files = _paths(tmp_path, *(f"slow{i}.py" for i in range(20)))
    token = CancelToken()

    def cancel_after_first(completed, total, path, failure) -> None:
        token.cancel()

    started = time.monotonic()
    with pytest.raises(ScanCancelled):
        run_file_analyses(
            files,
            timeout_seconds=10,
            max_workers=2,
            cancel=token,
            analyze_fn=fake_analyze,
            on_file_done=cancel_after_first,
        )

    assert time.monotonic() - started < 5
    _assert_no_live_workers()


def test_cancel_all_scans_reaches_tracked_tokens() -> None:
    token = CancelToken()
    with track_scan(token):
        assert cancel_all_scans() == 1
    assert token.cancelled
    # Finished scans are no longer tracked.
    assert cancel_all_scans() == 0


def test_scan_codebase_honors_cancellation(tmp_path: Path) -> None:
    (tmp_path / "a.py").write_text("x = 1\n")
    token = CancelToken()
    token.cancel()

    with pytest.raises(ScanCancelled):
        analysis.scan_codebase(tmp_path, verbose=False, cancel=token)


def test_scan_skips_worktree_git_pointer_file(tmp_path: Path) -> None:
    (tmp_path / ".git").write_text("gitdir: /elsewhere/.git/worktrees/x\n")
    (tmp_path / "a.py").write_text("x = 1\n")

    tree = analysis.scan_codebase(tmp_path, verbose=False)

    assert [child.name for child in tree.children] == ["a.py"]


def test_gitignore_loader_only_reads_reachable_files(monkeypatch, tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True)
    (repo / ".gitignore").write_text("ignored_dir/\n")
    for rel in ("sub/.gitignore", "sibling/.gitignore", "sub/node_modules/.gitignore", "sub/ignored_dir/.gitignore", "sub/keep/.gitignore"):
        path = repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("*.tmp\n")

    read: list[str] = []
    original = analysis._read_gitignore_patterns

    def recording(gitignore_file: Path, base_rel: str):
        if gitignore_file.exists():
            read.append(gitignore_file.relative_to(repo).as_posix())
        return original(gitignore_file, base_rel)

    monkeypatch.setattr(analysis, "_read_gitignore_patterns", recording)

    ignore_root, spec = analysis._load_gitignore_spec(repo / "sub")

    assert ignore_root == repo
    # Repo-level rules still apply when scanning a subdirectory...
    assert analysis._is_gitignored(repo / "sub" / "ignored_dir", repo, spec, is_dir=True)
    assert analysis._is_gitignored(repo / "sub" / "keep" / "x.tmp", repo, spec)
    # ...but siblings, built-in ignore dirs and already-ignored dirs are never walked.
    assert sorted(read) == [".gitignore", "sub/.gitignore", "sub/keep/.gitignore"]


def test_gitignore_loader_tolerates_undecodable_file(tmp_path: Path) -> None:
    (tmp_path / ".git").mkdir()
    (tmp_path / ".gitignore").write_bytes(b"\xff\xfe*.log\n")
    (tmp_path / "a.py").write_text("x = 1\n")

    tree = analysis.scan_codebase(tmp_path, verbose=False)

    assert "a.py" in [child.name for child in tree.children]


def test_signal_handler_cancels_scans_then_calls_previous_handler() -> None:
    calls: list[int] = []
    original = signal.signal(signal.SIGINT, lambda signum, frame: calls.append(signum))
    try:
        previous = app_main._install_scan_cancelling_signal_handlers()
        token = CancelToken()
        with track_scan(token):
            signal.raise_signal(signal.SIGINT)
        assert token.cancelled
        assert calls == [signal.SIGINT]
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    finally:
        signal.signal(signal.SIGINT, original)


def test_cli_exits_130_without_traceback_on_ctrl_c(monkeypatch, capsys) -> None:
    def interrupted(argv):
        raise KeyboardInterrupt

    monkeypatch.setattr(run, "_main", interrupted)

    with pytest.raises(SystemExit) as excinfo:
        run.main(["report", "."])

    assert excinfo.value.code == run.EXIT_INTERRUPTED
    assert "Stopped." in capsys.readouterr().err
