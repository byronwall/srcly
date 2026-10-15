"""Two scans of an unchanged tree must serialize to identical bytes."""

from pathlib import Path

from app.services import analysis
from app.services.scan_jobs import serialize_tree


def test_repeat_scans_are_byte_identical(monkeypatch, tmp_path: Path) -> None:
    root = tmp_path / "repo"
    for rel in ["b/z.py", "b/slow_a.py", "a.py", "c/d/e.py", "c/slow_f.py", "error_mid.py", "m.py"]:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("x = 1\n")

    monkeypatch.setattr(analysis, "MAX_ANALYSIS_WORKERS", 3)
    real_run = analysis.run_file_analyses
    # Reverse the input on alternate scans and let "slow" files finish late, so
    # completion order differs between the two runs.
    calls = {"n": 0}

    def run_with_fake(files, **kwargs):
        from scan_worker_helpers import fake_tree_analyze

        calls["n"] += 1
        ordered = list(files) if calls["n"] % 2 else list(reversed(files))
        return real_run(ordered, analyze_fn=fake_tree_analyze, **kwargs)

    monkeypatch.setattr(analysis, "run_file_analyses", run_with_fake)

    first = analysis.scan_codebase(root, verbose=False)
    second = analysis.scan_codebase(root, verbose=False)
    assert serialize_tree(first) == serialize_tree(second)

    # The forced failure sorts in with its siblings instead of trailing them.
    assert [c.name for c in first.children] == ["a.py", "b", "c", "error_mid.py", "m.py"]
    failed = next(c for c in first.children if c.name == "error_mid.py")
    assert failed.metrics.analysis_status == "error"
    assert [c.name for c in next(c for c in first.children if c.name == "b").children] == ["slow_a.py", "z.py"]
