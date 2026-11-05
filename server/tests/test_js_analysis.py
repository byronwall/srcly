"""
Plain JS goes through the tree-sitter analyzer, not lizard.

Lizard 1.24.1 lost the end of the one-line ``bytes`` arrow function below when
the next line held nested template literals, and folded every following line
into it: in plan-viewer's public/code.js it reported lines 99–1430, CCN 584.
"""

from pathlib import Path

from app.services import analysis

SOURCE = """const bytes = (size) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB` : size < 1073741824 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1073741824).toFixed(1)} GB`;
const when = (time) => `<time datetime="${new Date(time).toISOString()}" data-tip="${escapeHtml(new Date(time).toLocaleString())}">${ago(time)}</time>`;
export function render(items) {
  for (const item of items) {
    if (item.size > 0) console.log(bytes(item.size), when(item.time));
  }
}
"""


def test_template_literals_do_not_merge_js_functions(tmp_path: Path) -> None:
    (tmp_path / "code.js").write_text(SOURCE, encoding="utf-8")
    tree = analysis.scan_codebase(tmp_path, verbose=False)
    file = next(n for n in tree.children if n.name == "code.js")
    spans = {n.name: (n.start_line, n.end_line, n.metrics.complexity) for n in file.children}

    assert spans["bytes"][:2] == (1, 1)
    assert spans["render"] == (3, 7, 3)
    # Measured like TypeScript, minus the TypeScript-only metrics.
    assert file.metrics.max_nesting_depth is not None
    assert file.metrics.ts_any_usage_count is None
