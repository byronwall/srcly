from app.services.focus_overlay import compute_focus_overlay


def test_focus_overlay_categories_and_imports(tmp_path):
    code = """\
import { join as j } from "path";
const top = 1;

function outer(p: number) {
  const local = p + top;
  function inner() {
    console.log(local);
    return local + p + top + j("a", "b") + notDefined;
  }
  return inner();
}
"""

    f = tmp_path / "test.ts"
    f.write_text(code, encoding="utf-8")

    # Focus on the `return ...` line inside `inner`.
    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=200,
        focus_start_line=7,
        focus_end_line=8,
    )

    cats = {t.category for t in overlay.tokens}

    # `local` and `p` are captured from outer scope relative to `inner`.
    assert "capture" in cats
    # `top` is module scope.
    assert "module" in cats
    # `j` is an external import (node built-in package).
    assert "importExternal" in cats
    # `console` is treated as builtin.
    assert "builtin" in cats
    # `notDefined` is unresolved.
    assert "unresolved" in cats


def test_focus_overlay_import_internal(tmp_path):
    (tmp_path / "b.ts").write_text("export const x = 1;\n", encoding="utf-8")
    a = tmp_path / "a.ts"
    a.write_text(
        """\
import { x } from "./b";
function f() {
  return x;
}
""",
        encoding="utf-8",
    )

    overlay = compute_focus_overlay(
        file_path=str(a),
        slice_start_line=1,
        slice_end_line=50,
        focus_start_line=3,
        focus_end_line=3,
    )

    assert any(t.category == "importInternal" for t in overlay.tokens)


