"""Files lizard has no reader for, and files over the analysis size cap."""

import types
from pathlib import Path

import lizard
import pytest
from lizard_languages import get_reader_for

from app.services import analysis


def _no_lizard(*args, **kwargs):
    raise AssertionError("lizard.analyze_file should not be called")


def test_no_reader_file_gets_line_count_without_lizard(monkeypatch, tmp_path: Path) -> None:
    yaml_file = tmp_path / "compose.yaml"
    yaml_file.write_text(
        "# services for local dev\n"
        "services:\n"
        "\n"
        "  web:\n"
        "    image: nginx  # trailing comment\n"
        "    url: https://example.com\n"
        "#  disabled: true\n"
    )
    monkeypatch.setattr(analysis.lizard, "analyze_file", _no_lizard)

    result = analysis.analyze_single_file(str(yaml_file))

    assert result.filename == str(yaml_file)
    assert result.nloc == 4
    assert result.function_list == []


@pytest.mark.parametrize(
    "name, text",
    [
        ("deploy.sh", "#!/bin/bash\n# comment\nset -e\n\n// not shell\necho 'hi' # x\n"),
        ("page.mdx", "# Title\n\nSome prose here.\n\n## Section\n\n<Comp prop={1} />\n"),
        ("values.yml", "# a\nkey: value\n  # nested comment\nlist:\n  - item\n"),
        (".env.example", "# Copy to .env\nAPI_URL=http://localhost\n\nDEBUG=1\n"),
    ],
)
def test_line_count_matches_lizard_nloc(tmp_path: Path, name: str, text: str) -> None:
    path = tmp_path / name
    path.write_text(text)
    assert get_reader_for(str(path)) is None

    assert analysis.count_lizard_style_nloc(path) == lizard.analyze_file(str(path)).nloc


def test_file_with_lizard_reader_still_uses_lizard(monkeypatch, tmp_path: Path) -> None:
    go_file = tmp_path / "main.go"
    go_file.write_text("package main\n\nfunc main() {\n\tprintln(1)\n}\n")
    called = []
    real = analysis.lizard.analyze_file
    monkeypatch.setattr(analysis.lizard, "analyze_file", lambda p: called.append(p) or real(p))

    result = analysis.analyze_single_file(str(go_file))

    assert called == [str(go_file)]
    assert len(result.function_list) == 1


def test_split_oversized_files(tmp_path: Path) -> None:
    small = tmp_path / "small.ts"
    small.write_text("x\n")
    big = tmp_path / "big.html"
    big.write_text("y" * 101)

    to_analyze, too_large = analysis.split_oversized_files([str(small), str(big)], max_bytes=100)

    assert to_analyze == [str(small)]
    assert [f["filename"] for f in too_large] == [str(big)]
    assert too_large[0]["reason"] == "too_large"


def test_file_over_cap_is_kept_as_too_large_without_dispatch(monkeypatch, tmp_path: Path) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    small = root / "small.py"
    small.write_text("print('ok')\n")
    big = root / "report.html"
    big.write_text("<html>\n\n<body>\n" + "a" * 300 + "\n</body>\n")

    monkeypatch.setattr(analysis, "MAX_ANALYZED_FILE_BYTES", 200)
    dispatched: list[str] = []

    def fake_runner(files_to_scan: list[str], timeout_seconds: float, max_workers: int, **kwargs):
        dispatched.extend(files_to_scan)
        return [
            types.SimpleNamespace(
                filename=f, nloc=1, average_cyclomatic_complexity=1.0, function_list=[]
            )
            for f in files_to_scan
        ]

    monkeypatch.setattr(analysis, "_run_file_analyses_with_hard_timeouts", fake_runner)

    root_node = analysis.scan_codebase(root, verbose=False)

    assert dispatched == [str(small)]
    files = {c.name: c for c in root_node.children if c.type == "file"}
    big_metrics = files["report.html"].metrics
    assert big_metrics.analysis_status == "too_large"
    assert "limit" in big_metrics.analysis_error
    assert big_metrics.loc == 4
    assert big_metrics.file_size == big.stat().st_size
    assert big_metrics.file_count == 1
    # Skipped on purpose, so it is not a failure; the folder rollup agrees.
    assert big_metrics.analysis_failed_count == 0
    assert root_node.metrics.analysis_failed_count == 0
    assert root_node.metrics.file_count == 2
    assert root_node.metrics.loc == 5


def test_count_fallback_loc_streams_up_to_byte_limit(monkeypatch, tmp_path: Path) -> None:
    path = tmp_path / "many.txt"
    path.write_text("line\n" * 100)
    monkeypatch.setattr(analysis, "FALLBACK_LOC_MAX_BYTES", 50)

    assert analysis.count_fallback_loc(path) == 10
