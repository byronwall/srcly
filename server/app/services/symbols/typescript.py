"""
TypeScript / JavaScript symbols and references, by name, from tree-sitter.

One pass over each file keeps a scope stack: the symbol whose body we are in
(the reference's source), the nearest class (for ``this``), the local names
that shadow outer ones, and the nested symbols declared in that scope. A bare
name resolves innermost first: a nested symbol, a local (which ends the
search), a top-level declaration of the file, then an import binding passed
through barrels to the file that defines it.

``receiver.member`` is not resolved here. It is recorded as a pending member
reference with whatever the receiver resolved to (a class, a module, a typed
variable or parameter) and settled by the index once every file is known.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

from tree_sitter import Node

from app.services.deps.common import ImportBinding
from app.services.deps.typescript_deps import TsFileInfo, TsProgram, _text
from app.services.symbols.model import HTTP_METHODS, FileSymbols, HttpRequest, PendingMember, RefKind, Reference, Symbol, SymbolKind

_FUNCTION_LIKE = {"function_declaration", "generator_function_declaration", "arrow_function", "function_expression", "function", "generator_function"}
_CLASS_LIKE = {"class_declaration", "abstract_class_declaration"}
_TYPE_DECLS: Dict[str, SymbolKind] = {"interface_declaration": "type", "type_alias_declaration": "type", "enum_declaration": "enum"}
_NAMED_CLASS_MEMBERS = {"method_definition", "abstract_method_signature", "method_signature", "public_field_definition", "property_signature"}


@dataclass
class _Scope:
    symbol: Optional[str]
    class_id: Optional[str]
    # local name → the type name it was declared with (`x: Store`, `new Store()`), or None
    locals: Dict[str, Optional[str]] = field(default_factory=dict)
    # nested symbols declared directly in this scope, by name
    named: Dict[str, str] = field(default_factory=dict)


class TsFileExtractor:
    def __init__(self, program: TsProgram, path: Path, rel: str, info: TsFileInfo, rel_of: Dict[Path, str]):
        self.program = program
        self.path = path
        self.rel = rel
        self.info = info
        self.rel_of = rel_of
        self.out = FileSymbols(file=rel)
        self.bindings: Dict[str, ImportBinding] = program.bindings_for(path)
        self.exported = set(info.local_exports.values())
        self.top: Dict[str, str] = {}  # top-level declaration name → id
        self.by_id: Dict[str, Symbol] = {}
        self.scopes: List[_Scope] = [_Scope(symbol=rel, class_id=None)]

    # ---- scopes and names ----

    @property
    def scope(self) -> _Scope:
        return self.scopes[-1]

    def _push(self, symbol: Optional[str], class_id: Optional[str] = None) -> _Scope:
        s = _Scope(symbol=symbol if symbol is not None else self.scope.symbol, class_id=class_id if class_id is not None else self.scope.class_id)
        self.scopes.append(s)
        return s

    def _pop(self) -> None:
        self.scopes.pop()

    def _binding_id(self, b: ImportBinding) -> Optional[str]:
        target = self.rel_of.get(b.target_file)
        if target is None:
            return None
        return target if b.target_symbol is None or b.namespace else f"{target}#{b.target_symbol}"

    def resolve_name(self, name: str) -> Tuple[Optional[str], Optional[str]]:
        """(symbol id, declared type name) for a bare name: the id when it names a symbol, the type when it is a typed local."""
        for s in reversed(self.scopes):
            if name in s.named:
                return s.named[name], None
            if name in s.locals:
                return None, s.locals[name]
        if name in self.top:
            return self.top[name], None
        b = self.bindings.get(name)
        if b is not None:
            return self._binding_id(b), None
        return None, None

    def resolve_type_name(self, name: str) -> Optional[str]:
        sid, _ = self.resolve_name(name)
        return sid

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
        )
        self.by_id[sid] = sym
        self.out.symbols.append(sym)
        if container is not None and container != self.rel and container in self.by_id:
            self.by_id[container].members[name] = sid
        return sym

    def _declare(self, name: str, kind: SymbolKind, node: Node) -> Symbol:
        """A symbol in the current scope: top-level, or nested in the scope's symbol."""
        at_top = len(self.scopes) == 1
        container = None if at_top else self.scope.symbol
        sym = self._add(name, kind, node, container, exported=(name in self.exported) if at_top else self._container_exported())
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
            PendingMember(
                source=self.scope.symbol or self.rel,
                file=self.rel,
                line=node.start_point[0] + 1,
                kind=kind,
                member=member,
                receiver=receiver,
                receiver_note=note,
            )
        )

    def _receiver(self, obj: Node) -> Tuple[Optional[str], str]:
        """What a member access's object stands for: a symbol id and a note (`this`, `super`, `typed`, `expression`)."""
        if obj.type == "this":
            return self.scope.class_id, "this"
        if obj.type == "super":
            return self.scope.class_id, "super"
        if obj.type == "identifier":
            sid, type_name = self.resolve_name(_text(obj))
            if sid is not None:
                return sid, ""
            if type_name:
                return self.resolve_type_name(type_name), "typed"
            return None, "local"
        return None, "expression"

    def _on_member(self, node: Node, kind: RefKind) -> None:
        """`object.property` as a whole: resolve the property on the object, or walk into a deeper object."""
        obj = node.child_by_field_name("object")
        prop = node.child_by_field_name("property")
        if obj is None:
            return
        if obj.type in ("identifier", "this", "super"):
            receiver, note = self._receiver(obj)
            if receiver is not None and note == "typed":
                self._member(receiver, _text(prop), kind, node, "typed")
            elif receiver is not None:
                self._member(receiver, _text(prop), kind, node, note)
            else:
                self._member(None, _text(prop), kind, node, note)
            return
        if obj.type == "member_expression":
            # `a.b.c`: `a.b` is a read of b on a; c is resolved by name only.
            self._on_member(obj, "read")
            self._member(None, _text(prop), kind, node, "expression")
            return
        # `f().x`, `(a ?? b).x`: the object is an expression of its own.
        self.visit(obj)
        self._member(None, _text(prop), kind, node, "expression")

    # ---- the walk ----

    def run(self) -> FileSymbols:
        root = self.info.tree_root
        if root is None:
            return self.out
        module = Symbol(id=self.rel, name=self.path.name, kind="module", file=self.rel, line=1, end_line=root.end_point[0] + 1, exported=True)
        self.by_id[self.rel] = module
        self.out.symbols.append(module)
        # Declarations first, so forward references inside the file resolve.
        for stmt in root.named_children:
            self._predeclare(stmt)
        for stmt in root.named_children:
            self.visit(stmt)
        return self.out

    def _predeclare(self, stmt: Node) -> None:
        decl = stmt
        if stmt.type == "export_statement":
            if stmt.child_by_field_name("source") is not None:
                return
            decl = stmt.child_by_field_name("declaration")
            if decl is None:
                if any(c.type == "default" for c in stmt.children):
                    value = stmt.child_by_field_name("value")
                    if value is not None and value.type not in _FUNCTION_LIKE and value.type not in _CLASS_LIKE and value.type != "class":
                        self._declare("default", "variable", value)
                return
        for name, kind, node in self._declared_names(decl):
            self._declare(name, kind, node)

    def _declared_names(self, decl: Node) -> Iterator[Tuple[str, SymbolKind, Node]]:
        t = decl.type
        if t in _FUNCTION_LIKE or t in _CLASS_LIKE or t in _TYPE_DECLS:
            name = _text(decl.child_by_field_name("name")) or "default"
            kind: SymbolKind = "function" if t in _FUNCTION_LIKE else "class" if t in _CLASS_LIKE else _TYPE_DECLS[t]
            yield name, kind, decl
        elif t in ("lexical_declaration", "variable_declaration"):
            for d in decl.named_children:
                if d.type != "variable_declarator":
                    continue
                name_node = d.child_by_field_name("name")
                if name_node is None or name_node.type != "identifier":
                    continue
                value = d.child_by_field_name("value")
                is_fn = value is not None and value.type in _FUNCTION_LIKE
                yield _text(name_node), "function" if is_fn else "variable", d

    def visit(self, n: Node) -> None:
        t = n.type
        if t in ("import_statement", "comment", "string", "template_string", "number", "regex"):
            return
        if t == "export_statement":
            self._visit_export(n)
            return
        if t in _FUNCTION_LIKE:
            self._visit_function(n)
            return
        if t in _CLASS_LIKE or t == "class":
            self._visit_class(n)
            return
        if t in _TYPE_DECLS:
            self._visit_type_decl(n)
            return
        if t in ("lexical_declaration", "variable_declaration"):
            self._visit_variables(n)
            return
        if t == "member_expression":
            self._on_member(n, "read")
            return
        if t == "nested_type_identifier":
            module = n.child_by_field_name("module")
            name = n.child_by_field_name("name")
            if module is not None and module.type == "identifier":
                receiver, note = self._receiver(module)
                if receiver is not None:
                    self._member(receiver, _text(name), "type", n, note)
            return
        if t == "call_expression":
            self._visit_call(n, "call")
            return
        if t == "new_expression":
            self._visit_call(n, "instantiate")
            return
        if t in ("assignment_expression", "augmented_assignment_expression"):
            left = n.child_by_field_name("left")
            if left is not None:
                self._visit_write(left)
            right = n.child_by_field_name("right")
            if right is not None:
                self.visit(right)
            return
        if t == "update_expression":
            arg = n.child_by_field_name("argument")
            if arg is not None:
                self._visit_write(arg)
            return
        if t in ("jsx_opening_element", "jsx_self_closing_element"):
            name = n.child_by_field_name("name")
            if name is not None:
                if name.type == "identifier":
                    self._ref(self.resolve_name(_text(name))[0], "call", name)
                elif name.type == "member_expression":
                    self._on_member(name, "call")
            for c in n.children_by_field_name("attribute"):
                self.visit(c)
            return
        if t == "jsx_element":
            open_tag = n.child_by_field_name("open_tag")
            if open_tag is not None:
                self.visit(open_tag)
            for c in n.named_children:
                if not _same(c, open_tag) and c.type != "jsx_closing_element":
                    self.visit(c)
            return
        if t == "jsx_closing_element":
            return
        if t == "decorator":
            inner = next((c for c in n.named_children), None)
            if inner is not None and inner.type == "identifier":
                self._ref(self.resolve_name(_text(inner))[0], "call", inner)
            elif inner is not None:
                self.visit(inner)
            return
        if t == "type_identifier":
            self._ref(self.resolve_type_name(_text(n)), self._type_ref_kind(n), n)
            return
        if t in ("identifier", "shorthand_property_identifier"):
            self._ref(self.resolve_name(_text(n))[0], "read", n)
            return
        if t == "catch_clause":
            param = n.child_by_field_name("parameter")
            self._push(None)
            if param is not None:
                for name in _pattern_names(param):
                    self.scope.locals[name] = None
            body = n.child_by_field_name("body")
            if body is not None:
                self.visit(body)
            self._pop()
            return
        for c in n.named_children:
            self.visit(c)

    @staticmethod
    def _type_ref_kind(n: Node) -> RefKind:
        p = n.parent
        while p is not None and p.type in ("generic_type", "type_arguments", "array_type", "union_type", "intersection_type", "parenthesized_type"):
            p = p.parent
        if p is not None:
            if p.type == "implements_clause":
                return "implements"
            if p.type in ("extends_clause", "extends_type_clause"):
                return "extends"
        return "type"

    def _visit_export(self, n: Node) -> None:
        if n.child_by_field_name("source") is not None:
            return
        decl = n.child_by_field_name("declaration")
        decorators = n.children_by_field_name("decorator")
        if decl is not None:
            self.visit(decl)
            owner = next((self.top.get(name) for name, _k, _n in self._declared_names(decl)), None)
            if decorators:
                self._push(owner)
                for d in decorators:
                    self.visit(d)
                self._pop()
            return
        value = n.child_by_field_name("value")
        if value is not None:
            if value.type in _FUNCTION_LIKE or value.type in _CLASS_LIKE or value.type == "class":
                self.visit(value)
            else:
                self._push(self.top.get("default"))
                self.visit(value)
                self._pop()
        # `export { a, b }` names nothing new and references nothing.

    def _visit_function(self, n: Node) -> None:
        name_node = n.child_by_field_name("name")
        name = _text(name_node) if name_node is not None else None
        sym: Optional[Symbol] = None
        if n.type in ("function_declaration", "generator_function_declaration"):
            sym = self._declare(name or "default", "function", n)
        elif name and n.type in ("function_expression", "function", "generator_function"):
            pass  # a named function expression's name is local to itself
        scope = self._push(sym.id if sym else None)
        if name and sym is None:
            scope.locals[name] = None
        self._bind_parameters(n, scope)
        self._collect_locals(n.child_by_field_name("body"), scope)
        for c in n.named_children:
            if not _same(c, name_node) and c.type != "formal_parameters":
                self.visit(c)
        params = n.child_by_field_name("parameters")
        if params is not None:
            self._visit_parameter_types(params)
        self._pop()

    def _bind_parameters(self, fn: Node, scope: _Scope) -> None:
        params = fn.child_by_field_name("parameters")
        if params is None:
            # `x => x + 1`: a single bare parameter
            p = fn.child_by_field_name("parameter")
            if p is not None:
                scope.locals[_text(p)] = None
            return
        for p in params.named_children:
            pattern = p.child_by_field_name("pattern") or p
            type_node = p.child_by_field_name("type")
            type_name = _annotation_name(type_node)
            if pattern.type == "identifier":
                scope.locals[_text(pattern)] = type_name
            elif pattern.type == "this":
                continue
            else:
                for name in _pattern_names(pattern):
                    scope.locals[name] = None

    def _visit_parameter_types(self, params: Node) -> None:
        for p in params.named_children:
            type_node = p.child_by_field_name("type")
            if type_node is not None:
                self.visit(type_node)
            value = p.child_by_field_name("value")
            if value is not None:
                self.visit(value)
            pattern = p.child_by_field_name("pattern")
            if pattern is not None and pattern.type not in ("identifier", "this"):
                self._visit_pattern_defaults(pattern)

    def _visit_pattern_defaults(self, pattern: Node) -> None:
        for c in pattern.named_children:
            if c.type in ("pair_pattern",):
                v = c.child_by_field_name("value")
                if v is not None:
                    self._visit_pattern_defaults(v)
            elif c.type in ("object_assignment_pattern", "assignment_pattern"):
                r = c.child_by_field_name("right")
                if r is not None:
                    self.visit(r)
            elif c.type in ("object_pattern", "array_pattern", "rest_pattern"):
                self._visit_pattern_defaults(c)

    def _collect_locals(self, body: Optional[Node], scope: _Scope) -> None:
        """Names declared anywhere in a body outside nested functions and classes: they shadow outer names."""
        if body is None:
            return
        stack = [body]
        while stack:
            node = stack.pop()
            t = node.type
            if t in _FUNCTION_LIKE or t in _CLASS_LIKE or t == "class":
                continue
            if t == "variable_declarator":
                name_node = node.child_by_field_name("name")
                if name_node is not None:
                    value = node.child_by_field_name("value")
                    if name_node.type == "identifier":
                        # Nested function values become symbols when visited; keep them resolvable.
                        if value is None or value.type not in _FUNCTION_LIKE:
                            scope.locals.setdefault(_text(name_node), _declared_type(node))
                    else:
                        for name in _pattern_names(name_node):
                            scope.locals.setdefault(name, None)
            elif t == "function_declaration":
                continue
            stack.extend(node.named_children)

    def _visit_variables(self, n: Node) -> None:
        at_top = len(self.scopes) == 1
        for d in n.named_children:
            if d.type != "variable_declarator":
                continue
            name_node = d.child_by_field_name("name")
            value = d.child_by_field_name("value")
            type_node = d.child_by_field_name("type")
            if name_node is None:
                continue
            sym: Optional[Symbol] = None
            if name_node.type == "identifier":
                name = _text(name_node)
                is_fn = value is not None and value.type in _FUNCTION_LIKE
                if at_top or is_fn:
                    sym = self._declare(name, "function" if is_fn else "variable", d)
                    if not is_fn:
                        type_name = _declared_type(d)
                        if type_name:
                            sym.typed_as = self.resolve_type_name(type_name)
                else:
                    self.scope.locals[name] = _declared_type(d)
            else:
                for name in _pattern_names(name_node):
                    if not at_top:
                        self.scope.locals[name] = None
                    else:
                        self._declare(name, "variable", d)
            owner = sym.id if sym is not None else None
            if type_node is not None:
                self._push(owner)
                self.visit(type_node)
                self._pop()
            if value is None:
                continue
            if value.type in _FUNCTION_LIKE and sym is not None:
                self._push(sym.id)
                scope = self.scope
                self._bind_parameters(value, scope)
                self._collect_locals(value.child_by_field_name("body"), scope)
                for c in value.named_children:
                    if c.type != "formal_parameters":
                        self.visit(c)
                params = value.child_by_field_name("parameters")
                if params is not None:
                    self._visit_parameter_types(params)
                self._pop()
            elif value.type == "object" and sym is not None:
                self._visit_object_members(value, sym)
            else:
                self._push(owner)
                self.visit(value)
                self._pop()

    def _visit_object_members(self, obj: Node, owner: Symbol) -> None:
        """`const api = { get() {}, post: () => {} }`: each function-valued key is a member of the variable."""
        self._push(owner.id)
        for c in obj.named_children:
            if c.type == "method_definition":
                name = _text(c.child_by_field_name("name"))
                member = self._add(name, "method", c, owner.id, owner.exported) if name else None
                self._visit_method(c, member.id if member else owner.id, self.scope.class_id)
            elif c.type == "pair":
                key = c.child_by_field_name("key")
                value = c.child_by_field_name("value")
                if value is not None and value.type in _FUNCTION_LIKE and key is not None and key.type == "property_identifier":
                    member = self._add(_text(key), "method", c, owner.id, owner.exported)
                    self._push(member.id)
                    self._visit_function_body(value)
                    self._pop()
                elif value is not None:
                    self.visit(value)
            else:
                self.visit(c)
        self._pop()

    def _visit_function_body(self, fn: Node) -> None:
        scope = self.scope
        self._bind_parameters(fn, scope)
        self._collect_locals(fn.child_by_field_name("body"), scope)
        for c in fn.named_children:
            if c.type != "formal_parameters":
                self.visit(c)
        params = fn.child_by_field_name("parameters")
        if params is not None:
            self._visit_parameter_types(params)

    def _visit_class(self, n: Node) -> None:
        name_node = n.child_by_field_name("name")
        name = _text(name_node) if name_node is not None else ""
        if n.type in _CLASS_LIKE:
            sym = self._declare(name or "default", "class", n)
        else:
            # `const A = class {}`: the class expression belongs to its variable.
            owner = self.scope.symbol
            sym = self.by_id.get(owner or "") or self._declare(name or "default", "class", n)
        self._push(sym.id, sym.id)
        heritage = next((c for c in n.named_children if c.type == "class_heritage"), None)
        if heritage is not None:
            for clause in heritage.named_children:
                if clause.type == "extends_clause":
                    value = clause.child_by_field_name("value")
                    if value is not None and value.type == "identifier":
                        base = self.resolve_name(_text(value))[0]
                        self._ref(base, "extends", value)
                        if base:
                            self.out.bases.setdefault(sym.id, []).append(base)
                    elif value is not None and value.type == "member_expression":
                        self._on_member(value, "extends")
                    elif value is not None:
                        self.visit(value)
                    for ta in clause.children_by_field_name("type_arguments"):
                        self.visit(ta)
                else:
                    self.visit(clause)
        for d in n.children_by_field_name("decorator"):
            self.visit(d)
        body = n.child_by_field_name("body")
        if body is not None:
            for m in body.named_children:
                self._visit_class_member(m, sym)
        self._pop()

    def _visit_class_member(self, m: Node, cls: Symbol) -> None:
        t = m.type
        if t in ("method_definition", "abstract_method_signature", "method_signature"):
            name_node = m.child_by_field_name("name")
            name = _text(name_node) if name_node is not None and name_node.type != "computed_property_name" else ""
            member = self._add(name, "method", m, cls.id, cls.exported) if name else None
            self._visit_method(m, member.id if member else cls.id, cls.id)
        elif t in ("public_field_definition", "property_signature"):
            name_node = m.child_by_field_name("name")
            name = _text(name_node) if name_node is not None and name_node.type != "computed_property_name" else ""
            member = self._add(name, "field", m, cls.id, cls.exported) if name else None
            self._push(member.id if member else cls.id)
            type_node = m.child_by_field_name("type")
            if type_node is not None:
                self.visit(type_node)
            value = m.child_by_field_name("value")
            if value is not None:
                if value.type in _FUNCTION_LIKE:
                    self._visit_function_body(value)
                else:
                    self.visit(value)
            for d in m.children_by_field_name("decorator"):
                self.visit(d)
            if member and type_node is not None:
                type_name = _annotation_name(type_node)
                if type_name:
                    member.typed_as = self.resolve_type_name(type_name)
            if member and value is not None and value.type == "new_expression":
                ctor = value.child_by_field_name("constructor")
                if ctor is not None and ctor.type == "identifier":
                    member.typed_as = self.resolve_name(_text(ctor))[0]
            self._pop()
        elif t == "class_static_block":
            self._push(cls.id)
            self.visit(m)
            self._pop()
        else:
            self.visit(m)

    def _visit_method(self, m: Node, owner: str, class_id: Optional[str]) -> None:
        self._push(owner, class_id)
        for d in m.children_by_field_name("decorator"):
            self.visit(d)
        self._visit_function_body(m)
        self._pop()

    def _visit_type_decl(self, n: Node) -> None:
        name_node = n.child_by_field_name("name")
        sym = self._declare(_text(name_node), _TYPE_DECLS[n.type], n)
        self._push(sym.id)
        for c in n.named_children:
            if not _same(c, name_node):
                self.visit(c)
        self._pop()

    def _note_request(self, n: Node, kind: RefKind) -> None:
        """`fetch("/api/x", {method})`, `x.fetch(...)`, `new URL("/api/x", base)`, `api.post("/x")`: a same-origin request."""
        fn = n.child_by_field_name("function") if kind == "call" else n.child_by_field_name("constructor")
        args = n.child_by_field_name("arguments")
        if fn is None or args is None:
            return
        first = next((a for a in args.named_children), None)
        name = _text(fn) if fn.type == "identifier" else _text(fn.child_by_field_name("property")) if fn.type == "member_expression" else ""
        method: Optional[str] = None
        if kind == "instantiate":
            if name != "URL":
                return
        elif name == "fetch":
            second = args.named_children[1] if len(args.named_children) > 1 else None
            method = _literal_method(second)
        elif fn.type == "member_expression" and name in HTTP_METHODS:
            method = name.upper()
        else:
            return
        path = _path_text(first)
        if path is None and method is None:
            return
        if path is None and name != "fetch":
            return
        self.out.requests.append(HttpRequest(source=self.scope.symbol or self.rel, line=n.start_point[0] + 1, method=method, path=path))

    def _visit_call(self, n: Node, kind: RefKind) -> None:
        self._note_request(n, kind)
        fn = n.child_by_field_name("function") if kind == "call" else n.child_by_field_name("constructor")
        if fn is not None:
            if fn.type == "identifier":
                self._ref(self.resolve_name(_text(fn))[0], kind, fn)
            elif fn.type == "member_expression":
                self._on_member(fn, kind)
            else:
                self.visit(fn)
        for c in n.named_children:
            if not _same(c, fn):
                self.visit(c)

    def _visit_write(self, left: Node) -> None:
        if left.type == "identifier":
            sid, _ = self.resolve_name(_text(left))
            self._ref(sid, "write", left)
        elif left.type == "member_expression":
            self._on_member(left, "write")
        elif left.type == "subscript_expression":
            obj = left.child_by_field_name("object")
            if obj is not None:
                self._visit_write(obj) if obj.type in ("identifier", "member_expression") else self.visit(obj)
            idx = left.child_by_field_name("index")
            if idx is not None:
                self.visit(idx)
        else:
            self.visit(left)


def _same(a: Optional[Node], b: Optional[Node]) -> bool:
    """tree-sitter hands out a new Node object on every access, so identity is by node id."""
    return a is not None and b is not None and a.id == b.id


def _path_text(node: Optional[Node]) -> Optional[str]:
    """A same-origin request path from a string or template literal, `${…}` as `*`; None otherwise."""
    if node is None:
        return None
    if node.type == "string":
        raw = _text(node)
        text = raw[1:-1] if len(raw) >= 2 else ""
    elif node.type == "template_string":
        parts: List[str] = []
        for c in node.children:
            if c.type == "string_fragment":
                parts.append(_text(c))
            elif c.type == "template_substitution":
                parts.append("*")
        text = "".join(parts)
    else:
        return None
    if not text.startswith("/") or text.startswith("//"):
        return None
    return text.split("?", 1)[0].split("#", 1)[0]


def _literal_method(options: Optional[Node]) -> Optional[str]:
    """The `method: "POST"` of a fetch options object literal, upper case; None when absent or not literal."""
    if options is None or options.type != "object":
        return None
    for prop in options.named_children:
        if prop.type == "pair" and _text(prop.child_by_field_name("key")).strip("\"'") == "method":
            value = prop.child_by_field_name("value")
            if value is not None and value.type in ("string", "template_string") and "${" not in _text(value):
                return _text(value)[1:-1].upper()
            return None
    return None


def _pattern_names(pattern: Node) -> Iterator[str]:
    """Every bound identifier in a destructuring pattern."""
    stack = [pattern]
    while stack:
        node = stack.pop()
        t = node.type
        if t in ("identifier", "shorthand_property_identifier_pattern"):
            yield _text(node)
        elif t == "pair_pattern":
            v = node.child_by_field_name("value")
            if v is not None:
                stack.append(v)
        elif t in ("object_assignment_pattern", "assignment_pattern"):
            left = node.child_by_field_name("left")
            if left is not None:
                stack.append(left)
        elif t in ("object_pattern", "array_pattern", "rest_pattern"):
            stack.extend(node.named_children)


def _annotation_name(type_node: Optional[Node]) -> Optional[str]:
    """`: Store` → "Store"; anything else (unions, generics, object types) is not an instance type."""
    if type_node is None:
        return None
    inner = next((c for c in type_node.named_children), None) if type_node.type == "type_annotation" else type_node
    if inner is not None and inner.type == "type_identifier":
        return _text(inner)
    return None


def _declared_type(declarator: Node) -> Optional[str]:
    """A variable's class, from `x: Store` or `x = new Store()`."""
    name = _annotation_name(declarator.child_by_field_name("type"))
    if name:
        return name
    value = declarator.child_by_field_name("value")
    if value is not None and value.type == "new_expression":
        ctor = value.child_by_field_name("constructor")
        if ctor is not None and ctor.type == "identifier":
            return _text(ctor)
    return None


def extract_ts(root: Path, files: List[Path]) -> Tuple[List[FileSymbols], TsProgram]:
    """Symbols and references of every TS/JS file under root, before cross-file member resolution."""
    program = TsProgram(root, files)
    rel_of: Dict[Path, str] = {}
    for f in program.infos:
        try:
            rel_of[f] = f.relative_to(root).as_posix()
        except ValueError:
            continue
    out: List[FileSymbols] = []
    for f, info in program.infos.items():
        rel = rel_of.get(f)
        if rel is None:
            continue
        out.append(TsFileExtractor(program, f, rel, info, rel_of).run())
    return out, program
