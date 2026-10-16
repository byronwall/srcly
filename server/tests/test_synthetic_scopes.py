"""Synthetic scopes like "(imports)" are shown in the tree but aren't counted as functions."""

from pathlib import Path

from app.services import analysis


def _file_node(tmp_path: Path, name: str, source: str):
    (tmp_path / name).write_text(source)
    root = analysis.scan_codebase(tmp_path, verbose=False)
    [file_node] = [c for c in root.children if c.type == "file"]
    return root, file_node


def test_imports_only_ts_file_has_no_functions(tmp_path: Path) -> None:
    source = (
        'import { createFromSource } from "fumadocs-core/search/server"\n\n'
        'import { source } from "@/lib/source"\n\n'
        "export const { GET } = createFromSource(source)\n"
    )
    root, file_node = _file_node(tmp_path, "route.ts", source)
    # The imports block is still in the scope tree...
    assert [c.name for c in file_node.children] == ["(imports)"]
    # ...but it isn't a function.
    assert file_node.metrics.function_count == 0
    # Nothing to average: N/A, not a measured 0.
    assert file_node.metrics.complexity_avg is None
    assert file_node.metrics.complexity == 0
    assert root.metrics.function_count == 0


def test_imports_scope_does_not_dilute_ts_averages(tmp_path: Path) -> None:
    source = """import { a } from "./a";

export function branchy(x: number) {
  if (x > 1) { return a; }
  return 0;
}
"""
    root, file_node = _file_node(tmp_path, "mod.ts", source)
    assert {c.name for c in file_node.children} == {"(imports)", "branchy"}
    assert file_node.metrics.function_count == 1
    assert file_node.metrics.complexity_avg == 2
    assert file_node.metrics.average_function_length == 4
    assert root.metrics.complexity_avg == 2


def test_imports_scope_does_not_dilute_python_averages(tmp_path: Path) -> None:
    source = """import os
import sys


def branchy(x):
    if x:
        return os.sep
    return sys.platform
"""
    root, file_node = _file_node(tmp_path, "mod.py", source)
    assert {c.name for c in file_node.children} == {"(imports)", "branchy"}
    assert file_node.metrics.function_count == 1
    assert file_node.metrics.complexity_avg == 2
    assert root.metrics.function_count == 1
