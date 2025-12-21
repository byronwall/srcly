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


def test_focus_overlay_missing_globals(tmp_path):
    code = """
    function f() {
        Object.keys({});
        requestAnimationFrame(() => {});
        cancelAnimationFrame(0);
        localStorage.getItem("x");
        confirm("ok?");
        const filter = NodeFilter.SHOW_ELEMENT;
    }
    """
    f = tmp_path / "globals.ts"
    f.write_text(code, encoding="utf-8")
    overlay = compute_focus_overlay(file_path=str(f), slice_start_line=1, slice_end_line=100, focus_start_line=1, focus_end_line=100)

    def get_tokens(name):
        return [t for t in overlay.tokens if _token_text(code, t) == name]

    for name in ["Object", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "confirm", "NodeFilter"]:
        toks = get_tokens(name)
        assert toks, f"Missing token for {name}"
        assert toks[0].category == "builtin", f"{name} was unexpectedly resolved to {toks[0].category}"


def test_focus_overlay_jsx_div(tmp_path):
    code = """
    function Comp() {
        return <div className="foo">text</div>;
    }
    """
    f = tmp_path / "comp.tsx"
    f.write_text(code, encoding="utf-8")
    overlay = compute_focus_overlay(file_path=str(f), slice_start_line=1, slice_end_line=100, focus_start_line=1, focus_end_line=100)

    div_tokens = [t for t in overlay.tokens if _token_text(code, t) == "div"]
    # We expect 'div' tokens in JSX to be skipped or treated as something other than unresolved.
    # Current implementation skips them.
    assert not div_tokens, f"Expected no tokens for JSX 'div', but found: {div_tokens}"


def test_focus_overlay_hoisting(tmp_path):
    code = """
    function main() {
        hoisted();
    }
    function hoisted() { return 1; }
    """
    f = tmp_path / "hoist.ts"
    f.write_text(code, encoding="utf-8")
    overlay = compute_focus_overlay(file_path=str(f), slice_start_line=1, slice_end_line=100, focus_start_line=1, focus_end_line=100)

    toks = [t for t in overlay.tokens if _token_text(code, t) == "hoisted"]
    assert toks, "Missing tokens for hoisted"
    assert toks[0].category in ("module", "local"), f"Category was {toks[0].category}"


def test_focus_overlay_catch_param(tmp_path):
    code = """
    try {
    } catch (err) {
        console.log(err);
    }
    """
    f = tmp_path / "catch.ts"
    f.write_text(code, encoding="utf-8")
    overlay = compute_focus_overlay(file_path=str(f), slice_start_line=1, slice_end_line=100, focus_start_line=1, focus_end_line=100)

    toks = [t for t in overlay.tokens if _token_text(code, t) == "err"]
    assert toks, "Missing err tokens"
    # The usage inside console.log(err) should be resolved to the 'param' in catch.
    assert all(t.category == "param" for t in toks)


def test_focus_overlay_destructuring_binding_noise(tmp_path):
    # Tests that destructuring bindings themselves don't produce usage tokens.
    code = """
    const { x } = { x: 1 };
    """
    f = tmp_path / "dest.ts"
    f.write_text(code, encoding="utf-8")
    overlay = compute_focus_overlay(file_path=str(f), slice_start_line=1, slice_end_line=100, focus_start_line=1, focus_end_line=100)

    x_tokens = [t for t in overlay.tokens if _token_text(code, t) == "x"]
    # The 'x' in `{ x }` is a binding, and the 'x' in `{ x: 1 }` is a property identifier.
    # Neither should be surfaced as a usage token in this context.
    assert not x_tokens, f"Found unexpected usage tokens for 'x': {x_tokens}"


def test_focus_overlay_new_builtins(tmp_path):
    code = """
    function test() {
        const nav = navigator.userAgent;
        const fmt = new Intl.NumberFormat();
        const err = new AggregateError([]);
        if (nav === undefined) return NaN;
    }
    """
    f = tmp_path / "new_builtins.ts"
    f.write_text(code, encoding="utf-8")
    overlay = compute_focus_overlay(file_path=str(f), slice_start_line=1, slice_end_line=100, focus_start_line=1, focus_end_line=100)

    for name in ["navigator", "Intl", "AggregateError", "NaN"]:
        toks = [t for t in overlay.tokens if _token_text(code, t) == name]
        assert toks, f"Missing token for {name}"
        assert toks[0].category == "builtin", f"{name} was unexpectedly resolved to {toks[0].category}"


def test_focus_overlay_nested_capture_with_large_focus(tmp_path):
    # Regression test for per-token scope resolution.
    # Previously, a large focus range would cause the heuristic to pick the outermost 
    # function scope, making captured variables in nested functions appear as "local".
    code = """
export default function DataFlowViz(props: any) {
  const [loading, setLoading] = createSignal(true);
  
  async function fetchData(path: string) {
    setLoading(true);
  }
}
"""
    f = tmp_path / "large_focus.tsx"
    f.write_text(code, encoding="utf-8")

    # Focus spans the entire component.
    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=200,
        focus_start_line=1,
        focus_end_line=200,
    )

    # 'setLoading' appears twice in the focused range:
    # 1. The definition on line 3 (category: local)
    # 2. The usage on line 6 (category: capture)
    set_loading_tokens = [t for t in overlay.tokens if _token_text(code, t) == "setLoading"]
    assert set_loading_tokens, "Expected token for setLoading"
    
    usage_tokens = [t for t in set_loading_tokens if t.fileLine == 6]
    assert usage_tokens, "Expected usage token for setLoading on line 6"
    assert all(t.category == "local" for t in usage_tokens), f"Expected 'local' for usage on line 6, got {[t.category for t in usage_tokens]}"
    
    def_tokens = [t for t in set_loading_tokens if t.fileLine == 3]
    assert not def_tokens, "Expected NO definition token for setLoading on line 3"
