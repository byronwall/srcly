"""Comment noise: absolute thresholds, per function and per file (fixtures: tests/fixtures/comment_noise)."""

from pathlib import Path

import pytest

from app.services import comment_noise
from app.services.analysis_types import iter_executable_scopes
from app.services.markers import collect_markers
from app.services.python.python_analysis import PythonTreeSitterAnalyzer
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

FIXTURES = Path(__file__).parent / "fixtures" / "comment_noise"


def _analyze(path: Path):
    analyzer = PythonTreeSitterAnalyzer() if path.suffix == ".py" else TreeSitterAnalyzer()
    return analyzer.analyze_file(str(path))


def _scope(metrics, name: str):
    return next(f for f in iter_executable_scopes(metrics.function_list) if f.name == name)


def test_narrated_ts_function_and_oversized_docblock() -> None:
    metrics = _analyze(FIXTURES / "narrated.ts")
    assert (metrics.comment_noise, metrics.comment_noise_ratio, metrics.comment_noise_docblock) == (2, 1, 1)
    assert _scope(metrics, "sumPositive").comment_noise_ratio == 1
    assert _scope(metrics, "increment").comment_noise_docblock == 1
    # A short, uncommented function stays clean: a measured zero.
    assert _scope(metrics, "tidy").comment_noise == 0


def test_commented_out_ts_code_is_flagged_but_prose_and_directives_are_not() -> None:
    metrics = _analyze(FIXTURES / "commented_out.ts")
    assert metrics.comment_noise == metrics.comment_noise_commented_code == 1
    assert _scope(metrics, "loadUser").comment_noise_commented_code == 1
    assert _scope(metrics, "saveUser").comment_noise == 0


def test_python_docstring_commented_code_and_ratio() -> None:
    metrics = _analyze(FIXTURES / "narrated.py")
    assert _scope(metrics, "mean").comment_noise_docblock == 1
    # "old approach, kept for reference:" above the code doesn't hide it.
    assert _scope(metrics, "total").comment_noise_commented_code == 1
    assert _scope(metrics, "explained").comment_noise_ratio == 1
    assert metrics.comment_noise == 3


def test_every_flag_is_marked_with_its_lines() -> None:
    markers = collect_markers(str(FIXTURES / "narrated.py"))
    flags = markers["comment_noise"]
    assert len(flags) == 3
    assert [(m["line"], m["end_line"]) for m in flags] == [(2, 13), (20, 22), (28, 52)]
    assert flags[0]["note"] == "12-line docblock for 2 code lines"
    assert len(markers["comment_noise_commented_code"]) == 1

    ts = collect_markers(str(FIXTURES / "commented_out.ts"))
    assert ts["comment_noise"] == [{"line": 3, "end_line": 6, "note": "commented-out code (4 lines)"}]


def _ts(tmp_path: Path, source: str):
    path = tmp_path / "f.ts"
    path.write_text(source, encoding="utf-8")
    return TreeSitterAnalyzer().analyze_file(str(path))


def _function(code_lines: int, comment_lines: int) -> str:
    body = [f"  // note {i}" for i in range(comment_lines)] + [f"  const v{i} = {i};" for i in range(code_lines - 2)]
    return "export function f() {\n" + "\n".join(body) + "\n}\n"


@pytest.mark.parametrize(
    ("code", "comments", "flagged"),
    [
        (10, 10, False),  # exactly 1 comment line per code line
        (10, 11, True),
        (10, 6, False),  # 0.6: a docstring-heavy function, not narration
        (9, 12, False),  # under the 10-code-line floor
    ],
)
def test_ratio_threshold_is_absolute(tmp_path: Path, code: int, comments: int, flagged: bool) -> None:
    metrics = _ts(tmp_path, _function(code, comments))
    assert metrics.comment_noise_ratio == int(flagged)


@pytest.mark.parametrize(
    ("doc_lines", "body_lines", "flagged"),
    [
        (8, 5, True),  # 8 > 1.5 * 5
        (7, 1, False),  # under 8 lines
        (9, 6, False),  # 9 == 1.5 * 6, not over
    ],
)
def test_docblock_threshold(tmp_path: Path, doc_lines: int, body_lines: int, flagged: bool) -> None:
    doc = "/**\n" + "\n".join(" * words" for _ in range(doc_lines - 2)) + "\n */\n"
    body = "\n".join(f"  const v{i} = {i};" for i in range(body_lines - 2))
    metrics = _ts(tmp_path, doc + "export function f() {\n" + body + "\n}\n")
    assert metrics.comment_noise_docblock == int(flagged)


def test_two_commented_lines_are_not_a_run(tmp_path: Path) -> None:
    metrics = _ts(tmp_path, "export function f() {\n  // const a = 1;\n  // const b = 2;\n  return 3;\n}\n")
    assert metrics.comment_noise_commented_code == 0


def test_inner_narrated_function_is_not_counted_again_on_its_parent(tmp_path: Path) -> None:
    inner = _function(12, 14).replace("export function f", "function inner")
    source = "export function outer() {\n" + inner + "  return inner();\n}\n"
    metrics = _ts(tmp_path, source)
    assert metrics.comment_noise_ratio == 1
    assert _scope(metrics, "inner").comment_noise_ratio == 1
    assert _scope(metrics, "outer").comment_noise_ratio == 0


def test_file_flag_only_when_no_function_carries_one() -> None:
    lines = [f"// note {i}" for i in range(12)] + [f"const v{i} = {i};" for i in range(10)]
    result = comment_noise.analyze(
        lines,
        [comment_noise.CommentSpan(i + 1, i + 1, 0, f"note {i}") for i in range(12)],
        [],
        lambda _text: False,
    )
    assert [(f.kind, f.line) for f in result.file_flags] == [("ratio", 1)]
