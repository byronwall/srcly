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

    We stub out ProcessPoolExecutor + as_completed to run synchronously and feed
    a mix of successful and error results.
    """
    root = tmp_path / "repo"
    root.mkdir()

    good_file = root / "good.py"
    good_file.write_text("print('ok')\n")

    bad_file = root / "bad.py"
    bad_file.write_text("print('bad')\n")

    def fake_runner(files_to_scan: list[str], timeout_seconds: float, max_workers: int):
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

    # We should not crash, and only the "good.py" file should appear in the tree.
    files = [child for child in root_node.children if child.type == "file"]
    assert [f.name for f in files] == ["good.py"]


