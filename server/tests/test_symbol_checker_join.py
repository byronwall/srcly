"""The checker's references joined to tree-sitter's ids (docs/intent/checker-symbol-index)."""

from pathlib import Path

from app.services.dataflow.models import SymbolRefsResult
from app.services.symbols.index import assemble
from app.services.symbols.typescript import extract_ts

M = "\n".join(
    [
        "export type Row = { id: number };",  # 1
        "export const Row = { id: 1 };",  # 2
        "export interface Shape {",  # 3
        "  width: number;",  # 4
        "}",  # 5
        "export class Store {",  # 6
        "  bump() {",  # 7
        "    return 1;",  # 8
        "  }",  # 9
        "}",  # 10
        "export function use(s: Store, shape: Shape) {",  # 11
        "  s.bump();",  # 12
        "  const r: Row = Row;",  # 13
        "  return shape.width;",  # 14
        "}",  # 15
        "declare function ambient(): void;",  # 16
    ]
)


def _result(targets, refs, file="src/m.ts", text=None):
    """Targets are (file, name, line, meaning, scope); the name's column is its first spelling on that line."""
    lines = (text or M).split("\n")
    targets = [(f, n, line, lines[line - 1].index(n) + 1, meaning, scope) for f, n, line, meaning, scope in targets]
    return SymbolRefsResult.model_validate(
        {
            "outcome": "ok",
            "generation": 1,
            "programHash": "h",
            "tsconfig": "",
            "typescript": "5",
            "nullProof": True,
            "reason": None,
            "targets": [dict(zip(("file", "name", "line", "column", "meaning", "scope"), t)) for t in targets],
            "files": [{"file": file, "refs": [dict(zip(("line", "column", "endColumn", "kind", "source", "target", "unbound"), r)) for r in refs]}],
            "counts": {"files": 1, "bound": 0, "unbound": 0, "external": 0},
        }
    )


def test_checker_refs_join_to_tree_sitter_ids(tmp_path: Path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "m.ts").write_text(M, encoding="utf-8")
    parts, _ = extract_ts(tmp_path, [tmp_path / "src" / "m.ts"])
    targets = [
        ("src/m.ts", "use", 11, "value", "module"),  # 0
        ("src/m.ts", "bump", 7, "value", "member"),  # 1
        ("src/m.ts", "Row", 1, "type", "module"),  # 2
        ("src/m.ts", "Row", 2, "value", "module"),  # 3
        ("src/m.ts", "width", 4, "value", "member"),  # 4: an interface field: no symbol of its own
        ("src/m.ts", "ambient", 16, "value", "module"),  # 5: a `declare function` the index keeps no symbol for
    ]
    refs = [
        (12, 5, 9, "call", 0, 1, None),
        (13, 12, 15, "type", 0, 2, None),
        (13, 18, 21, "read", 0, 3, None),
        (14, 16, 21, "read", 0, 4, None),
        (14, 3, 9, "read", 0, None, "any"),
        (16, 1, 8, "call", None, 5, None),
    ]
    idx = assemble(tmp_path, parts, _result(targets, refs))
    got = {(r.source, r.kind, r.target, r.line, r.column) for r in idx.references}
    use = "src/m.ts#use"
    assert (use, "call", "src/m.ts#Store.bump", 12, 5) in got
    # One name, two symbols: the position's meaning picks the side.
    assert (use, "type", "src/m.ts#Row@type", 13, 12) in got
    assert (use, "read", "src/m.ts#Row", 13, 18) in got
    # A member with no symbol joins the type that declares it.
    assert (use, "read", "src/m.ts#Shape", 14, 16) in got
    # Nothing is guessed: no tree-sitter `typed` or `name` reference is left for the file.
    assert {r.resolution for r in idx.references} == {"exact"}
    assert idx.binder == "checker" and idx.unbound == {"any": 1}
    assert idx.mismatched == ["src/m.ts:16 ambient (value)"]


def test_a_position_resolves_to_the_reference_there_never_a_name_search(tmp_path: Path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "m.ts").write_text(M, encoding="utf-8")
    parts, _ = extract_ts(tmp_path, [tmp_path / "src" / "m.ts"])
    targets = [("src/m.ts", "use", 11, "value", "module"), ("src/m.ts", "Row", 1, "type", "module"), ("src/m.ts", "Row", 2, "value", "module")]
    refs = [(13, 12, 15, "type", 0, 1, None), (13, 18, 21, "read", 0, 2, None)]
    idx = assemble(tmp_path, parts, _result(targets, refs))
    assert idx.at("src/m.ts", 13, 13, "Row") == ("src/m.ts#Row@type", [])
    assert idx.at("src/m.ts", 13, 18, "Row") == ("src/m.ts#Row", [])
    # A declaration's own name is the declaration; an unbound name is nothing, not the first search hit.
    assert idx.at("src/m.ts", 1, 13, "Row") == ("src/m.ts#Row@type", [])
    assert idx.at("src/m.ts", 14, 3, "shape") == (None, [])


def test_a_name_joins_only_the_declaration_on_its_own_line(tmp_path: Path):
    src = "\n".join(
        [
            "export function handler() {",  # 1
            "  function wrapper(handler: () => void) { handler(); }",  # 2
            "  return wrapper;",  # 3
            "}",  # 4
            "export function getSelection() { return document.getSelection(); }",  # 5
        ]
    )
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "h.ts").write_text(src, encoding="utf-8")
    parts, _ = extract_ts(tmp_path, [tmp_path / "src" / "h.ts"])
    targets = [("src/h.ts", "wrapper", 2, "value", "local"), ("src/h.ts", "handler", 2, "value", "local")]
    # `handler()` on line 2 calls the parameter, declared on line 2: not the function on line 1.
    idx = assemble(tmp_path, parts, _result(targets, [(2, 43, 50, "call", 0, 1, None)], file="src/h.ts", text=src))
    assert [r for r in idx.references if r.target == "src/h.ts#handler"] == []
    # The DOM method inside the one-line wrapper is not the wrapper; its own name is.
    assert idx.at("src/h.ts", 5, 50, "getSelection") == (None, [])
    assert idx.at("src/h.ts", 5, 17, "getSelection") == ("src/h.ts#getSelection", [])


def test_one_line_shadowing_and_positions_without_edges(tmp_path: Path):
    src = "export function handler() { function wrapper(handler: () => void) { handler(); } return handler(); }"
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "h.ts").write_text(src, encoding="utf-8")
    parts, _ = extract_ts(tmp_path, [tmp_path / "src" / "h.ts"])
    param = src.index("handler:") + 1
    targets = [("src/h.ts", "handler", 1, param, "value", "local"), ("src/h.ts", "handler", 1, 17, "value", "module")]
    result = SymbolRefsResult.model_validate(
        {
            "outcome": "ok", "generation": 1, "programHash": "h", "tsconfig": "", "typescript": "5", "nullProof": True, "reason": None,
            "targets": [dict(zip(("file", "name", "line", "column", "meaning", "scope"), t)) for t in targets],
            "files": [{"file": "src/h.ts", "refs": [
                # the parameter's call, then the recursive call to the function itself
                {"line": 1, "column": src.index("handler();") + 1, "endColumn": src.index("handler();") + 8, "kind": "call", "source": None, "target": 0, "unbound": None},
                {"line": 1, "column": src.rindex("handler()") + 1, "endColumn": src.rindex("handler()") + 8, "kind": "call", "source": 1, "target": 1, "unbound": None},
            ]}],
            "counts": {"files": 1, "bound": 2, "unbound": 0, "external": 0},
        }
    )
    idx = assemble(tmp_path, parts, result)
    # On one line, the parameter still never joins the outer function, and a recursive call makes no edge.
    assert idx.references == []
    # Show references still finds the function at its recursive call.
    assert idx.at("src/h.ts", 1, src.rindex("handler()") + 1, "handler") == ("src/h.ts#handler", [])
    assert idx.at("src/h.ts", 1, src.index("handler();") + 1, "handler") == (None, [])


def test_module_code_on_a_declaration_line_and_python_lookups_keep_their_binder(tmp_path: Path):
    from app.services.symbols.python import extract_py

    src = "export function run() {}; run();"
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "r.ts").write_text(src, encoding="utf-8")
    (tmp_path / "src" / "p.py").write_text("def go():\n    return 1\n\n\ndef main():\n    return go()\n", encoding="utf-8")
    ts_parts, _ = extract_ts(tmp_path, [tmp_path / "src" / "r.ts"])
    py_parts, _ = extract_py(tmp_path, [tmp_path / "src" / "p.py"])
    call = src.rindex("run") + 1
    result = SymbolRefsResult.model_validate(
        {
            "outcome": "ok", "generation": 1, "programHash": "h", "tsconfig": "", "typescript": "5", "nullProof": True, "reason": None,
            "targets": [{"file": "src/r.ts", "name": "run", "line": 1, "column": 17, "meaning": "value", "scope": "module"}],
            "files": [{"file": "src/r.ts", "refs": [{"line": 1, "column": call, "endColumn": call + 3, "kind": "call", "source": None, "target": 0, "unbound": None}]}],
            "counts": {"files": 1, "bound": 1, "unbound": 0, "external": 0},
        }
    )
    idx = assemble(tmp_path, ts_parts + py_parts, result)
    # No enclosing declaration is module code, even on the declaration's own line.
    assert ("src/r.ts", "src/r.ts#run") in {(r.source, r.target) for r in idx.references}
    # A Python file keeps tree-sitter's lookup in a checker index.
    assert idx.at("src/p.py", 6, 12, "go") == ("src/p.py#go", [])
