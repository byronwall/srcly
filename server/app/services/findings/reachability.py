"""Reachability: TS files no entry reaches, and exports nothing else uses.

Walks the TS/JS import graph from the entries and reports:

- ``unreachable-file``: no entry (production or test) reaches the file;
- ``unused-export``: nothing uses the export, not even its own file;
- ``export-used-in-file-only``: only its own file uses it, so ``export`` can go;
- ``test-only-export``: only test files import it.

``new URL("./x.worker.ts", import.meta.url)`` counts as an import. Files under
``examples`` and ``fixtures`` folders, and under a top-level ``docs`` folder,
are sample data and are not checked.

Each import is followed to the file that declares the name (through barrels
and ``export *``), so two exports that share a name never mix.

Entries, with no configuration:

- test files;
- route files (any file under a ``routes`` or ``pages`` folder) and
  ``src/{app,main,index,entry-*,middleware}.*`` beside a ``package.json``;
- files directly in a ``scripts`` or ``bin`` folder beside a ``package.json``
  (run by hand or by another program);
- every ``*.config.*`` file, and each string in it or in a package's
  ``.*rc*`` files that names a source file (``"./src/ws/jobs.ts"`` in a Vite
  route table, a Vitest alias target, an oxlint JS plugin);
- ``index.html`` script sources;
- ``package.json`` ``main``/``module``/``bin``/``exports`` and the files its
  ``scripts`` run.

``srcly.toml`` at the Git root can add entry globs, relative to that file::

    [reachability]
    entries = ["app/scripts/**/*.ts"]
"""

from __future__ import annotations

import json
import re
import time
import tomllib
from pathlib import Path
from typing import Iterable, Optional

from app.services.deps.common import is_test_path, walk_source_files
from app.services.deps.typescript_deps import TS_EXTENSIONS, TsFileInfo, TsImport, TsModuleResolver, parse_ts_file
from app.services.findings.model import Finding
from app.services.findings.tools import Tool, ToolTimeout, timeout_for

RULES = ("unreachable-file", "unused-export", "export-used-in-file-only", "test-only-export")

_ROUTE_DIRS = {"routes", "pages"}
_RUN_DIRS = {"scripts", "bin"}
_DATA_DIRS = {"examples", "fixtures", "__fixtures__"}
_NEW_URL = re.compile(r"""new\s+URL\(\s*["'`]([^"'`]+)["'`]\s*,\s*import\.meta\.url""")
_SRC_ENTRY = re.compile(r"^(app|main|index|middleware|entry-[\w-]+)\.[cm]?[jt]sx?$")
_CONFIG = re.compile(r"\.config\.[cm]?[jt]s$")
_SCRIPT_SRC = re.compile(r"""<script[^>]*\ssrc=["']([^"']+)["']""")
_STRING = re.compile(r"""["'`]([^"'`\s]+\.[cm]?[jt]sx?)["'`]|["'`](\.{1,2}/[^"'`\s]+)["'`]""")
_IDENT = frozenset({"identifier", "type_identifier", "shorthand_property_identifier"})


def _rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _sample_data(rel: str) -> bool:
    dirs = rel.split("/")[:-1]
    return bool(_DATA_DIRS & set(dirs)) or dirs[:1] == ["docs"]


class Graph:
    """Files, their import edges, and which files use each declared export."""

    def __init__(self, root: Path, files: list[Path], deadline: float = float("inf")) -> None:
        self.root = root
        self.files = set(files)
        self.infos: dict[Path, TsFileInfo] = {}
        for f in files:
            if time.monotonic() > deadline:
                raise ToolTimeout("while parsing")
            try:
                self.infos[f] = parse_ts_file(f)
            except Exception:  # noqa: BLE001 - an unparsable file is skipped
                continue
        self.resolver = TsModuleResolver(root, self.files)
        self._resolved: dict[tuple[Path, str], Optional[Path]] = {}
        self.edges: dict[Path, set[Path]] = {f: set() for f in self.infos}
        # (declaring file, local name) -> files that import it
        self.users: dict[tuple[Path, str], set[Path]] = {}
        # (declaring file, local name) -> barrels that re-export it by name
        self.passers: dict[tuple[Path, str], set[Path]] = {}
        self.whole: set[Path] = set()
        """Files imported as a whole (namespace, dynamic, ``require``): every export counts as used."""
        for f, info in self.infos.items():
            self._link(f, info)

    def resolve(self, spec: str, from_file: Path) -> Optional[Path]:
        key = (from_file, spec)
        if key not in self._resolved:
            self._resolved[key] = self.resolver.resolve(spec, from_file)
        return self._resolved[key]

    def definer(self, file: Path, name: str, seen: Optional[set] = None) -> Optional[tuple[Path, str]]:
        """The file and local name that declare export ``name`` of ``file`` (through re-exports)."""
        seen = seen if seen is not None else set()
        if (file, name) in seen or len(seen) > 24:
            return None
        seen.add((file, name))
        info = self.infos.get(file)
        if info is None:
            return None
        if name in info.local_exports:
            return file, info.local_exports[name]
        if name in info.reexports:
            spec, imported = info.reexports[name]
            target = self.resolve(spec, file)
            if target is None or imported == "*":
                return None
            return self.definer(target, imported, seen)
        if name == "default":
            return None
        for spec in info.star_reexports:
            target = self.resolve(spec, file)
            hit = self.definer(target, name, seen) if target is not None else None
            if hit is not None:
                return hit
        return None

    def _star_targets(self, file: Path, seen: set[Path]) -> None:
        """``file`` and every file its re-exports reach: a whole-module import uses all of them."""
        if file in seen or file not in self.infos:
            return
        seen.add(file)
        info = self.infos[file]
        for spec in [*info.star_reexports, *(s for s, _ in info.reexports.values())]:
            target = self.resolve(spec, file)
            if target is not None:
                self._star_targets(target, seen)

    def _link(self, f: Path, info: TsFileInfo) -> None:
        source = info.tree_root.text.decode("utf-8", "replace") if info.tree_root is not None else ""
        for spec in _NEW_URL.findall(source):
            info.imports.append(TsImport(source=spec, kind="url"))
        for imp in info.imports:
            target = self.resolve(imp.source, f)
            if target is None or target == f:
                continue
            self.edges[f].add(target)
            if imp.kind == "static":
                for n in imp.names:
                    hit = self.definer(target, n.imported)
                    if hit is not None:
                        self.users.setdefault(hit, set()).add(f)
                        if hit[0] != target:
                            self.edges[f].add(hit[0])
            elif imp.kind in ("namespace", "dynamic", "reexport_ns", "url"):
                seen: set[Path] = set()
                self._star_targets(target, seen)
                self.whole |= seen
                self.edges[f] |= seen
            elif imp.kind == "reexport":
                # `export {a} from` only passes the name through: the barrel's
                # importer is the user, but the barrel needs the export to stay.
                for n in imp.names:
                    hit = self.definer(target, n.imported)
                    if hit is not None:
                        self.passers.setdefault(hit, set()).add(f)

    def reach(self, starts: Iterable[Path]) -> set[Path]:
        seen: set[Path] = set()
        stack = [s for s in starts if s in self.infos]
        while stack:
            f = stack.pop()
            if f in seen:
                continue
            seen.add(f)
            stack.extend(self.edges.get(f, ()))
        return seen


# -- entries -----------------------------------------------------------------


def _package_dirs(files: Iterable[Path], root: Path) -> set[Path]:
    out: set[Path] = set()
    for d in {f.parent for f in files}:
        cur = d
        while True:
            if (cur / "package.json").is_file():
                out.add(cur)
            if cur == root or cur.parent == cur:
                break
            cur = cur.parent
    if (root / "package.json").is_file():
        out.add(root)
    return out


def _strings_to_files(text: str, base: Path, graph: Graph) -> set[Path]:
    out: set[Path] = set()
    for m in _STRING.finditer(text):
        spec = m.group(1) or m.group(2)
        for cand in (spec, "./" + spec.lstrip("/")):
            hit = graph.resolver._try_module(base / cand)
            if hit is not None:
                out.add(hit)
                break
    return out


def _package_json_entries(pkg: Path, graph: Graph) -> set[Path]:
    try:
        data = json.loads((pkg / "package.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return set()
    values: list[str] = []

    def collect(v) -> None:
        if isinstance(v, str):
            values.append(v)
        elif isinstance(v, dict):
            for x in v.values():
                collect(x)
        elif isinstance(v, list):
            for x in v:
                collect(x)

    for key in ("main", "module", "source", "bin", "exports"):
        collect(data.get(key))
    out: set[Path] = set()
    for v in values:
        hit = graph.resolver._try_module(pkg / v.replace(".d.ts", ""))
        if hit is not None:
            out.add(hit)
    for cmd in (data.get("scripts") or {}).values():
        if not isinstance(cmd, str):
            continue
        for token in re.split(r"[\s;&|=()'\"]+", cmd):
            if "/" in token or re.search(r"\.[cm]?[jt]sx?$", token):
                hit = graph.resolver._try_module(pkg / token)
                if hit is not None:
                    out.add(hit)
    return out


def config_entries(root: Path) -> list[str]:
    """Entry globs from ``srcly.toml`` at the Git root, made relative to ``root``."""
    from app.services.analysis import find_repo_root

    repo = find_repo_root(root)
    path = repo / "srcly.toml"
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError):
        return []
    globs = (data.get("reachability") or {}).get("entries") or []
    return [str(g) for g in globs if isinstance(g, str)]


def find_entries(graph: Graph, extra_globs: Iterable[str] = ()) -> tuple[set[Path], set[Path]]:
    """(production entries, test entries)."""
    root = graph.root
    prod: set[Path] = set()
    tests: set[Path] = set()
    for f in graph.infos:
        rel = _rel(f, root)
        if is_test_path(rel):
            tests.add(f)
        elif _ROUTE_DIRS & set(rel.split("/")[:-1]) or _CONFIG.search(f.name):
            prod.add(f)
        elif f.parent.name == "src" and _SRC_ENTRY.match(f.name) and (f.parent.parent / "package.json").is_file():
            prod.add(f)
        elif f.parent.name in _RUN_DIRS and (f.parent.parent / "package.json").is_file():
            prod.add(f)
    for f in [p for p in graph.infos if _CONFIG.search(p.name)]:
        try:
            text = f.read_text(encoding="utf-8")
        except OSError:
            continue
        hits = _strings_to_files(text, f.parent, graph)
        (tests if "vitest" in f.name or "playwright" in f.name else prod).update(hits)
    for pkg in _package_dirs(graph.infos, root):
        prod |= _package_json_entries(pkg, graph)
        for rc in pkg.glob(".*rc*"):
            if rc.is_file():
                prod |= _strings_to_files(rc.read_text(encoding="utf-8", errors="replace"), pkg, graph)
        html = pkg / "index.html"
        if html.is_file():
            for src in _SCRIPT_SRC.findall(html.read_text(encoding="utf-8", errors="replace")):
                hit = graph.resolver._try_module(pkg / src.lstrip("/"))
                if hit is not None:
                    prod.add(hit)
    from app.services.analysis import find_repo_root

    repo = find_repo_root(root)
    for pattern in extra_globs:
        for hit in repo.glob(pattern):
            if hit.resolve() in graph.infos:
                prod.add(hit.resolve())
    return prod, tests


# -- findings ----------------------------------------------------------------


def _decl_name_node(node):
    if node.type == "variable_declarator":
        return node.child_by_field_name("name")
    return node.child_by_field_name("name")


def _used_in_own_file(info: TsFileInfo, local: str) -> bool:
    """Whether ``local`` is referenced in its file beyond its declaration and export clause."""
    decl = info.decl_nodes.get(local)
    skip = _decl_name_node(decl).id if decl is not None and _decl_name_node(decl) is not None else None
    stack = [info.tree_root] if info.tree_root is not None else []
    while stack:
        node = stack.pop()
        if node.type in _IDENT and node.text == local.encode() and node.id != skip:
            parent = node.parent
            if parent is None or parent.type != "export_specifier":
                return True
        stack.extend(node.children)
    return False


def _export_line(info: TsFileInfo, name: str, local: str) -> tuple[int, int, int]:
    decl = info.decl_nodes.get(local)
    if decl is not None:
        start = decl.parent if decl.type == "variable_declarator" and decl.parent is not None else decl
        top = start.parent if start.parent is not None and start.parent.type == "export_statement" else start
        return top.start_point.row + 1, top.end_point.row + 1, top.start_point.column + 1
    line = next((d.line for d in info.declarations if d.name == local), 1)
    return line, line, 1


def analyze(root: Path, files: Optional[list[Path]] = None, tool_id: str = "srcly-reach", deadline: float = float("inf")) -> Optional[list[Finding]]:
    """Findings for ``root``, or ``None`` when it has no production entry to walk from."""
    root = root.resolve()
    files = files if files is not None else walk_source_files(root, TS_EXTENSIONS)
    files = [f for f in files if not _sample_data(_rel(f, root)) and not re.search(r"\.d\.[cm]?ts$", f.name)]
    graph = Graph(root, files, deadline)
    prod, tests = find_entries(graph, config_entries(root))
    if not prod:
        return None
    from_prod = graph.reach(prod)
    from_any = from_prod | graph.reach(tests)
    entries = prod | tests
    findings: list[Finding] = []

    def add(path: Path, line: int, end: int, col: int, rule: str, message: str) -> None:
        findings.append(Finding(str(path), line, end, col, rule, message, "warning", tool_id))

    for f, info in sorted(graph.infos.items()):
        if f not in from_any:
            add(f, 1, 1, 1, "unreachable-file", "No entry imports this file, directly or through other files")
            continue
        if f in entries or f in graph.whole:
            continue
        for name, local in sorted(info.local_exports.items()):
            if local == "default" and name == "default":
                continue
            users = graph.users.get((f, local), set()) - {f}
            passers = graph.passers.get((f, local), set()) - {f}
            line, end, col = _export_line(info, name, local)
            if users:
                # Exports of test helpers (reached only from tests) are for tests.
                if all(u in tests for u in users) and f in from_prod:
                    add(f, line, end, col, "test-only-export", f"`{name}` is imported only by tests")
                continue
            if passers:
                via = ", ".join(sorted(_rel(p, root) for p in passers))
                add(f, line, end, col, "unused-export", f"`{name}` is re-exported by {via} but never imported")
            elif _used_in_own_file(info, local):
                add(f, line, end, col, "export-used-in-file-only", f"`{name}` is used only in this file: drop `export`")
            else:
                add(f, line, end, col, "unused-export", f"`{name}` is exported but never used")
    return findings


class ReachabilityTool(Tool):
    def __init__(self, root: Path, files: Optional[list[str]] = None) -> None:
        super().__init__(
            id="srcly-reach",
            tool="srcly-reach",
            label="srcly reachability",
            source="srcly defaults",
            root=root,
            extensions=(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"),
            timeout=timeout_for("srcly-reach"),
        )
        self._files = files

    def check(self):
        deadline = time.monotonic() + self.timeout
        files = [Path(f) for f in self._files] if self._files is not None else walk_source_files(self.root, TS_EXTENSIONS)
        findings = analyze(self.root, files, self.id, deadline)
        if findings is None:
            return [], []
        return findings, [str(f) for f in files]
