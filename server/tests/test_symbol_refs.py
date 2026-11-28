from pathlib import Path

from app.services.symbols import refs
from app.services.symbols.index import build_symbol_index


def write(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def test_a_name_lists_every_copy_with_its_references(tmp_path: Path):
    write(tmp_path, "src/api.ts", "export type Doc = { id: string };\nexport const load = (): Doc => ({ id: '1' });\n")
    write(
        tmp_path,
        "src/view.ts",
        "import { load } from './api';\ntype Doc = { id: string };\nexport function show(): Doc { return load() as Doc; }\n",
    )
    write(tmp_path, "src/unused.ts", "export type Lonely = { x: number };\n")
    idx = build_symbol_index(tmp_path, use_cache=False)

    payload = refs.build(idx, "Doc")
    decls = {d["id"]: d for d in payload["declarations"]}
    assert list(decls) == ["src/api.ts#Doc", "src/view.ts#Doc"]  # the exported copy first
    assert {r["source"] for r in decls["src/api.ts#Doc"]["references"]} == {"src/api.ts#load"}
    assert {r["source"] for r in decls["src/view.ts#Doc"]["references"]} == {"src/view.ts#show"}

    # An id picks one declaration; `::` is the CLI spelling of `#`.
    assert [d["id"] for d in refs.build(idx, "src/api.ts::load")["declarations"]] == ["src/api.ts#load"]
    assert "No references." in refs.render(refs.build(idx, "Lonely"), limit=5)
    assert refs.build(idx, "Missing")["declarations"] == []
