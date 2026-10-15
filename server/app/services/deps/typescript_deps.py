"""TypeScript / JavaScript import extraction and module resolution."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Node, Parser

from app.services.deps.common import DepEdge, ImportBinding, SymbolDef, emit_symbol_edges
from app.services.deps.tsconfig import TsConfigResolver

TS_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
_RESOLVE_EXTS = (".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs")
_JS_TO_TS = {
    ".js": (".ts", ".tsx"),
    ".jsx": (".tsx",),
    ".mjs": (".mts",),
    ".cjs": (".cts",),
}

_TS = Language(tstypescript.language_typescript())
_TSX = Language(tstypescript.language_tsx())
_DECL_KINDS = {
    "function_declaration": "function",
    "generator_function_declaration": "function",
    "class_declaration": "class",
    "abstract_class_declaration": "class",
    "interface_declaration": "type",
    "type_alias_declaration": "type",
    "enum_declaration": "enum",
}


@dataclass
class ImportedName:
    imported: str  # name in the target module ("default" for default imports)
    local: str
    type_only: bool = False


@dataclass
class TsImport:
    source: str
    kind: str  # "static" | "side_effect" | "namespace" | "reexport" | "reexport_ns" | "reexport_all" | "dynamic"
    names: List[ImportedName] = field(default_factory=list)
    type_only: bool = False
    line: int = 0


@dataclass
class TsFileInfo:
    path: Path
    imports: List[TsImport] = field(default_factory=list)
    # exported name → local declaration name (for `export { a as b }` and declarations)
    local_exports: Dict[str, str] = field(default_factory=dict)
    # exported name → (source spec, imported name) for `export { a as b } from "x"`
    reexports: Dict[str, Tuple[str, str]] = field(default_factory=dict)
    # `export * from "x"`
    star_reexports: List[str] = field(default_factory=list)
    declarations: List[SymbolDef] = field(default_factory=list)
    # Top-level declaration nodes, kept for symbol-usage analysis.
    decl_nodes: Dict[str, Node] = field(default_factory=dict)
    tree_root: Optional[Node] = None


def _text(n: Optional[Node]) -> str:
    return n.text.decode("utf-8", "replace") if n is not None and n.text is not None else ""


def _string_value(n: Optional[Node]) -> Optional[str]:
    if n is None or n.type not in ("string", "template_string"):
        return None
    raw = _text(n)
    if n.type == "template_string" and "${" in raw:
        return None
    return raw[1:-1] if len(raw) >= 2 else None


def _has_type_keyword(n: Node) -> bool:
    return any(c.type == "type" for c in n.children)


def parse_ts_file(path: Path) -> TsFileInfo:
    content = path.read_bytes()
    parser = Parser(_TSX if path.suffix in (".tsx", ".jsx", ".js", ".mjs", ".cjs") else _TS)
    tree = parser.parse(content)
    info = TsFileInfo(path=path, tree_root=tree.root_node)
    root = tree.root_node

    for stmt in root.children:
        line = stmt.start_point[0] + 1
        if stmt.type == "import_statement":
            _parse_import(stmt, info, line)
        elif stmt.type == "export_statement":
            _parse_export(stmt, info, line)
        else:
            _record_declaration(stmt, info, exported=False)

    # Dynamic import() and require() anywhere in the file.
    stack = [root]
    while stack:
        n = stack.pop()
        if n.type == "call_expression":
            fn = n.child_by_field_name("function")
            args = n.child_by_field_name("arguments")
            is_dynamic = fn is not None and (fn.type == "import" or (fn.type == "identifier" and _text(fn) == "require"))
            if is_dynamic and args is not None:
                first = next((a for a in args.named_children), None)
                spec = _string_value(first)
                if spec:
                    info.imports.append(TsImport(source=spec, kind="dynamic", line=n.start_point[0] + 1))
        stack.extend(n.children)
    return info


def _parse_import(stmt: Node, info: TsFileInfo, line: int) -> None:
    spec = _string_value(stmt.child_by_field_name("source"))
    if not spec:
        return
    type_only = _has_type_keyword(stmt)
    clause = next((c for c in stmt.children if c.type == "import_clause"), None)
    if clause is None:
        info.imports.append(TsImport(source=spec, kind="side_effect", line=line))
        return
    imp = TsImport(source=spec, kind="static", type_only=type_only, line=line)
    for c in clause.children:
        if c.type == "identifier":
            imp.names.append(ImportedName("default", _text(c), type_only))
        elif c.type == "namespace_import":
            ident = next((x for x in c.children if x.type == "identifier"), None)
            imp.kind = "namespace"
            imp.names.append(ImportedName("*", _text(ident), type_only))
        elif c.type == "named_imports":
            for s in c.children:
                if s.type != "import_specifier":
                    continue
                name = _text(s.child_by_field_name("name"))
                alias = _text(s.child_by_field_name("alias")) or name
                imp.names.append(ImportedName(name, alias, type_only or _has_type_keyword(s)))
    info.imports.append(imp)


def _parse_export(stmt: Node, info: TsFileInfo, line: int) -> None:
    spec = _string_value(stmt.child_by_field_name("source"))
    type_only = _has_type_keyword(stmt)
    clause = next((c for c in stmt.children if c.type == "export_clause"), None)
    ns_export = next((c for c in stmt.children if c.type == "namespace_export"), None)

    if spec:
        if clause is not None:
            imp = TsImport(source=spec, kind="reexport", type_only=type_only, line=line)
            for s in clause.children:
                if s.type != "export_specifier":
                    continue
                name = _text(s.child_by_field_name("name"))
                alias = _text(s.child_by_field_name("alias")) or name
                imp.names.append(ImportedName(name, alias, type_only or _has_type_keyword(s)))
                info.reexports[alias] = (spec, name)
            info.imports.append(imp)
        elif ns_export is not None:
            ident = next((x for x in ns_export.children if x.type == "identifier"), None)
            info.imports.append(TsImport(source=spec, kind="reexport_ns", names=[ImportedName("*", _text(ident))], line=line))
            info.reexports[_text(ident)] = (spec, "*")
        else:
            info.imports.append(TsImport(source=spec, kind="reexport_all", type_only=type_only, line=line))
            info.star_reexports.append(spec)
        return

    if clause is not None:
        for s in clause.children:
            if s.type == "export_specifier":
                name = _text(s.child_by_field_name("name"))
                alias = _text(s.child_by_field_name("alias")) or name
                info.local_exports[alias] = name
        return

    is_default = any(c.type == "default" for c in stmt.children)
    decl = stmt.child_by_field_name("declaration")
    if decl is not None:
        names = _record_declaration(decl, info, exported=True)
        for n in names:
            info.local_exports["default" if is_default else n] = n
        if is_default and not names:
            info.local_exports["default"] = "default"
    elif is_default:
        value = stmt.child_by_field_name("value")
        local = _text(value) if value is not None and value.type == "identifier" else "default"
        info.local_exports["default"] = local
        if local == "default":
            info.declarations.append(SymbolDef("default", "value", line, exported=True))


def _record_declaration(node: Node, info: TsFileInfo, exported: bool) -> List[str]:
    line = node.start_point[0] + 1
    names: List[str] = []
    if node.type in _DECL_KINDS:
        name = _text(node.child_by_field_name("name"))
        if name:
            names.append(name)
            info.declarations.append(SymbolDef(name, _DECL_KINDS[node.type], line, exported))
            info.decl_nodes[name] = node
    elif node.type in ("lexical_declaration", "variable_declaration"):
        for d in node.named_children:
            if d.type != "variable_declarator":
                continue
            name_node = d.child_by_field_name("name")
            if name_node is None or name_node.type != "identifier":
                continue
            value = d.child_by_field_name("value")
            kind = "function" if value is not None and value.type in ("arrow_function", "function_expression", "function") else "variable"
            name = _text(name_node)
            names.append(name)
            info.declarations.append(SymbolDef(name, kind, d.start_point[0] + 1, exported))
            info.decl_nodes[name] = d
    return names


class TsModuleResolver:
    """Resolve module specifiers to files inside the analysed root."""

    def __init__(self, root: Path, files: Set[Path]):
        self.root = root.resolve()
        self.files = files
        self.tsconfigs = TsConfigResolver(stop_at=self.root)
        self.workspace = self._workspace_packages()

    def _workspace_packages(self) -> Dict[str, Path]:
        out: Dict[str, Path] = {}
        dirs = {f.parent for f in self.files}
        candidates: Set[Path] = set()
        for d in dirs:
            cur = d
            while True:
                if (cur / "package.json").is_file():
                    candidates.add(cur)
                if cur == self.root or cur.parent == cur:
                    break
                cur = cur.parent
        for d in candidates:
            try:
                name = json.loads((d / "package.json").read_text(encoding="utf-8")).get("name")
            except Exception:
                continue
            if isinstance(name, str) and name:
                out[name] = d
        return out

    def _try_module(self, candidate: Path) -> Optional[Path]:
        try:
            p = candidate.resolve()
        except OSError:
            return None
        if p in self.files:
            return p
        if p.suffix in _JS_TO_TS:
            for ext in _JS_TO_TS[p.suffix]:
                q = p.with_suffix(ext)
                if q in self.files:
                    return q
        for ext in _RESOLVE_EXTS:
            q = p.with_name(p.name + ext)
            if q in self.files:
                return q
        for ext in _RESOLVE_EXTS:
            q = p / f"index{ext}"
            if q in self.files:
                return q
        return None

    def resolve(self, spec: str, from_file: Path) -> Optional[Path]:
        if spec.startswith("."):
            return self._try_module(from_file.parent / spec)
        for cfg in self.tsconfigs.for_dir(from_file.parent):
            for cand in cfg.candidates(spec):
                hit = self._try_module(cand)
                if hit is not None:
                    return hit
        for name in sorted(self.workspace, key=len, reverse=True):
            if spec == name or spec.startswith(name + "/"):
                pkg = self.workspace[name]
                rest = spec[len(name) + 1 :]
                tries = [pkg / rest, pkg / "src" / rest] if rest else self._package_entries(pkg)
                for t in tries:
                    hit = self._try_module(t)
                    if hit is not None:
                        return hit
        return None

    def _package_entries(self, pkg: Path) -> List[Path]:
        entries: List[Path] = []
        try:
            data = json.loads((pkg / "package.json").read_text(encoding="utf-8"))
        except Exception:
            data = {}
        for key in ("source", "types", "module", "main"):
            v = data.get(key)
            if isinstance(v, str):
                entries.append(pkg / v.replace(".d.ts", ""))
        entries += [pkg / "src" / "index", pkg / "index"]
        return entries


def external_package(spec: str) -> str:
    if spec.startswith("node:"):
        return "node"
    parts = spec.split("/")
    if spec.startswith("@") and len(parts) > 1:
        return f"{parts[0]}/{parts[1]}"
    return parts[0]


def _is_external_spec(spec: str) -> bool:
    return not (spec.startswith(".") or spec.startswith("/"))


def build_ts_edges(root: Path, files: List[Path]) -> Tuple[List[DepEdge], Dict[Path, TsFileInfo]]:
    """Parse TS/JS files and return importer → imported edges (barrels passed through)."""
    file_set = set(files)
    infos: Dict[Path, TsFileInfo] = {}
    for f in files:
        try:
            infos[f] = parse_ts_file(f)
        except Exception as e:  # pragma: no cover - parse failures are skipped
            print(f"[deps] failed to parse {f}: {e}")
    resolver = TsModuleResolver(root, file_set)
    resolved_cache: Dict[Tuple[Path, str], Optional[Path]] = {}

    def resolve(spec: str, from_file: Path) -> Optional[Path]:
        key = (from_file.parent, spec) if not spec.startswith(".") else (from_file, spec)
        if key not in resolved_cache:
            resolved_cache[key] = resolver.resolve(spec, from_file)
        return resolved_cache[key]

    def find_definer(file: Path, name: str, depth: int = 0, seen: Optional[Set[Tuple[Path, str]]] = None) -> Tuple[Path, str]:
        """Follow re-exports until the file that declares `name`."""
        seen = seen or set()
        if depth > 12 or (file, name) in seen or name in ("*",):
            return file, name
        seen.add((file, name))
        info = infos.get(file)
        if info is None:
            return file, name
        if name in info.local_exports:
            return file, info.local_exports[name]
        if name in info.reexports:
            spec, imported = info.reexports[name]
            target = resolve(spec, file)
            if target is not None and imported != "*":
                return find_definer(target, imported, depth + 1, seen)
            return file, name
        for spec in info.star_reexports:
            target = resolve(spec, file)
            if target is None:
                continue
            t_file, t_name = find_definer(target, name, depth + 1, seen)
            t_info = infos.get(t_file)
            if t_info is not None and (t_name in t_info.local_exports.values() or t_name in t_info.local_exports):
                return t_file, t_name
        return file, name

    declared: Dict[Path, Set[str]] = {f: {d.name for d in i.declarations} for f, i in infos.items()}
    edges: List[DepEdge] = []
    for f, info in infos.items():
        bindings: Dict[str, ImportBinding] = {}
        for imp in info.imports:
            target = resolve(imp.source, f)
            if target is None:
                if _is_external_spec(imp.source):
                    edges.append(
                        DepEdge(
                            source=f,
                            target=external_package(imp.source),
                            symbols=[n.imported for n in imp.names],
                            type_only=imp.type_only or (bool(imp.names) and all(n.type_only for n in imp.names)),
                        )
                    )
                continue
            if target == f:
                continue
            if imp.kind == "static" and imp.names:
                # Bind each local name to its defining file (through barrels).
                for n in imp.names:
                    d_file, d_local = find_definer(target, n.imported)
                    bindings[n.local] = ImportBinding(
                        target_file=d_file,
                        target_symbol=d_local,
                        display=n.imported,
                        type_only=imp.type_only or n.type_only,
                        via_barrel=d_file != target,
                    )
            elif imp.kind == "namespace" and imp.names:
                bindings[imp.names[0].local] = ImportBinding(
                    target_file=target, target_symbol=None, display="*", type_only=imp.type_only, namespace=True
                )
            elif imp.kind == "reexport" and imp.names:
                # A barrel depends on what it re-exports (file level).
                by_definer: Dict[Path, List[ImportedName]] = {}
                for n in imp.names:
                    d_file, _d_name = find_definer(target, n.imported)
                    by_definer.setdefault(d_file, []).append(n)
                for d_file, names in by_definer.items():
                    if d_file != f:
                        edges.append(
                            DepEdge(
                                source=f,
                                target=d_file,
                                symbols=[n.imported for n in names],
                                type_only=imp.type_only or all(n.type_only for n in names),
                                via_barrel=d_file != target,
                            )
                        )
            else:
                edges.append(
                    DepEdge(source=f, target=target, symbols=[n.imported for n in imp.names], type_only=imp.type_only)
                )
        if bindings:
            usages = collect_ts_usages(info, set(bindings))
            edges.extend(emit_symbol_edges(f, bindings, usages, declared))
    return edges, infos


_USAGE_SKIP = {"import_statement"}


def collect_ts_usages(info: TsFileInfo, locals_: Set[str]) -> Dict[Optional[str], Set[Tuple[str, Optional[str]]]]:
    """Per top-level declaration, the imported locals (and `ns.attr` pairs) it references."""
    usages: Dict[Optional[str], Set[Tuple[str, Optional[str]]]] = {}
    decl_ids = {n.id: name for name, n in info.decl_nodes.items()}

    def walk(n: Node, user: Optional[str]) -> None:
        stack = [(n, user)]
        while stack:
            node, who = stack.pop()
            if node.id in decl_ids and node is not n:
                who = decl_ids[node.id]
            if node.type in _USAGE_SKIP:
                continue
            t = node.type
            if t in ("member_expression", "nested_type_identifier"):
                obj = node.child_by_field_name("object") if t == "member_expression" else node.child_by_field_name("module")
                prop = node.child_by_field_name("property") if t == "member_expression" else node.child_by_field_name("name")
                if obj is not None and obj.type == "identifier" and _text(obj) in locals_:
                    usages.setdefault(who, set()).add((_text(obj), _text(prop) or None))
                    if prop is not None:
                        continue
            elif t in ("identifier", "type_identifier", "shorthand_property_identifier"):
                name = _text(node)
                if name in locals_:
                    usages.setdefault(who, set()).add((name, None))
                continue
            for c in node.children:
                stack.append((c, who))

    if info.tree_root is not None:
        for stmt in info.tree_root.children:
            if stmt.type == "import_statement":
                continue
            if stmt.type == "export_statement" and stmt.child_by_field_name("source") is not None:
                continue
            who = decl_ids.get(stmt.id)
            walk(stmt, who)
    return usages
