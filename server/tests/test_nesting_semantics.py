"""Nesting depth: `else if` / `elif` chains stay at one depth; real nesting still counts."""

from app.services.python.python_analysis import PythonTreeSitterAnalyzer
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer


def _scope(metrics, name):
    return next(fn for fn in metrics.function_list if fn.name == name)


def _analyze_ts(tmp_path, code, suffix=".ts"):
    f = tmp_path / f"code{suffix}"
    f.write_text(code, encoding="utf-8")
    return TreeSitterAnalyzer().analyze_file(str(f))


def _analyze_py(tmp_path, code):
    f = tmp_path / "code.py"
    f.write_text(code, encoding="utf-8")
    return PythonTreeSitterAnalyzer().analyze_file(str(f))


TS_ELSE_IF_CHAIN = """
function onKey(key: string) {
    if (key === "a") {
        return 1;
    } else if (key === "b") {
        return 2;
    } else if (key === "c") {
        return 3;
    } else if (key === "d") {
        return 4;
    } else {
        return 5;
    }
}
"""


def test_ts_else_if_chain_is_one_level(tmp_path):
    metrics = _analyze_ts(tmp_path, TS_ELSE_IF_CHAIN)
    fn = _scope(metrics, "onKey")
    assert fn.max_nesting_depth == 1
    assert metrics.max_nesting_depth == 1
    # Complexity is unchanged: every `else if` still adds a branch.
    assert fn.cyclomatic_complexity == 5


def test_ts_nesting_inside_else_if_branch_counts(tmp_path):
    code = """
function f(x: number) {
    if (x > 0) {
        return 1;
    } else if (x < 0) {
        for (let i = 0; i < 3; i++) {
            if (i === x) {
                return i;
            }
        }
    }
    return 0;
}
"""
    fn = _scope(_analyze_ts(tmp_path, code), "f")
    # if/else-if (1) > for (2) > if (3)
    assert fn.max_nesting_depth == 3


def test_ts_real_nested_ifs_still_count(tmp_path):
    code = """
function f(a: boolean, b: boolean, c: boolean) {
    if (a) {
        if (b) {
            if (c) {
                return 1;
            }
        }
    }
    return 0;
}
"""
    fn = _scope(_analyze_ts(tmp_path, code), "f")
    assert fn.max_nesting_depth == 3


def test_ts_if_inside_else_block_is_nested(tmp_path):
    # `else { if (...) }` is a real block, so the inner if nests one deeper.
    code = """
function f(a: boolean, b: boolean) {
    if (a) {
        return 1;
    } else {
        if (b) {
            return 2;
        }
    }
    return 0;
}
"""
    fn = _scope(_analyze_ts(tmp_path, code), "f")
    assert fn.max_nesting_depth == 2


def test_tsx_else_if_chain_is_one_level(tmp_path):
    metrics = _analyze_ts(tmp_path, TS_ELSE_IF_CHAIN, suffix=".tsx")
    assert _scope(metrics, "onKey").max_nesting_depth == 1


def test_python_elif_chain_is_one_level(tmp_path):
    code = """
def on_key(key):
    if key == "a":
        return 1
    elif key == "b":
        return 2
    elif key == "c":
        return 3
    elif key == "d":
        return 4
    else:
        return 5
"""
    metrics = _analyze_py(tmp_path, code)
    fn = _scope(metrics, "on_key")
    assert fn.max_nesting_depth == 1
    assert metrics.max_nesting_depth == 1


def test_python_real_nested_ifs_still_count(tmp_path):
    code = """
def f(a, b, c):
    if a:
        if b:
            if c:
                return 1
    return 0
"""
    fn = _scope(_analyze_py(tmp_path, code), "f")
    assert fn.max_nesting_depth == 3
