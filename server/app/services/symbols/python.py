"""
Python symbols and references, by name, from tree-sitter: the same contract as
the TypeScript extractor.

A class's methods see the class only through ``self``, ``cls``, ``super()``
or the class name (Python scoping), so a class scope resolves names only
while the walk is directly in the class body. Fields come from class-body
assignments and from ``self.<name> = …`` in any method. A function-local
import binds names for that function alone. Module attribute chains
(``pkg.sub.func``) descend to the deepest module the index knows and take
the next part as the member.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Set, Tuple

from tree_sitter import Node

from app.services.deps.python_deps import PyFileInfo, PyModuleIndex, _text, parse_py_file
from app.services.symbols.model import FileSymbols, PendingMember, RefKind, Reference, Symbol, SymbolKind


@dataclass
class _Binding:
    """A local name bound by an import: a module (file id) or a symbol of a module."""

    file: str  # repo-relative id of the target module
    symbol: Optional[str]  # declared name in it; None for the module itself
    dotted: str = ""  # the module's dotted name, for deeper chains


@dataclass
class _Scope:
    symbol: Optional[str]
    class_id: Optional[str]
    is_class: bool = False
    locals: Dict[str, Optional[str]] = field(default_factory=dict)
    named: Dict[str, str] = field(default_factory=dict)
    bindings: Dict[str, _Binding] = field(default_factory=dict)
    globals: Set[str] = field(default_factory=set)
    # In a method: the parameter that stands for the instance or the class.
    receiver_param: Optional[str] = None


class PyProgram:
    """Every Python file of a root parsed once, with module resolution and `__init__` passing."""

    def __init__(self, root: Path, files: List[Path]):
        self.root = root
        self.index = PyModuleIndex(root, files)
        self.infos: Dict[Path, PyFileInfo] = {}
        for f in files:
            mod = self.index.name_of.get(f)
            if mod is None:
                continue
            try:
                self.infos[f] = parse_py_file(f, mod)
            except Exception as e:  # pragma: no cover
                import sys

                print(f"[symbols] failed to parse {f}: {e}", file=sys.stderr)
        self.defined: Dict[Path, Set[str]] = {f: {d.name for d in i.declarations} for f, i in self.infos.items()}
        self.rel_of: Dict[Path, str] = {}
        for f in self.infos:
            try:
                self.rel_of[f] = f.relative_to(root).as_posix()
            except ValueError:
                continue

    def find_definer(self, file: Path, name: str, depth: int = 0) -> Tuple[Path, str]:
        """Pass a name through package `__init__` re-exports to the module that defines it ("" = a submodule)."""
        info = self.infos.get(file)
        if info is None or depth > 10 or not info.is_package or name in self.defined.get(file, set()):
            return file, name
        src = info.imported_names.get(name)
        if src is None:
            return file, name
        mod, orig = src
        sub = self.index.resolve(f"{mod}.{orig}")
        if sub is not None and sub != file:
            return sub, ""
        target = self.index.resolve(mod)
        if target is None or target == file:
            return file, name
        return self.find_definer(target, orig, depth + 1)

    def bind_from(self, module: str, name: str) -> Optional[_Binding]:
        """`from module import name`."""
        sub = self.index.resolve(f"{module}.{name}")
        if sub is not None and sub in self.rel_of:
            return _Binding(self.rel_of[sub], None, f"{module}.{name}")
        base = self.index.resolve(module)
        if base is None:
            return None
        f, sym = self.find_definer(base, name)
        if f not in self.rel_of:
            return None
        if sym == "":
            return _Binding(self.rel_of[f], None, self.index.name_of.get(f, ""))
        return _Binding(self.rel_of[f], sym, self.index.name_of.get(f, ""))

    def bind_module(self, dotted: str) -> Optional[_Binding]:
        """`import a.b.c` binds `a`; `import a.b.c as x` binds x to a.b.c."""
        f = self.index.resolve(dotted)
        if f is None or f not in self.rel_of:
            return None
        return _Binding(self.rel_of[f], None, dotted)


class PyFileExtractor:
    def __init__(self, program: PyProgram, path: Path, rel: str, info: PyFileInfo):
        self.program = program
        self.path = path
        self.rel = rel
        self.info = info
        self.module = info.module
        self.package = info.module if info.is_package else info.module.rpartition(".")[0]
        self.out = FileSymbols(file=rel)
        self.top: Dict[str, str] = {}
        self.by_id: Dict[str, Symbol] = {}
        self.scopes: List[_Scope] = [_Scope(symbol=rel, class_id=None)]

    # ---- scopes ----

    @property
    def scope(self) -> _Scope:
        return self.scopes[-1]

    def _push(self, symbol: Optional[str], class_id: Optional[str] = None, is_class: bool = False) -> _Scope:
        s = _Scope(
            symbol=symbol if symbol is not None else self.scope.symbol,
            class_id=class_id if class_id is not None else self.scope.class_id,
            is_class=is_class,
        )
        self.scopes.append(s)
        return s

    def _pop(self) -> None:
        self.scopes.pop()

    def _binding_id(self, b: _Binding) -> str:
        return b.file if b.symbol is None else f"{b.file}#{b.symbol}"

    def _lookup(self, name: str) -> Tuple[Optional[str], Optional[str], Optional[_Binding]]:
        """(symbol id, declared type name, module binding) for a bare name."""
        innermost = True
        for s in reversed(self.scopes):
            if s.is_class and not innermost:
                continue  # a method does not see its class body's names
            innermost = False
            if name in s.globals:
                break
            if name in s.named:
                return s.named[name], None, None
            if name in s.bindings:
                b = s.bindings[name]
                return self._binding_id(b), None, b
            if name in s.locals:
                return None, s.locals[name], None
        if name in self.top:
            return self.top[name], None, None
        b = self.scopes[0].bindings.get(name)
        if b is not None:
            return self._binding_id(b), None, b
        return None, None, None

    def resolve_name(self, name: str) -> Optional[str]:
        return self._lookup(name)[0]

    # ---- symbols ----

    def _add(self, name: str, kind: SymbolKind, node: Node, container: Optional[str], exported: bool) -> Symbol:
        sid = f"{self.rel}#{name}" if container is None or container == self.rel else f"{container}.{name}"
        existing = self.by_id.get(sid)
        if existing is not None:
            existing.end_line = max(existing.end_line, node.end_point[0] + 1)
            return existing
        sym = Symbol(
            id=sid,
            name=name,
            kind=kind,
            file=self.rel,
            line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            container=None if container == self.rel else container,
            exported=exported,
            language="py",
        )
        self.by_id[sid] = sym
        self.out.symbols.append(sym)
        if container is not None and container != self.rel and container in self.by_id:
            self.by_id[container].members[name] = sid
        return sym

    def _declare(self, name: str, kind: SymbolKind, node: Node) -> Symbol:
        at_top = len(self.scopes) == 1
        container = None if at_top else self.scope.symbol
        exported = not name.startswith("_") if at_top else self._container_exported()
        sym = self._add(name, kind, node, container, exported)
        if at_top:
            self.top[name] = sym.id
        else:
            self.scope.named[name] = sym.id
        return sym

    def _container_exported(self) -> bool:
        s = self.by_id.get(self.scope.symbol or "")
        return bool(s and s.exported)

    # ---- references ----

    def _ref(self, target: Optional[str], kind: RefKind, node: Node) -> None:
        if target is None or target == self.scope.symbol:
            return
        self.out.references.append(Reference(source=self.scope.symbol or self.rel, target=target, kind=kind, line=node.start_point[0] + 1))

    def _member(self, receiver: Optional[str], member: str, kind: RefKind, node: Node, note: str = "") -> None:
        if not member:
            return
        self.out.pending.append(
            PendingMember(source=self.scope.symbol or self.rel, file=self.rel, line=node.start_point[0] + 1, kind=kind, member=member, receiver=receiver, receiver_note=note)
        )

    def _chain(self, n: Node) -> Optional[List[Node]]:
        """`a.b.c` as [a, b, c] when rooted at an identifier (or `self`, `super()`); None otherwise."""
        parts: List[Node] = []
        cur = n
        while cur.type == "attribute":
            attr = cur.child_by_field_name("attribute")
            obj = cur.child_by_field_name("object")
            if attr is None or obj is None:
                return None
            parts.append(attr)
            cur = obj
        if cur.type == "identifier" or (cur.type == "call" and _is_super(cur)):
            parts.append(cur)
            return list(reversed(parts))
        return None

    def _on_attribute(self, n: Node, kind: RefKind) -> None:
        chain = self._chain(n)
        if chain is None:
            obj = n.child_by_field_name("object")
            if obj is not None:
                self.visit(obj)
            self._member(None, _text(n.child_by_field_name("attribute")), kind, n, "expression")
            return
        head, members = chain[0], chain[1:]
        if head.type == "call":  # super().x
            receiver, note = self.scope.class_id, "super"
            self._emit_chain(receiver, note, members, kind, n)
            return
        name = _text(head)
        s = self.scope
        if s.receiver_param and name == s.receiver_param:
            self._emit_chain(s.class_id, "this", members, kind, n)
            return
        sid, type_name, binding = self._lookup(name)
        if binding is not None and binding.symbol is None:
            # A module: walk the dotted chain into the deepest module the index knows.
            dotted = binding.dotted
            file_id = binding.file
            k = 0
            for i in range(len(members), 0, -1):
                candidate = ".".join([dotted, *[_text(m) for m in members[:i]]])
                hit = self.program.index.resolve(candidate)
                if hit is not None and hit in self.program.rel_of:
                    k, file_id = i, self.program.rel_of[hit]
                    break
            self._emit_chain(file_id, "", members[k:], kind, n)
            return
        if sid is not None:
            self._emit_chain(sid, "", members, kind, n)
            return
        if type_name:
            self._emit_chain(self.resolve_name(type_name), "typed", members, kind, n)
            return
        self._emit_chain(None, "local", members, kind, n)

    def _emit_chain(self, receiver: Optional[str], note: str, members: List[Node], kind: RefKind, n: Node) -> None:
        """The first member is resolved on the receiver; anything deeper is by name only."""
        if not members:
            if receiver is not None and note == "":
                self._ref(receiver, kind, n)
            return
        if receiver is None and note == "typed":
            note = "expression"
        first = members[0]
        self._member(receiver, _text(first), kind if len(members) == 1 else "read", first, note)
        for m in members[1:-1]:
            self._member(None, _text(m), "read", m, "expression")
        if len(members) > 1:
            self._member(None, _text(members[-1]), kind, members[-1], "expression")

    # ---- the walk ----

    def run(self) -> FileSymbols:
        root = self.info.tree_root
        if root is None:
            return self.out
        module = Symbol(id=self.rel, name=self.path.name, kind="module", file=self.rel, line=1, end_line=root.end_point[0] + 1, exported=True, language="py")
        self.by_id[self.rel] = module
        self.out.symbols.append(module)
        self._predeclare(root, self.scopes[0])
        for stmt in root.named_children:
            self.visit(stmt)
        return self.out

    def _predeclare(self, block: Node, scope: _Scope) -> None:
        """Top-level declarations and imports first, so forward references resolve."""
        for stmt in _top_statements(block):
            if stmt.type in ("import_statement", "import_from_statement"):
                self._bind_import(stmt, scope)
                continue
            t = stmt
            if stmt.type == "decorated_definition":
                t = stmt.child_by_field_name("definition") or stmt
            if t.type == "function_definition":
                self._declare(_text(t.child_by_field_name("name")), "function", stmt)
            elif t.type == "class_definition":
                self._declare(_text(t.child_by_field_name("name")), "class", stmt)
            elif stmt.type == "expression_statement":
                for a in stmt.named_children:
                    if a.type == "assignment":
                        for name_node in _assignment_targets(a.child_by_field_name("left")):
                            sym = self._declare(_text(name_node), "variable", a)
                            sym.typed_as = self._declared_type(a)

    def _declared_type(self, assignment: Node) -> Optional[str]:
        """`x: Store = …` or `x = Store()`: the class a variable holds, as a symbol id."""
        type_node = assignment.child_by_field_name("type")
        name = _type_name(type_node)
        if name is None:
            right = assignment.child_by_field_name("right")
            if right is not None and right.type == "call":
                fn = right.child_by_field_name("function")
                if fn is not None and fn.type == "identifier":
                    name = _text(fn)
        return self.resolve_name(name) if name else None

    def _bind_import(self, stmt: Node, scope: _Scope) -> None:
        if stmt.type == "import_statement":
            for c in stmt.children_by_field_name("name"):
                if c.type == "aliased_import":
                    dotted = _text(c.child_by_field_name("name"))
                    b = self.program.bind_module(dotted)
                    if b is not None:
                        scope.bindings[_text(c.child_by_field_name("alias"))] = b
                else:
                    dotted = _text(c)
                    head = dotted.split(".")[0]
                    b = self.program.bind_module(head)
                    if b is not None:
                        scope.bindings[head] = b
            return
        mod_node = stmt.child_by_field_name("module_name")
        if mod_node is None:
            return
        module = self._absolute(mod_node) if mod_node.type == "relative_import" else _text(mod_node)
        for c in stmt.children_by_field_name("name"):
            if c.type == "aliased_import":
                name = _text(c.child_by_field_name("name"))
                local = _text(c.child_by_field_name("alias"))
            else:
                name = local = _text(c)
            b = self.program.bind_from(module, name)
            if b is not None:
                scope.bindings[local] = b

    def _absolute(self, rel_node: Node) -> str:
        prefix = next((c for c in rel_node.children if c.type == "import_prefix"), None)
        dots = len(_text(prefix))
        rest = next((c for c in rel_node.children if c.type == "dotted_name"), None)
        base_parts = self.package.split(".") if self.package else []
        if dots > 1:
            base_parts = base_parts[: len(base_parts) - (dots - 1)] if dots - 1 <= len(base_parts) else []
        base = ".".join(base_parts)
        tail = _text(rest)
        return ".".join(p for p in (base, tail) if p)

    def visit(self, n: Node) -> None:
        t = n.type
        if t in ("import_statement", "import_from_statement"):
            if len(self.scopes) > 1:
                self._bind_import(n, self.scope)
            return
        if t == "comment":
            return
        if t == "decorated_definition":
            definition = n.child_by_field_name("definition")
            if definition is None:
                return
            self._visit_definition(definition, decorators=[c for c in n.named_children if c.type == "decorator"])
            return
        if t in ("function_definition", "class_definition"):
            self._visit_definition(n, decorators=[])
            return
        if t == "global_statement":
            for c in n.named_children:
                self.scope.globals.add(_text(c))
                self.scope.locals.pop(_text(c), None)
            return
        if t == "nonlocal_statement":
            for c in n.named_children:
                self.scope.locals.pop(_text(c), None)
            return
        if t == "attribute":
            self._on_attribute(n, "read")
            return
        if t == "call":
            self._visit_call(n)
            return
        if t in ("assignment", "augmented_assignment"):
            self._visit_assignment(n)
            return
        if t == "keyword_argument":
            value = n.child_by_field_name("value")
            if value is not None:
                self.visit(value)
            return
        if t == "type":
            self._visit_type(n)
            return
        if t == "lambda":
            self._push(None)
            params = n.child_by_field_name("parameters")
            if params is not None:
                for name in _parameter_names(params):
                    self.scope.locals[name] = None
            body = n.child_by_field_name("body")
            if body is not None:
                self.visit(body)
            self._pop()
            return
        if t == "identifier":
            self._ref(self.resolve_name(_text(n)), "read", n)
            return
        for c in n.named_children:
            self.visit(c)

    def _visit_type(self, n: Node) -> None:
        """An annotation: every identifier in it names a type; a string annotation names one by its text."""
        stack = list(n.named_children)
        while stack:
            node = stack.pop()
            if node.type == "identifier":
                self._ref(self.resolve_name(_text(node)), "type", node)
            elif node.type == "attribute":
                self._on_attribute(node, "type")
            elif node.type == "string":
                text = _text(node).strip("\"'")
                if text.isidentifier():
                    self._ref(self.resolve_name(text), "type", node)
                elif "." in text and all(p.isidentifier() for p in text.split(".")):
                    head, *rest = text.split(".")
                    sid = self.resolve_name(head)
                    if sid is not None:
                        self._member(sid, rest[0], "type", node)
            else:
                stack.extend(node.named_children)

    def _visit_call(self, n: Node) -> None:
        fn = n.child_by_field_name("function")
        if fn is not None:
            if fn.type == "identifier":
                sid = self.resolve_name(_text(fn))
                kind: RefKind = "instantiate" if sid is not None and self._is_class(sid) else "call"
                self._ref(sid, kind, fn)
            elif fn.type == "attribute":
                self._on_attribute(fn, "call")
            elif not _is_super(n):
                self.visit(fn)
        args = n.child_by_field_name("arguments")
        if args is not None:
            self.visit(args)

    def _is_class(self, sid: str) -> bool:
        s = self.by_id.get(sid)
        if s is not None:
            return s.kind == "class"
        # An imported class is not known yet: the index settles `instantiate` vs `call` later.
        return False

    def _visit_assignment(self, n: Node) -> None:
        left = n.child_by_field_name("left")
        right = n.child_by_field_name("right")
        type_node = n.child_by_field_name("type")
        if left is not None:
            self._visit_write_target(left)
        # A declaration's initializer belongs to the variable or field it declares.
        owner: Optional[str] = None
        if left is not None and left.type == "identifier" and n.type == "assignment":
            name = _text(left)
            if len(self.scopes) == 1:
                owner = self.top.get(name)
            elif self.scope.is_class:
                owner = self.scope.named.get(name)
        if owner is not None:
            self._push(owner)
        if type_node is not None:
            self._visit_type(type_node)
        if right is not None:
            self.visit(right)
        if owner is not None:
            self._pop()

    def _visit_write_target(self, target: Node) -> None:
        t = target.type
        if t == "identifier":
            name = _text(target)
            at_top = len(self.scopes) == 1
            if at_top or self.scope.is_class:
                return  # a declaration (predeclared) or a class field
            if name in self.scope.globals:
                self._ref(self.top.get(name), "write", target)
            # else a local: declared, not a reference
        elif t == "attribute":
            self._on_attribute(target, "write")
        elif t in ("pattern_list", "tuple_pattern", "list_pattern", "list", "tuple"):
            for c in target.named_children:
                self._visit_write_target(c)
        elif t == "subscript":
            value = target.child_by_field_name("value")
            if value is not None:
                if value.type == "identifier":
                    self._ref(self.resolve_name(_text(value)), "write", value)
                elif value.type == "attribute":
                    self._on_attribute(value, "write")
                else:
                    self.visit(value)
            for c in target.children_by_field_name("subscript"):
                self.visit(c)
        else:
            self.visit(target)

    def _visit_definition(self, n: Node, decorators: List[Node]) -> Optional[str]:
        name = _text(n.child_by_field_name("name"))
        if n.type == "class_definition":
            return self._visit_class(n, name, decorators)
        in_class = self.scope.is_class
        if len(self.scopes) == 1:
            sym = self.top.get(name)
            sym_obj = self.by_id[sym] if sym else self._declare(name, "function", n)
        else:
            sym_obj = self._declare(name, "method" if in_class else "function", n)
        is_static = any(_decorator_name(d) == "staticmethod" for d in decorators)
        scope = self._push(sym_obj.id)
        params = n.child_by_field_name("parameters")
        param_names: List[str] = []
        if params is not None:
            for p in params.named_children:
                pname, ptype = _parameter(p)
                if pname:
                    param_names.append(pname)
                    scope.locals[pname] = ptype
        if in_class and not is_static and param_names:
            scope.receiver_param = param_names[0]
        for d in decorators:
            self._visit_decorator(d)
        if params is not None:
            for p in params.named_children:
                type_node = p.child_by_field_name("type")
                if type_node is not None:
                    self._visit_type(type_node)
                value = p.child_by_field_name("value")
                if value is not None:
                    self.visit(value)
        ret = n.child_by_field_name("return_type")
        if ret is not None:
            self._visit_type(ret)
        body = n.child_by_field_name("body")
        if body is not None:
            self._collect_locals(body, scope)
            self._predeclare_nested(body, scope)
            for c in body.named_children:
                self.visit(c)
        self._pop()
        return sym_obj.id

    def _predeclare_nested(self, body: Node, scope: _Scope) -> None:
        for stmt in _top_statements(body):
            t = stmt.child_by_field_name("definition") if stmt.type == "decorated_definition" else stmt
            if t is not None and t.type in ("function_definition", "class_definition"):
                scope.locals.pop(_text(t.child_by_field_name("name")), None)

    def _visit_decorator(self, d: Node) -> None:
        inner = next((c for c in d.named_children), None)
        if inner is None:
            return
        if inner.type == "identifier":
            self._ref(self.resolve_name(_text(inner)), "call", inner)
        elif inner.type == "attribute":
            chain = self._chain(inner)
            # `@total.setter` names the property itself; `@app.get(...)` is a call on app.
            if chain and len(chain) == 2 and _text(chain[1]) in ("setter", "getter", "deleter"):
                return
            self._on_attribute(inner, "call")
        else:
            self.visit(inner)

    def _visit_class(self, n: Node, name: str, decorators: List[Node]) -> str:
        if len(self.scopes) == 1:
            sid = self.top.get(name)
            sym = self.by_id[sid] if sid else self._declare(name, "class", n)
        else:
            sym = self._declare(name, "class", n)
        self._push(sym.id, sym.id)
        for d in decorators:
            self._visit_decorator(d)
        supers = n.child_by_field_name("superclasses")
        if supers is not None:
            for base in supers.named_children:
                if base.type == "identifier":
                    bid = self.resolve_name(_text(base))
                    self._ref(bid, "extends", base)
                    if bid:
                        self.out.bases.setdefault(sym.id, []).append(bid)
                elif base.type == "attribute":
                    self._on_attribute(base, "extends")
                elif base.type == "keyword_argument":
                    v = base.child_by_field_name("value")
                    if v is not None:
                        self.visit(v)
                elif base.type == "subscript":
                    self.visit(base)
        self._pop()
        body = n.child_by_field_name("body")
        if body is None:
            return sym.id
        scope = self._push(sym.id, sym.id, is_class=True)
        # Fields: class-body assignments, then `self.x = …` anywhere in a method.
        for stmt in _top_statements(body):
            if stmt.type == "expression_statement":
                for a in stmt.named_children:
                    if a.type == "assignment":
                        for target in _assignment_targets(a.child_by_field_name("left")):
                            f = self._add(_text(target), "field", a, sym.id, sym.exported)
                            if f.typed_as is None:
                                f.typed_as = self._declared_type(a)
                            scope.named[f.name] = f.id
            t = stmt.child_by_field_name("definition") if stmt.type == "decorated_definition" else stmt
            if t is not None and t.type in ("function_definition", "class_definition"):
                mname = _text(t.child_by_field_name("name"))
                kind: SymbolKind = "method" if t.type == "function_definition" else "class"
                m = self._add(mname, kind, stmt, sym.id, sym.exported)
                scope.named[mname] = m.id
        for assign in _self_assignments(body):
            target = assign.child_by_field_name("left")
            attr = target.child_by_field_name("attribute") if target is not None else None
            if attr is not None:
                f = self._add(_text(attr), "field", assign, sym.id, sym.exported)
                if f.typed_as is None:
                    f.typed_as = self._declared_type(assign)
        for c in body.named_children:
            self.visit(c)
        self._pop()
        return sym.id

    def _collect_locals(self, body: Node, scope: _Scope) -> None:
        """Names assigned anywhere in a function body outside nested defs and classes."""
        stack = [body]
        while stack:
            node = stack.pop()
            t = node.type
            if t in ("function_definition", "class_definition", "lambda"):
                continue
            if t in ("assignment", "augmented_assignment"):
                for target in _assignment_targets(node.child_by_field_name("left")):
                    scope.locals.setdefault(_text(target), _type_name(node.child_by_field_name("type")) or _call_class_name(node.child_by_field_name("right")))
            elif t in ("for_statement", "for_in_clause"):
                left = node.child_by_field_name("left")
                if left is not None:
                    for target in _assignment_targets(left):
                        scope.locals.setdefault(_text(target), None)
            elif t == "as_pattern":
                alias = node.child_by_field_name("alias")
                if alias is not None:
                    for target in _assignment_targets(alias):
                        scope.locals.setdefault(_text(target), None)
            elif t == "named_expression":
                name = node.child_by_field_name("name")
                if name is not None:
                    scope.locals.setdefault(_text(name), None)
            elif t in ("import_statement", "import_from_statement"):
                continue
            stack.extend(node.named_children)


def _is_super(call: Node) -> bool:
    fn = call.child_by_field_name("function")
    return fn is not None and fn.type == "identifier" and _text(fn) == "super"


def _top_statements(block: Node) -> Iterator[Node]:
    """Statements of a block, looking through module-level if/try/with blocks."""
    for stmt in block.named_children:
        if stmt.type in ("if_statement", "try_statement", "with_statement"):
            for c in stmt.named_children:
                if c.type == "block":
                    yield from _top_statements(c)
                elif c.type in ("elif_clause", "else_clause", "except_clause", "finally_clause"):
                    for b in c.named_children:
                        if b.type == "block":
                            yield from _top_statements(b)
        else:
            yield stmt


def _assignment_targets(left: Optional[Node]) -> Iterator[Node]:
    if left is None:
        return
    if left.type == "identifier":
        yield left
    elif left.type in ("pattern_list", "tuple_pattern", "list_pattern", "list", "tuple", "parenthesized_expression"):
        for c in left.named_children:
            yield from _assignment_targets(c)
    elif left.type in ("list_splat_pattern", "splat_pattern"):
        for c in left.named_children:
            yield from _assignment_targets(c)


def _self_assignments(body: Node) -> Iterator[Node]:
    """`<first param>.name = …` assignments in the class's methods (any depth inside them)."""
    for stmt in _top_statements(body):
        t = stmt.child_by_field_name("definition") if stmt.type == "decorated_definition" else stmt
        if t is None or t.type != "function_definition":
            continue
        params = t.child_by_field_name("parameters")
        first = next((_parameter(p)[0] for p in params.named_children), None) if params is not None else None
        if not first:
            continue
        stack = [t.child_by_field_name("body")]
        while stack:
            node = stack.pop()
            if node is None:
                continue
            if node.type in ("function_definition", "class_definition", "lambda"):
                continue
            if node.type in ("assignment", "augmented_assignment"):
                left = node.child_by_field_name("left")
                if left is not None and left.type == "attribute":
                    obj = left.child_by_field_name("object")
                    if obj is not None and obj.type == "identifier" and _text(obj) == first and node.type == "assignment":
                        yield node
            stack.extend(node.named_children)


def _parameter(p: Node) -> Tuple[Optional[str], Optional[str]]:
    """(name, annotated type name) of one parameter node."""
    t = p.type
    if t == "identifier":
        return _text(p), None
    if t in ("typed_parameter", "typed_default_parameter"):
        name_node = p.child_by_field_name("name") or next((c for c in p.named_children if c.type == "identifier"), None)
        return (_text(name_node) if name_node else None), _type_name(p.child_by_field_name("type"))
    if t == "default_parameter":
        name_node = p.child_by_field_name("name")
        return (_text(name_node) if name_node else None), None
    if t in ("list_splat_pattern", "dictionary_splat_pattern"):
        inner = next((c for c in p.named_children if c.type == "identifier"), None)
        return (_text(inner) if inner else None), None
    return None, None


def _parameter_names(params: Node) -> Iterator[str]:
    for p in params.named_children:
        name, _ = _parameter(p)
        if name:
            yield name


def _type_name(type_node: Optional[Node]) -> Optional[str]:
    """`: Store` (or `: "Store"`) → "Store"; `Optional[Store]` and the like are not instance types."""
    if type_node is None:
        return None
    inner = next((c for c in type_node.named_children), None) if type_node.type == "type" else type_node
    if inner is None:
        return None
    if inner.type == "identifier":
        return _text(inner)
    if inner.type == "string":
        text = _text(inner).strip("\"'")
        return text if text.isidentifier() else None
    return None


def _call_class_name(right: Optional[Node]) -> Optional[str]:
    if right is not None and right.type == "call":
        fn = right.child_by_field_name("function")
        if fn is not None and fn.type == "identifier":
            return _text(fn)
    return None


def _decorator_name(d: Node) -> str:
    inner = next((c for c in d.named_children), None)
    if inner is None:
        return ""
    if inner.type == "call":
        inner = inner.child_by_field_name("function") or inner
    return _text(inner)


def extract_py(root: Path, files: List[Path]) -> Tuple[List[FileSymbols], PyProgram]:
    """Symbols and references of every Python file under root, before cross-file member resolution."""
    program = PyProgram(root, files)
    out: List[FileSymbols] = []
    for f, info in program.infos.items():
        rel = program.rel_of.get(f)
        if rel is None:
            continue
        out.append(PyFileExtractor(program, f, rel, info).run())
    return out, program
