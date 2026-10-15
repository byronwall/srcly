from pathlib import Path
import types


from app.services import analysis


def test_analyze_single_file_wraps_exceptions(monkeypatch, tmp_path: Path) -> None:
    """analyze_single_file should return an error dict instead of raising."""
    bad_file = tmp_path / "bad.py"
    bad_file.write_text("print('hi')\n")

    # Force get_python_analyzer().analyze_file to fail for .py paths.
    def get_boom_analyzer():
        class BoomAnalyzer:
            def analyze_file(self, path: str):
                raise RuntimeError("boom")
        return BoomAnalyzer()

    monkeypatch.setattr(analysis, "get_python_analyzer", get_boom_analyzer)

    result = analysis.analyze_single_file(str(bad_file))

    assert isinstance(result, dict)
    assert result["filename"] == str(bad_file)
    assert "boom" in result["error"]


def test_scan_codebase_skips_error_results(monkeypatch, tmp_path: Path) -> None:
    """
    scan_codebase should gracefully skip per-file errors coming back from workers.

    We stub out the worker pool to run synchronously and feed a mix of
    successful and error results.
    """
    root = tmp_path / "repo"
    root.mkdir()

    good_file = root / "good.py"
    good_file.write_text("print('ok')\n")

    bad_file = root / "bad.py"
    bad_file.write_text("print('bad')\n")

    def fake_runner(files_to_scan: list[str], timeout_seconds: float, max_workers: int, **kwargs):
        # Return a mix of successful and error results, matching the shapes
        # scan_codebase expects to be defensive about.
        out = []
        for file_path in files_to_scan:
            path = Path(file_path)
            if path.name == "good.py":
                out.append(
                    types.SimpleNamespace(
                        filename=str(path),
                        nloc=1,
                        average_cyclomatic_complexity=1.0,
                        function_list=[],
                    )
                )
            else:
                out.append({"error": "boom", "filename": str(path)})
        return out

    # Patch the hard-timeout runner so this test stays fast and deterministic.
    monkeypatch.setattr(analysis, "_run_file_analyses_with_hard_timeouts", fake_runner)

    root_node = analysis.scan_codebase(root)

    # We should not crash; the failed file stays in the tree, flagged, with
    # fallback LOC from a plain line count.
    files = {child.name: child for child in root_node.children if child.type == "file"}
    assert sorted(files) == ["bad.py", "good.py"]
    assert files["good.py"].metrics.analysis_status == "ok"
    bad = files["bad.py"].metrics
    assert bad.analysis_status == "error"
    assert bad.analysis_error == "boom"
    assert bad.loc == 1
    assert bad.file_size == bad_file.stat().st_size
    assert root_node.metrics.analysis_failed_count == 1
    assert root_node.metrics.file_count == 2



def test_timed_out_file_stays_in_tree_with_fallback_loc(monkeypatch, tmp_path: Path) -> None:
    """A file the worker pool kills on timeout is kept, flagged, in its folder."""
    root = tmp_path / "repo"
    (root / "store").mkdir(parents=True)
    hang = root / "store" / "hang.go"
    hang.write_text("package store\n\nfunc A() {}\n\nfunc B() {}\n")
    (root / "store" / "ok.go").write_text("package store\n")

    monkeypatch.setattr(analysis, "PER_FILE_ANALYSIS_TIMEOUT_SECONDS", 2.0)
    monkeypatch.setattr(analysis, "MAX_ANALYSIS_WORKERS", 2)

    real_run = analysis.run_file_analyses

    def run_with_fake(files, **kwargs):
        from scan_worker_helpers import fake_lizard_analyze

        return real_run(files, analyze_fn=fake_lizard_analyze, **kwargs)

    monkeypatch.setattr(analysis, "run_file_analyses", run_with_fake)

    root_node = analysis.scan_codebase(root, verbose=False)

    store = next(c for c in root_node.children if c.name == "store")
    files = {c.name: c for c in store.children}
    assert sorted(files) == ["hang.go", "ok.go"]
    metrics = files["hang.go"].metrics
    assert metrics.analysis_status == "timeout"
    assert "2s" in metrics.analysis_error
    assert metrics.loc == 3
    assert metrics.file_size == hang.stat().st_size
    assert files["ok.go"].metrics.analysis_error == ""
    assert store.metrics.analysis_failed_count == 1
    assert root_node.metrics.analysis_failed_count == 1


def test_count_fallback_loc_ignores_blank_lines(tmp_path: Path) -> None:
    path = tmp_path / "a.txt"
    path.write_bytes(b"one\n\n   \ntwo\r\nthree")
    assert analysis.count_fallback_loc(path) == 3
    assert analysis.count_fallback_loc(tmp_path / "missing") == 0
