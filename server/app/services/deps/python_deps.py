"""Python import extraction and module resolution for the dependency graph."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import tree_sitter_python as tspython
from tree_sitter import Language, Node, Parser

from app.services.deps.common import DepEdge, ImportBinding, SymbolDef, emit_symbol_edges

PY_EXTENSIONS = {".py"}
_PY = Language(tspython.language())
_PROJECT_MARKERS = ("pyproject.toml", "setup.py", "setup.cfg")


@dataclass
class PyImport:
    # Absolute dotted module after resolving relative dots ("" when unknown).
    module: str
    # Names for `from module import a, b as c`: (imported, local). Empty for `import module`.
    names: List[Tuple[str, str]] = field(default_factory=list)
    local: Optional[str] = None  # alias for `import a.b as x`
    star: bool = False
    type_only: bool = False
    is_from: bool = False
    line: int = 0
    top_level: bool = True


@dataclass
class PyFileInfo:
    path: Path
    module: str
    is_package: bool
    imports: List[PyImport] = field(default_factory=list)
    declarations: List[SymbolDef] = field(default_factory=list)
    # local name → (absolute module, imported name) for `from x import y [as z]`
    imported_names: Dict[str, Tuple[str, str]] = field(default_factory=dict)
    decl_nodes: Dict[str, Node] = field(default_factory=dict)
    tree_root: Optional[Node] = None


def _text(n: Optional[Node]) -> str:
    return n.text.decode("utf-8", "replace") if n is not None and n.text is not None else ""


def find_source_roots(root: Path, files: List[Path]) -> List[Path]:
    """Directories that act as import roots, most specific first."""
    roots: Set[Path] = {root}
    dirs = {f.parent for f in files}
    # Project markers and src/ layouts.
    for d in list(dirs) + [root]:
        cur = d
        while True:
            if any((cur / m).is_file() for m in _PROJECT_MARKERS):
                roots.add(cur)
                if (cur / "src").is_dir():
                    roots.add(cur / "src")
            if cur == root or cur.parent == cur:
                break
            cur = cur.parent
    # The parent of each top-level package (a dir with __init__.py whose parent has none).
    for d in dirs:
        if not (d / "__init__.py").is_file():
            continue
        top = d
        while (top.parent / "__init__.py").is_file() and top.parent != root.parent:
            top = top.parent
        roots.add(top.parent)
    # Deeper roots first so the most specific module name wins.
    return sorted((r for r in roots if r == root or root in r.parents), key=lambda p: -len(p.parts))


def module_name(path: Path, source_root: Path) -> Optional[str]:
    try:
        rel = path.relative_to(source_root)
    except ValueError:
        return None
    parts = list(rel.with_suffix("").parts)
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    if not parts or not all(p.isidentifier() for p in parts):
        return None
    return ".".join(parts)


class PyModuleIndex:
    def __init__(self, root: Path, files: List[Path]):
        self.root = root
        self.roots = find_source_roots(root, files)
        self.by_name: Dict[str, Path] = {}
        self.name_of: Dict[Path, str] = {}
        for r in reversed(self.roots):  # shallow roots first, deeper roots override names_of
            for f in files:
                name = module_name(f, r)
                if name is None:
                    continue
                self.by_name.setdefault(name, f)
                self.name_of[f] = name

    def resolve(self, dotted: str) -> Optional[Path]:
        return self.by_name.get(dotted)

    def resolve_prefix(self, dotted: str) -> Optional[Path]:
        """Longest existing module that is a prefix of `dotted` (for `import a.b.c`)."""
        parts = dotted.split(".")
        for i in range(len(parts), 0, -1):
            hit = self.by_name.get(".".join(parts[:i]))
            if hit is not None:
                return hit
        return None


def _is_type_checking(cond: Optional[Node]) -> bool:
    return cond is not None and _text(cond).replace(" ", "") in ("TYPE_CHECKING", "typing.TYPE_CHECKING")


def parse_py_file(path: Path, module: str) -> PyFileInfo:
    tree = Parser(_PY).parse(path.read_bytes())
    is_package = path.name == "__init__.py"
    info = PyFileInfo(path=path, module=module, is_package=is_package, tree_root=tree.root_node)
    package = module if is_package else module.rpartition(".")[0]

    def absolute(rel_node: Node) -> str:
        prefix = next((c for c in rel_node.children if c.type == "import_prefix"), None)
        dots = len(_text(prefix))
        rest = next((c for c in rel_node.children if c.type == "dotted_name"), None)
        base_parts = package.split(".") if package else []
        if dots > 1:
            base_parts = base_parts[: len(base_parts) - (dots - 1)] if dots - 1 <= len(base_parts) else []
        base = ".".join(base_parts)
        tail = _text(rest)
        return ".".join(p for p in (base, tail) if p)

    def visit(n: Node, type_only: bool, top_level: bool) -> None:
        line = n.start_point[0] + 1
        if n.type == "import_statement":
            for c in n.children_by_field_name("name"):
                if c.type == "aliased_import":
                    name = _text(c.child_by_field_name("name"))
                    info.imports.append(PyImport(module=name, local=_text(c.child_by_field_name("alias")), type_only=type_only, line=line, top_level=top_level))
                else:
                    info.imports.append(PyImport(module=_text(c), type_only=type_only, line=line, top_level=top_level))
            return
        if n.type == "import_from_statement":
            mod_node = n.child_by_field_name("module_name")
            if mod_node is None:
                return
            mod = absolute(mod_node) if mod_node.type == "relative_import" else _text(mod_node)
            imp = PyImport(module=mod, is_from=True, type_only=type_only, line=line, top_level=top_level)
            if any(c.type == "wildcard_import" for c in n.children):
                imp.star = True
            for c in n.children_by_field_name("name"):
                if c.type == "aliased_import":
                    name = _text(c.child_by_field_name("name"))
                    local = _text(c.child_by_field_name("alias"))
                else:
                    name = local = _text(c)
                imp.names.append((name, local))
                if top_level:
                    info.imported_names[local] = (mod, name)
            info.imports.append(imp)
            return
        if n.type == "if_statement" and _is_type_checking(n.child_by_field_name("condition")):
            for c in n.child_by_field_name("consequence").named_children if n.child_by_field_name("consequence") else []:
                visit(c, True, top_level)
            for alt in n.children_by_field_name("alternative"):
                visit(alt, type_only, top_level)
            return
        if top_level:
            _record_declaration(n, info)
        # Declarations inside module-level if/try/with blocks are still top-level.
        nested_top = top_level and n.type in (
            "if_statement", "elif_clause", "else_clause", "try_statement", "except_clause",
            "finally_clause", "with_statement", "block",
        )
        for c in n.named_children:
            visit(c, type_only, nested_top)

    for stmt in tree.root_node.named_children:
        visit(stmt, False, True)
    return info


def _record_declaration(n: Node, info: PyFileInfo) -> None:
    target = n
    if n.type == "decorated_definition":
        target = n.child_by_field_name("definition") or n
    if target.type in ("function_definition", "class_definition"):
        name = _text(target.child_by_field_name("name"))
        if name:
            kind = "class" if target.type == "class_definition" else "function"
            info.declarations.append(SymbolDef(name, kind, target.start_point[0] + 1, not name.startswith("_")))
            info.decl_nodes[name] = n
    elif n.type == "expression_statement":
        for a in n.named_children:
            if a.type == "assignment":
                left = a.child_by_field_name("left")
                if left is not None and left.type == "identifier":
                    name = _text(left)
                    info.declarations.append(SymbolDef(name, "variable", a.start_point[0] + 1, not name.startswith("_")))
                    info.decl_nodes[name] = a


def external_root(module: str) -> str:
    top = module.split(".")[0]
    return top or module


def build_py_edges(root: Path, files: List[Path]) -> Tuple[List[DepEdge], Dict[str, list], Dict[Path, PyFileInfo], PyModuleIndex]:
    index = PyModuleIndex(root, files)
    infos: Dict[Path, PyFileInfo] = {}
    for f in files:
        mod = index.name_of.get(f)
        if mod is None:
            continue
        try:
            infos[f] = parse_py_file(f, mod)
        except Exception as e:  # pragma: no cover
            print(f"[deps] failed to parse {f}: {e}")

    defined: Dict[Path, Set[str]] = {f: {d.name for d in i.declarations} for f, i in infos.items()}

    def find_definer(file: Path, name: str, depth: int = 0) -> Tuple[Path, str]:
        """Pass names through package __init__ re-exports to the defining module."""
        info = infos.get(file)
        if info is None or depth > 10 or not info.is_package or name in defined.get(file, set()):
            return file, name
        src = info.imported_names.get(name)
        if src is None:
            return file, name
        mod, orig = src
        sub = index.resolve(f"{mod}.{orig}")
        if sub is not None and sub != file:
            return sub, ""  # re-exported submodule
        target = index.resolve(mod)
        if target is None or target == file:
            return file, name
        return find_definer(target, orig, depth + 1)

    stdlib = getattr(sys, "stdlib_module_names", frozenset())
    edges: List[DepEdge] = []
    for f, info in infos.items():
        bindings: Dict[str, ImportBinding] = {}
        ns_module: Dict[str, str] = {}  # namespace binding → dotted module name
        for imp in info.imports:
            if not imp.is_from:
                target = index.resolve_prefix(imp.module)
                if target is None:
                    if imp.module:
                        edges.append(DepEdge(source=f, target=_external(imp.module, stdlib), type_only=imp.type_only))
                    continue
                if target == f:
                    continue
                if imp.top_level:
                    # `import a.b.c` binds `a`; `import a.b.c as x` binds x to a.b.c.
                    local = imp.local or imp.module.split(".")[0]
                    dotted = imp.module if imp.local else imp.module.split(".")[0]
                    bound = index.resolve(dotted) or target
                    bindings[local] = ImportBinding(target_file=bound, target_symbol=None, display=imp.module, type_only=imp.type_only, namespace=True)
                    ns_module[local] = dotted
                    if bound != target and not imp.local:
                        # Keep the explicitly imported submodule even if only `a` is used.
                        edges.append(DepEdge(source=f, target=target, type_only=imp.type_only))
                else:
                    edges.append(DepEdge(source=f, target=target, type_only=imp.type_only))
                continue

            base = index.resolve(imp.module)
            if base is None:
                if imp.module and not imp.module.startswith("."):
                    hits = [(n, l, index.resolve(f"{imp.module}.{n}")) for n, l in imp.names]
                    hits = [h for h in hits if h[2] is not None]
                    if hits:
                        for n, l, h in hits:
                            if h == f:
                                continue
                            if imp.top_level:
                                bindings[l] = ImportBinding(target_file=h, target_symbol=None, display=n, type_only=imp.type_only, namespace=True)
                                ns_module[l] = f"{imp.module}.{n}"
                            else:
                                edges.append(DepEdge(source=f, target=h, type_only=imp.type_only))
                        continue
                    if index.resolve_prefix(imp.module) is None:
                        edges.append(
                            DepEdge(source=f, target=_external(imp.module, stdlib), symbols=[n for n, _ in imp.names], type_only=imp.type_only)
                        )
                continue
            if imp.star or not imp.names:
                if base != f:
                    edges.append(DepEdge(source=f, target=base, symbols=["*"] if imp.star else [], type_only=imp.type_only))
                continue
            for name, local in imp.names:
                sub = index.resolve(f"{imp.module}.{name}")
                if sub is not None:
                    t, t_sym, barrel_flag, is_ns = sub, None, False, True
                    ns_module_name = f"{imp.module}.{name}"
                else:
                    t, t_sym = find_definer(base, name)
                    barrel_flag, is_ns = t != base, t_sym == ""
                    ns_module_name = index.name_of.get(t, "")
                if t == f:
                    continue
                if imp.top_level:
                    bindings[local] = ImportBinding(
                        target_file=t, target_symbol=t_sym or None, display=name,
                        type_only=imp.type_only, via_barrel=barrel_flag, namespace=is_ns,
                    )
                    if is_ns:
                        ns_module[local] = ns_module_name
                else:
                    edges.append(DepEdge(source=f, target=t, symbols=[name], type_only=imp.type_only, via_barrel=barrel_flag))

        if bindings:
            raw = collect_py_usages(info, set(bindings))
            usages: Dict[Optional[str], Set[Tuple[str, Optional[str]]]] = {}
            for user, refs in raw.items():
                for local, chain in refs:
                    b = bindings[local]
                    if not (b.namespace and chain):
                        usages.setdefault(user, set()).add((local, None))
                        continue
                    # `pkg.sub.func`: walk into the deepest submodule, then take the symbol.
                    parts = chain.split(".")
                    mod = ns_module.get(local, "")
                    k = 0
                    file_k = b.target_file
                    for i in range(len(parts), 0, -1):
                        hit = index.resolve(".".join([mod, *parts[:i]])) if mod else None
                        if hit is not None:
                            k, file_k = i, hit
                            break
                    key = local if k == 0 else f"{local}.{'.'.join(parts[:k])}"
                    if key not in bindings:
                        bindings[key] = ImportBinding(target_file=file_k, target_symbol=None, display=key, type_only=b.type_only, namespace=True)
                    usages.setdefault(user, set()).add((key, parts[k] if k < len(parts) else None))
            # A module binding reached only through deeper chains (`a.b.f`) is
            # represented by the deeper key; drop the bare one so it does not
            # also appear as an unused import.
            direct = {local for refs in usages.values() for local, _ in refs}
            for key in [k for k in bindings if "." in k]:
                base_local = key.split(".")[0]
                if base_local not in direct:
                    bindings.pop(base_local, None)
            edges.extend(emit_symbol_edges(f, bindings, usages, defined))

    symbols = {str(f): i.declarations for f, i in infos.items()}
    return edges, symbols, infos, index


def _external(module: str, stdlib) -> str:
    return external_root(module)


def collect_py_usages(info: PyFileInfo, locals_: Set[str]) -> Dict[Optional[str], Set[Tuple[str, Optional[str]]]]:
    """Per top-level declaration, imported locals referenced (with attribute chains)."""
    usages: Dict[Optional[str], Set[Tuple[str, Optional[str]]]] = {}
    decl_ids = {n.id: name for name, n in info.decl_nodes.items()}

    def chain_of(n: Node) -> Optional[List[str]]:
        parts: List[str] = []
        cur = n
        while cur.type == "attribute":
            attr = cur.child_by_field_name("attribute")
            parts.append(_text(attr))
            cur = cur.child_by_field_name("object")
            if cur is None:
                return None
        if cur.type != "identifier":
            return None
        parts.append(_text(cur))
        return list(reversed(parts))

    def walk(root: Node, user: Optional[str]) -> None:
        stack = [(root, user)]
        while stack:
            node, who = stack.pop()
            if node.id in decl_ids:
                who = decl_ids[node.id]
            if node.type in ("import_statement", "import_from_statement"):
                continue
            if node.type == "attribute":
                parts = chain_of(node)
                if parts and parts[0] in locals_:
                    usages.setdefault(who, set()).add((parts[0], ".".join(parts[1:]) or None))
                    continue
            elif node.type == "identifier":
                name = _text(node)
                if name in locals_:
                    usages.setdefault(who, set()).add((name, None))
                continue
            for c in node.children:
                stack.append((c, who))

    if info.tree_root is not None:
        for stmt in info.tree_root.named_children:
            walk(stmt, None)
    return usages
