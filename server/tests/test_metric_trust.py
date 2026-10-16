"""Zero vs N/A, executable scope kinds, and max-complexity witnesses (fixture: tests/fixtures/metric_trust)."""

import shutil
from pathlib import Path

import pytest

from app.models import Node
from app.services import analysis

FIXTURE = Path(__file__).parent / "fixtures" / "metric_trust"


def _find(node: Node, name: str) -> Node:
    for child in node.children:
        if child.name == name:
            return child
    raise AssertionError(f"{name} not under {node.name}: {[c.name for c in node.children]}")


@pytest.fixture(scope="module")
def tree(tmp_path_factory) -> Node:
    root = tmp_path_factory.mktemp("trust")
    shutil.copytree(FIXTURE, root, dirs_exist_ok=True)
    (root / "src" / "huge.ts").write_text("export const x = 1;\n" * 400)
    mp = pytest.MonkeyPatch()
    mp.setattr(analysis, "MAX_ANALYZED_FILE_BYTES", 2_000)
    try:
        yield analysis.scan_codebase(root, verbose=False)
    finally:
        mp.undo()


def test_measured_zero_stays_zero(tree: Node) -> None:
    flat = _find(_find(tree, "src"), "flat.ts")
    assert flat.metrics.todo_count == 0
    assert flat.metrics.ts_any_usage_count == 0


def test_metric_that_does_not_apply_is_none_with_reason(tree: Node) -> None:
    flat = _find(_find(tree, "src"), "flat.ts")
    # Component metrics don't apply to .ts; Python ones don't apply at all.
    assert flat.metrics.component_loc is None
    assert flat.metrics.python_import_count is None
    assert flat.metrics.na_reason == "Not measured for TypeScript files"

    notes = _find(_find(tree, "docs"), "notes.md")
    assert notes.metrics.complexity is None
    assert notes.metrics.function_count is None
    assert notes.metrics.md_data_url_count == 0
    assert notes.metrics.na_reason == "Not measured for Markdown files"


def test_skipped_file_is_none_not_zero(tree: Node) -> None:
    huge = _find(_find(tree, "src"), "huge.ts")
    assert huge.metrics.analysis_status == "too_large"
    assert huge.metrics.loc == 400
    assert huge.metrics.complexity is None
    assert huge.metrics.todo_count is None
    assert huge.metrics.na_reason.startswith("Skipped: ")


def test_folder_rollup_ignores_na_children(tree: Node) -> None:
    src = _find(tree, "src")
    docs = _find(tree, "docs")
    # docs holds only Markdown: no child measures complexity.
    assert docs.metrics.complexity is None
    assert docs.metrics.na_reason == "No file below measures this"
    # The skipped huge.ts doesn't drag src's counts or means toward 0.
    measured = [c for c in src.children if c.metrics.todo_count is not None]
    assert src.metrics.todo_count == sum(c.metrics.todo_count for c in measured)
    assert src.metrics.function_count == sum(c.metrics.function_count for c in measured)
    assert tree.metrics.complexity == src.metrics.complexity


def test_scope_kinds_are_kept(tree: Node) -> None:
    panel_file = _find(_find(tree, "src"), "Panel.tsx")
    kinds = {c.name: c.kind for c in panel_file.children}
    assert kinds["(imports)"] == "imports"
    assert kinds["styles (object)"] == "object"
    assert kinds["Store (class)"] == "class"
    assert kinds["Panel"] == "function"
    assert _find(_find(panel_file, "Panel"), "<div>").kind == "jsx"
    store = _find(panel_file, "Store (class)")
    assert _find(store, "add").kind == "function"


def test_function_counts_use_executable_scopes_only(tree: Node) -> None:
    panel_file = _find(_find(tree, "src"), "Panel.tsx")
    # pick, add, Panel, label, the map callback, the click handler.
    assert panel_file.metrics.function_count == 6

    jobs = _find(_find(tree, "src"), "jobs.py")
    # schedule, backoff, push, pop; the class itself is not a function.
    assert jobs.metrics.function_count == 4
    funcs = [schedule := _find(jobs, "schedule"), _find(schedule, "backoff")]
    funcs += [_find(_find(jobs, "(class) Queue"), "push"), _find(_find(jobs, "(class) Queue"), "pop")]
    assert jobs.metrics.complexity_avg == pytest.approx(sum(f.metrics.complexity for f in funcs) / 4)


def test_jsx_branches_count_toward_the_component(tree: Node) -> None:
    panel = _find(_find(_find(tree, "src"), "Panel.tsx"), "Panel")
    # Base 1 + the ternary + the `&&` inside its JSX containers.
    assert panel.metrics.complexity == 3


def test_file_and_folder_complexity_name_their_witness(tree: Node) -> None:
    src = _find(tree, "src")
    jobs = _find(src, "jobs.py")
    backoff = _find(_find(jobs, "schedule"), "backoff")
    assert jobs.metrics.complexity == backoff.metrics.complexity
    assert jobs.metrics.complexity_witness.path == backoff.path
    assert jobs.metrics.complexity_witness.start_line == backoff.start_line

    best_file = max(
        (c for c in src.children if c.metrics.complexity is not None),
        key=lambda c: c.metrics.complexity,
    )
    assert src.metrics.complexity_witness == best_file.metrics.complexity_witness
    assert tree.metrics.complexity_witness == src.metrics.complexity_witness
    assert src.metrics.complexity_witness.path.startswith(best_file.path + "::")
