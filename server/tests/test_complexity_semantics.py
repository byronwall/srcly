"""File-level `complexity` is the max CCN of any scope, like folders; the average is `complexity_avg`."""

import types
from pathlib import Path

from app.models import Node
from app.services import analysis


def _func(name: str, ccn: int, nloc: int = 5, children=()):
    return types.SimpleNamespace(
        name=name, cyclomatic_complexity=ccn, nloc=nloc, children=list(children)
    )


def _file_info(path: str, funcs: list, avg: float):
    return types.SimpleNamespace(
        filename=path, nloc=50, average_cyclomatic_complexity=avg, function_list=funcs
    )


def test_file_complexity_is_max_including_nested_scopes() -> None:
    node = analysis.create_node("a.tsx", "file", "/r/a.tsx")
    inner = _func("handler", 9)
    info = _file_info("/r/a.tsx", [_func("Component", 2, children=[inner]), _func("util", 1)], avg=1.5)

    analysis.attach_file_metrics(node, info)

    assert node.metrics.complexity == 9
    # Mean over every executable function, nested ones included.
    assert node.metrics.complexity_avg == (2 + 9 + 1) / 3
    assert node.metrics.function_count == 3
    assert node.metrics.complexity_witness.name == "handler"
    assert node.metrics.complexity_witness.path == "/r/a.tsx::Component::handler"


def test_code_file_without_functions_has_measured_zero_complexity() -> None:
    node = analysis.create_node("a.py", "file", "/r/a.py")
    analysis.attach_file_metrics(node, _file_info("/r/a.py", [], avg=0.0))
    assert node.metrics.complexity == 0
    assert node.metrics.complexity_witness is None
    assert node.metrics.function_count == 0
    # No functions to average: N/A rather than 0.
    assert node.metrics.complexity_avg is None


def test_markdown_file_has_no_complexity() -> None:
    node = analysis.create_node("a.md", "file", "/r/a.md")
    analysis.attach_file_metrics(node, _file_info("/r/a.md", [], avg=0.0))
    assert node.metrics.complexity is None
    assert node.metrics.function_count is None
    assert node.metrics.na_reason == "Not measured for Markdown files"


def test_folder_complexity_max_and_weighted_average() -> None:
    folder = analysis.create_node("src", "folder", "/r/src")
    a = analysis.create_node("a.py", "file", "/r/src/a.py")
    analysis.attach_file_metrics(a, _file_info(a.path, [_func("f", 4), _func("g", 2)], avg=3.0))
    b = analysis.create_node("b.py", "file", "/r/src/b.py")
    analysis.attach_file_metrics(b, _file_info(b.path, [_func("h", 12), _func("i", 1), _func("j", 2)], avg=5.0))
    folder.children = [a, b]

    analysis.aggregate_metrics(folder)

    assert folder.metrics.complexity == 12
    assert folder.metrics.complexity == max(a.metrics.complexity, b.metrics.complexity)
    # (3.0 * 2 + 5.0 * 3) / 5 functions
    assert folder.metrics.complexity_avg == 4.2


def test_scanned_tsx_file_reports_max_not_average(tmp_path: Path) -> None:
    source = """
export function Simple() {
  return 1;
}

export function Branchy(a: number) {
  if (a > 1) { return 1; }
  if (a > 2) { return 2; }
  if (a > 3) { return 3; }
  return 0;
}
"""
    (tmp_path / "CommandInput.tsx").write_text(source)

    root: Node = analysis.scan_codebase(tmp_path, verbose=False)

    [file_node] = [c for c in root.children if c.type == "file"]
    function_ccns = [c.metrics.complexity for c in file_node.children]
    assert file_node.metrics.complexity == max(function_ccns) == 4
    assert file_node.metrics.complexity_avg == sum(function_ccns) / len(function_ccns)
    assert root.metrics.complexity == 4
