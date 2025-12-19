from app.services.focus_overlay import compute_focus_overlay


def _token_text(code: str, token) -> str:
    lines = code.splitlines()
    line = lines[token.fileLine - 1]
    return line[token.startCol : token.endCol]


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


def test_focus_overlay_param_stays_param_even_when_focus_is_outer_scope(tmp_path):
    code = """\
function someOuterScopeWithFocus(){

  function getNodeStyle(type?: string) {
    switch (type) {
      case "function":
        return { border: "#3b82f6", bg: "#1e3a8a33", label: "fn" };
      case "if":
        return { border: "#22c55e", bg: "#14532d33", label: "if" };
      case "else":
      case "else_branch":
        return { border: "#22c55e", bg: "#14532d33", label: "else" };
      case "try":
        return { border: "#ef4444", bg: "#7f1d1d33", label: "try" };
      case "catch":
        return { border: "#ef4444", bg: "#7f1d1d33", label: "catch" };
      case "finally":
        return { border: "#ef4444", bg: "#7f1d1d33", label: "finally" };
      case "variable":
      case "usage":
        return { border: "#94a3b8", bg: "#334155", label: "var" };
      default:
        return { border: "#64748b", bg: "#1e293b", label: type || "block" };
    }
  }
}
"""
    f = tmp_path / "param_focus.ts"
    f.write_text(code, encoding="utf-8")

    # Focus spans the *outer* function scope, but `type` is still a parameter of the
    # nested `getNodeStyle` function and must remain categorized as `param`.
    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=500,
        focus_start_line=1,
        focus_end_line=500,
    )

    type_tokens = [t for t in overlay.tokens if _token_text(code, t) == "type"]
    assert type_tokens, "Expected at least one overlay token for `type`"
    assert all(t.category == "param" for t in type_tokens)


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


def test_focus_overlay_for_of_introduces_loop_binding(tmp_path):
    code = """\
function f(nodes: any[]) {
  for (const node of nodes) {
    const len = node.data.length;
    return len;
  }
}
"""
    f = tmp_path / "loop.ts"
    f.write_text(code, encoding="utf-8")

    # Focus on the member access `node.data.length` line.
    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=200,
        focus_start_line=3,
        focus_end_line=3,
    )

    node_tokens = [t for t in overlay.tokens if _token_text(code, t) == "node"]
    assert node_tokens, "Expected at least one overlay token for `node`"
    assert not any(t.category == "unresolved" for t in node_tokens)


def test_focus_overlay_object_destructuring_shorthand_binds_locals(tmp_path):
    code = """\
export function filterData(node: any, options: any): any {
  const { extensions, maxLoc, excludedPaths } = options;
  return (extensions?.length ?? 0) + (maxLoc ?? 0) + excludedPaths.length + node.x;
}
"""
    f = tmp_path / "destructure.ts"
    f.write_text(code, encoding="utf-8")

    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=200,
        focus_start_line=3,
        focus_end_line=3,
    )

    for name in ("extensions", "maxLoc", "excludedPaths"):
        toks = [t for t in overlay.tokens if _token_text(code, t) == name]
        assert toks, f"Expected overlay tokens for `{name}`"
        assert not any(t.category == "unresolved" for t in toks)


def test_focus_overlay_array_destructuring_binds_locals(tmp_path):
    code = """\
function h(pair: any[]) {
  const [a, b] = pair;
  return a + b;
}
"""
    f = tmp_path / "array.ts"
    f.write_text(code, encoding="utf-8")

    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=200,
        focus_start_line=3,
        focus_end_line=3,
    )

    for name in ("a", "b"):
        toks = [t for t in overlay.tokens if _token_text(code, t) == name]
        assert toks, f"Expected overlay tokens for `{name}`"
        assert not any(t.category == "unresolved" for t in toks)


def test_focus_overlay_unsupported_file_types_noop(tmp_path):
    # Focus overlay currently supports only TypeScript/TSX sources.
    # For unsupported languages it should no-op (return no tokens) instead of erroring.
    code = "def f(x):\n    return x\n"
    f = tmp_path / "example.py"
    f.write_text(code, encoding="utf-8")

    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=50,
        focus_start_line=1,
        focus_end_line=2,
    )

    assert overlay.tokens == []

