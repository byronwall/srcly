from pathlib import Path
import json

from app.services.ipynb_analysis import NotebookAnalyzer
from app.services.analysis import create_node, attach_file_metrics


def _write_notebook(tmp_path: Path) -> Path:
    nb = {
        "cells": [
            {
                "cell_type": "markdown",
                "source": ["# Title\n", "\n", "Some text\n"],
            },
            {
                "cell_type": "code",
                "source": ["print('hi')\n", "\n", "x = 1\n"],
                "outputs": [
                    {
                        "output_type": "stream",
                        "name": "stdout",
                        "text": ["hi\n"] * 50,  # Large output that should be ignored
                    }
                ],
            },
            {
                "cell_type": "code",
                "source": [],
                "outputs": [
                    {
                        "output_type": "display_data",
                        "data": {
                            "text/plain": ["very large\n"] * 200,
                        },
                    }
                ],
            },
        ]
    }

    path = tmp_path / "notebook.ipynb"
    path.write_text(json.dumps(nb), encoding="utf-8")
    return path


def test_ipynb_loc_counts_only_source_lines(tmp_path):
    path = _write_notebook(tmp_path)

    analyzer = NotebookAnalyzer()
    metrics = analyzer.analyze_file(str(path))

    # Markdown: 2 non-empty lines (# Title, Some text)
    # Code: 2 non-empty lines (print('hi'), x = 1)
    # Third cell has no source content.
    assert metrics.nloc == 4

    # We should have one entry per non-empty cell.
    assert len(metrics.function_list) == 2
    names = [f.name for f in metrics.function_list]
    assert any("[markdown]" in name for name in names)
    assert any("[code]" in name for name in names)


def test_ipynb_integration_with_attach_file_metrics(tmp_path):
    path = _write_notebook(tmp_path)

    analyzer = NotebookAnalyzer()
    metrics = analyzer.analyze_file(str(path))

    file_node = create_node(path.name, "file", str(path))
    attach_file_metrics(file_node, metrics)

    # File LOC should match notebook LOC computed from cell sources only.
    assert file_node.metrics.loc == 4

    # Children should correspond to the non-empty cells and have matching LOC.
    assert len(file_node.children) == 2
    child_locs = sorted(child.metrics.loc for child in file_node.children)
    assert child_locs == [2, 2]


