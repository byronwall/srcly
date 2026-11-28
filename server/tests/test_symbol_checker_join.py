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


def _result(targets, refs, file="src/m.ts"):
    return SymbolRefsResult.model_validate(
        {
            "outcome": "ok",
            "generation": 1,
            "programHash": "h",
            "tsconfig": "",
            "typescript": "5",
            "nullProof": True,
            "reason": None,
            "targets": [dict(zip(("file", "name", "line", "meaning", "scope"), t)) for t in targets],
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
