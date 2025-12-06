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

    class DummyFuture:
        def __init__(self, value=None, exc: Exception | None = None):
            self._value = value
            self._exc = exc

        def result(self, timeout: float | None = None):
            if self._exc is not None:
                raise self._exc
            return self._value

    class DummyExecutor:
        def __init__(self, max_workers: int | None = None):
            self._futures: list[DummyFuture] = []

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def submit(self, fn, file_path: str):
            # For the "good" file, return a minimal file_info-like object.
            # For the "bad" file, return the same shape that analyze_single_file
            # uses for errors.
            path = Path(file_path)
            if path.name == "good.py":
                file_info = types.SimpleNamespace(
                    filename=str(path),
                    nloc=1,
                    average_cyclomatic_complexity=1.0,
                    function_list=[],
                )
                fut = DummyFuture(value=file_info)
            else:
                fut = DummyFuture(value={"error": "boom", "filename": str(path)})
            self._futures.append(fut)
            return fut

    def fake_as_completed(futures):
        # Just yield the futures in the order they were submitted.
        for fut in futures:
            yield fut

    # Patch the concurrency primitives inside the analysis module.
    monkeypatch.setattr(analysis.concurrent.futures, "ProcessPoolExecutor", DummyExecutor)
    monkeypatch.setattr(analysis.concurrent.futures, "as_completed", fake_as_completed)

    root_node = analysis.scan_codebase(root)

    # We should not crash, and only the "good.py" file should appear in the tree.
    files = [child for child in root_node.children if child.type == "file"]
    assert [f.name for f in files] == ["good.py"]


