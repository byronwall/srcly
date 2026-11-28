"""``copied-type-cast`` on a small project, through the real TypeScript checker. Skips without Node or engine/node_modules."""

import shutil
from pathlib import Path

import pytest

from app.services.dataflow.availability import ENGINE_DIR
from app.services.findings import copied_type_casts
from app.services.findings.tools import run

TS = ENGINE_DIR / "node_modules" / "typescript"
pytestmark = pytest.mark.skipif(shutil.which("node") is None or not TS.is_dir(), reason="needs Node and engine/node_modules")


def write(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def test_a_cast_onto_a_same_name_copy_is_reported_and_other_casts_are_not(tmp_path: Path):
    root = tmp_path.resolve()
    (root / "node_modules").mkdir()
    (root / "node_modules" / "typescript").symlink_to(TS.resolve())
    write(root, "tsconfig.json", '{ "compilerOptions": { "strict": true, "noEmit": true, "lib": ["es2022", "dom"] }, "include": ["src"] }\n')
    write(
        root,
        "src/api.ts",
        "export type Doc = { id: string; title: string };\n"
        'export type Status = "open" | "done";\n'
        "export declare function fetchDoc(id: string): Promise<Doc>;\n"
        "export declare function status(): Status;\n",
    )
    write(
        root,
        "src/view.ts",
        'import { fetchDoc, status, type Doc as Shared } from "./api";\n'
        "type Doc = { id: string; title: string; extra?: number };\n"
        'type Status = "open" | "done";\n'
        # True: the payload of the promise is a same-name copy, and so is the union alias.
        'export const a = fetchDoc("1") as Promise<Doc>;\n'
        "export const b = status() as Status;\n"
        # False: the same declaration under another local name, an anonymous shape, `as const`, a lib type.
        'export const c = fetchDoc("1") as Promise<Shared>;\n'
        "export const d = ({ id: \"1\" }) as { id: string };\n"
        'export const e = ["x"] as const;\n'
        "export const f = new Blob().stream() as ReadableStream<Uint8Array>;\n",
    )
    # Tests are skipped.
    write(root, "src/view.test.ts", 'import { status } from "./api";\ntype Status = "open" | "done";\nexport const t = status() as Status;\n')

    tools = copied_type_casts.plan(root)
    assert [t.id for t in tools] == ["srcly-casts:tsconfig.json"]
    result, findings = run(tools[0])
    assert result.status == "ok", result.reason
    assert sorted(Path(f).relative_to(root).as_posix() for f in result.files) == ["src/api.ts", "src/view.ts"]
    got = {(Path(f.path).relative_to(root).as_posix(), f.line): f.message for f in findings}
    assert list(got) == [("src/view.ts", 4), ("src/view.ts", 5)]
    assert got[("src/view.ts", 4)].startswith(
        '`fetchDoc("1") as Promise<Doc>` casts the `Doc` from src/api.ts:1 to a different `Doc`, declared in src/view.ts:2.'
    )
    assert "`Status` from src/api.ts:2" in got[("src/view.ts", 5)]


def test_a_project_without_typescript_gets_no_run(tmp_path: Path):
    write(tmp_path, "tsconfig.json", "{}\n")
    write(tmp_path, "src/a.ts", "export const a = 1 as number;\n")
    assert copied_type_casts.plan(tmp_path) == []
