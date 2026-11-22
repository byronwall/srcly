"""The tree and both structural views agree on Git visibility, not eligibility."""

import os
import subprocess
from pathlib import Path

from app.models import DepGraph
from app.services.analysis import git_inventory_files, scan_codebase
from app.services.cache import fingerprint
from app.services.deps.graph import build_dependency_graph
from app.services.symbols.index import SymbolIndex, build_symbol_index

HELPER = "src/lib/notes.ts"
CALLEE = f"{HELPER}#toDetail"
CALLER = "src/app.ts#showNote"
IGNORED = "src/lib/private.ts"


def git(root: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)


def fixture(root: Path) -> None:
    for path, contents in {
        ".gitignore": "lib/\n",
        "src/app.ts": 'import { toDetail } from "./lib/notes";\nexport function showNote() { return toDetail(); }\n',
        HELPER: "export function toDetail() { return 42; }\n",
        IGNORED: "export function privateOnly() {}\n",
        "src/types.d.ts": "export declare function typesOnly(): void;\n",
        "src/page.md": "# Not a structural source file\n",
        "src/node_modules/pkg/index.ts": "export function vendor() {}\n",
        "src/.project/hidden.ts": "export function hidden() {}\n",
    }.items():
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents, encoding="utf-8")


def scanned_paths(root: Path) -> set[str]:
    tree = scan_codebase(root, verbose=False)
    pending = [tree]
    paths: set[str] = set()
    while pending:
        node = pending.pop()
        if node.type == "file":
            paths.add(Path(node.path).relative_to(root).as_posix())
        elif node.type == "folder":
            pending.extend(node.children or [])
    return paths


def assert_views(root: Path, *, visible: bool) -> tuple[DepGraph, SymbolIndex]:
    tree = scanned_paths(root)
    imports = build_dependency_graph(root)
    symbols = build_symbol_index(root)
    imported_files = {n.id for n in imports.nodes if n.kind == "file"}
    assert (HELPER in tree) is visible
    assert (HELPER in imported_files) is visible
    assert ((CALLER, CALLEE) in {(e.source, e.target) for e in imports.edges}) is visible
    assert [hit.id for hit in symbols.search("toDetail")] == ([CALLEE] if visible else [])
    assert ((CALLER, "call", CALLEE) in {(r.source, r.kind, r.target) for r in symbols.references}) is visible
    assert "src/app.ts" in tree & imported_files and CALLER in symbols.symbols
    assert IGNORED not in tree | imported_files and not symbols.search("privateOnly")
    for path in ("src/types.d.ts", "src/page.md", "src/.project/hidden.ts", "src/node_modules/pkg/index.ts"):
        assert path not in imported_files and path not in symbols.symbols
    assert {"src/types.d.ts", "src/page.md", "src/.project/hidden.ts"} <= tree
    return imports, symbols


def test_tracked_ignored_source_and_index_only_invalidation(tmp_path: Path) -> None:
    git(tmp_path, "init", "-q")
    fixture(tmp_path)
    git(tmp_path, "add", "-f", "--", HELPER, "src/node_modules/pkg/index.ts")
    before = fingerprint(tmp_path)
    imports, symbols = assert_views(tmp_path, visible=True)
    stat = (tmp_path / HELPER).stat()

    # Removing the tracked entry does not touch the source file on disk.
    git(tmp_path, "rm", "--cached", "-f", "--", HELPER)
    assert (tmp_path / HELPER).stat().st_mtime_ns == stat.st_mtime_ns
    ignored = fingerprint(tmp_path)
    assert ignored != before
    next_imports, next_symbols = assert_views(tmp_path, visible=False)
    assert next_imports is not imports and next_symbols is not symbols

    git(tmp_path, "add", "-f", "--", HELPER)
    assert fingerprint(tmp_path) == before
    restored_imports, restored_symbols = assert_views(tmp_path, visible=True)
    assert restored_imports is not next_imports and restored_symbols is not next_symbols

    path = tmp_path / HELPER
    path.write_text("export function renamedDetail() { return 42; }\n", encoding="utf-8")
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
    assert fingerprint(tmp_path) != before
    assert not any(e.target == CALLEE for e in build_dependency_graph(tmp_path).edges)
    assert not build_symbol_index(tmp_path).search("toDetail")


def test_non_git_source_inventory_still_honors_gitignore(tmp_path: Path, monkeypatch) -> None:
    # Isolate this control even if the executor's temp directory is under Git.
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    fixture(tmp_path)
    assert git_inventory_files(tmp_path) is None
    assert_views(tmp_path, visible=False)
