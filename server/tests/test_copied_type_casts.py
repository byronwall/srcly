"""``copied-type-cast`` on a small project, through the real TypeScript checker. Skips without Node or engine/node_modules."""

import os
import shutil
from pathlib import Path

import pytest

from app.services.dataflow.availability import ENGINE_DIR
from app.services.findings import copied_type_casts, listing
from app.services.findings.model import FindingsResult
from app.services.findings.tools import run

TS = ENGINE_DIR / "node_modules" / "typescript"
pytestmark = pytest.mark.skipif(shutil.which("node") is None or not TS.is_dir(), reason="needs Node and engine/node_modules")


def write(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def project(root: Path, config: str = '{ "compilerOptions": { "strict": true, "lib": ["es2022", "dom"] }, "include": ["src"] }\n') -> Path:
    root = root.resolve()
    (root / "node_modules").mkdir(parents=True)
    (root / "node_modules" / "typescript").symlink_to(TS.resolve())
    write(root, "tsconfig.json", config)
    return root


def findings_of(root: Path, scan: Path | None = None):
    tools = copied_type_casts.plan(scan or root)
    assert [t.id for t in tools] == ["srcly-casts:tsconfig.json"]
    result, findings = run(tools[0])
    return result, {(Path(f.path).relative_to(root).as_posix(), f.line): f.message for f in findings}


def test_a_cast_onto_a_same_name_copy_is_reported_and_other_casts_are_not(tmp_path: Path):
    root = project(tmp_path)
    write(
        root,
        "src/api.ts",
        "export type Doc = { id: string; title: string };\n"
        'export type Status = "open" | "done";\n'
        "export declare function fetchDoc(id: string): Promise<Doc>;\n"
        "export declare function status(): Status;\n"
        "export enum Level { Low, High }\n"
        "export enum Only { Unknown }\n"
        "export declare const level: Level;\n",
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
        "export const f = new Blob().stream() as ReadableStream<Uint8Array>;\n"
        # True: a narrowed enum value still stands for its enum.
        'import { Level as ApiLevel, Only, level } from "./api";\n'
        "enum Level { Low, High }\n"
        "export const g = (level === ApiLevel.Low ? level : ApiLevel.Low) as Level;\n"
        "export const h = ApiLevel.Low as Level;\n"
        # False: a one-member enum's value is not a type named after the member; type parameters are not copies.
        "type Unknown = { u: 1 };\n"
        "export const i = Only.Unknown as Unknown;\n"
        "export function j<T>(x: T) { return <T,>(y: T) => x as T; }\n",
    )
    # Tests are skipped.
    write(root, "src/view.test.ts", 'import { status } from "./api";\ntype Status = "open" | "done";\nexport const t = status() as Status;\n')

    result, got = findings_of(root)
    assert result.status == "ok", result.reason
    assert sorted(Path(f).relative_to(root).as_posix() for f in result.files) == ["src/api.ts", "src/view.ts"]
    assert list(got) == [("src/view.ts", 4), ("src/view.ts", 5), ("src/view.ts", 12), ("src/view.ts", 13)]
    assert got[("src/view.ts", 4)].startswith(
        '`fetchDoc("1") as Promise<Doc>` casts the `Doc` from src/api.ts:1 to a different `Doc`, declared in src/view.ts:2.'
    )
    assert "`Status` from src/api.ts:2" in got[("src/view.ts", 5)]


def test_one_file_as_the_root_is_checked_and_a_change_outside_it_is_a_new_signature(tmp_path: Path):
    root = project(tmp_path)
    write(root, "src/api.ts", "export type Doc = { id: string };\nexport declare const doc: Doc;\n")
    write(root, "src/ui/view.ts", 'import { doc } from "../api";\ntype Doc = { id: string };\nexport const a = doc as Doc;\n')
    view = root / "src/ui/view.ts"
    result, got = findings_of(root, view)
    assert [Path(f).relative_to(root).as_posix() for f in result.files] == ["src/ui/view.ts"]
    assert list(got) == [("src/ui/view.ts", 3)]
    assert "`Doc` from src/api.ts:1" in got[("src/ui/view.ts", 3)]
    # The checker reads api.ts, outside the scanned folder, so it is part of the cache signature.
    tool = copied_type_casts.plan(root / "src/ui")[0]
    before = tool.signature()
    write(root, "src/api.ts", "export type ApiDoc = { id: string };\nexport declare const doc: ApiDoc;\n")
    os.utime(root / "src/api.ts", ns=(1, 1))
    assert tool.signature() != before


def test_a_broken_tsconfig_is_na_not_zero(tmp_path: Path):
    root = project(tmp_path, '{ "extends": "./missing-base.json", "include": ["src"] }\n')
    write(root, "src/a.ts", "export const a = 1 as number;\n")
    result, got = findings_of(root)
    assert result.status == "na" and "missing-base.json" in result.reason


def test_configs_it_cannot_check_make_the_rule_na(tmp_path: Path):
    root = tmp_path.resolve()
    for name in "abcdefg":
        write(root, f"{name}/tsconfig.json", "{}\n")
    assert copied_type_casts.plan(root) == []
    skipped = copied_type_casts.unscheduled(root)
    assert skipped[0] == ("srcly-casts", "srcly copied-type casts (a/tsconfig.json)", "no node_modules/typescript")
    assert skipped[-1][2] == "over the limit of 6 projects"
    got = listing.build(root, FindingsResult(root=str(root), status="ok"), [], ["copied-type-cast"], skipped)
    assert got["rules"][0]["count"] is None
    assert "srcly copied-type casts (g/tsconfig.json) not run: over the limit of 6 projects" in got["rules"][0]["reason"]
