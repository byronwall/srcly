import time
from pathlib import Path

from app.services.findings.duplicate_types import check_files


def write(root: Path, rel: str, text: str) -> str:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    return str(p)


def run(root: Path, files: list[str]):
    findings, _ = check_files(root.resolve(), files, "srcly-dup-types", time.monotonic() + 30)
    return {(Path(f.path).relative_to(root.resolve()).as_posix(), f.line): f.message for f in findings}


def test_a_local_copy_of_an_exported_type_is_reported_and_look_alikes_are_not(tmp_path: Path):
    files = [
        write(
            tmp_path,
            "src/api.ts",
            "export type Doc = { id: string; title: string; path?: string | null; createdAt: string; archive?: unknown };\n"
            "interface Run { id: string; status: string; startedAt: string }\n"
            "export { Run };\n"
            "export type Point = { x: number; y: number };\n",
        ),
        # A subset with quoted and optional keys: 4 of its 5 field names are in the exported Doc.
        write(
            tmp_path,
            "src/view.tsx",
            "type Doc = { id: string; 'title': string; path?: string | null; createdAt?: string; extra: number };\n",
        ),
        # An interface copy of a type exported through `export { Run }`.
        write(tmp_path, "src/runs.ts", "interface Run { id: string; status: string; startedAt: string; note?: string }\n"),
        # Two shared names are too common to mean a copy.
        write(tmp_path, "src/canvas.ts", "type Point = { x: number; y: number };\n"),
        # Same name, different shape: only 1 of 4 fields matches.
        write(tmp_path, "src/other.ts", "type Doc = { id: string; a: 1; b: 2; c: 3 };\n"),
        # Same field names, different field types: a layout tree is not the exported payload tree.
        write(tmp_path, "src/tree.ts", "export interface Node { name: string; path: string; kind: 'a' | 'b'; children?: Node[] }\n"),
        write(tmp_path, "src/layout.ts", "interface Node<T> { name: string; path: string; kind: 'x'; children?: Node<T>[] }\n"),
        # Exported on both sides: two public types, not a hidden copy.
        write(tmp_path, "src/public.ts", "export type Run = { id: string; status: string; startedAt: string };\n"),
        # Tests may restate a type on purpose.
        write(tmp_path, "src/view.test.ts", "type Doc = { id: string; title: string; path: string; createdAt: string };\n"),
    ]
    found = run(tmp_path, files)
    assert set(found) == {("src/view.tsx", 1), ("src/runs.ts", 1)}
    assert "exported `Doc` in src/api.ts:1 (4 of its 5 fields" in found[("src/view.tsx", 1)]
    # Two exported `Run`s tie on shared fields; the first path wins, so the message is stable.
    assert "src/api.ts:2" in found[("src/runs.ts", 1)]
