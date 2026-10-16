"""React and Solid components in a TSX file, with per-component metrics.

A component is a function or arrow with a capitalized name that returns JSX.
The name comes from the declaration, or from the variable a wrapper such as
``memo(...)``, ``forwardRef(...)`` or ``observer(...)`` is assigned to.

Per component, counting inside it (nested helpers and callbacks included,
nested components excluded):

- ``component_loc``: lines from the declaration to its end.
- ``component_hook_count``: React ``use*`` calls and Solid ``create*``
  primitives (not ``createElement``/``createPortal``/``createContext``...).
- ``component_effect_count``: ``useEffect``/``useLayoutEffect``/
  ``useInsertionEffect`` and ``createEffect``/``createRenderEffect``/
  ``createComputed``. Effects count as hooks too.
- ``component_jsx_depth``: deepest JSX element nesting, counted from the
  component's own outermost element.
- ``component_prop_count``: declared props. The members of the props type
  when it resolves in this file, else the destructured names, else the
  distinct ``props.x`` reads.
- ``component_inline_handler_count``: ``on*`` attributes whose value is an
  inline function.
- ``component_jsx_conditional_count``: ternaries and ``&&``/``||``/``??``
  that choose JSX or render a JSX child, plus Solid ``<Show>``/``<Match>``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from tree_sitter import Node

FUNCTION_TYPES = frozenset({"function_declaration", "function_expression", "arrow_function"})
_ALL_FUNCTION_TYPES = FUNCTION_TYPES | {"method_definition", "generator_function", "generator_function_declaration"}
JSX_ELEMENT_TYPES = frozenset({"jsx_element", "jsx_self_closing_element", "jsx_fragment"})

_HOOK_RE = re.compile(r"^(use([A-Z0-9]\w*)?|create[A-Z]\w*)$")
_NOT_HOOKS = frozenset({"createElement", "createPortal", "createRef", "createContext", "createRoot", "createFactory"})
EFFECTS = frozenset({
    "useEffect", "useLayoutEffect", "useInsertionEffect",
    "createEffect", "createRenderEffect", "createComputed",
})
_CONDITIONAL_TAGS = frozenset({"Show", "Match"})
_WRAPPER_DEPTH = 3
_TYPE_DEPTH = 4


@dataclass
class ComponentInfo:
    name: str
    node: Node  # the function or arrow
    start_line: int
    end_line: int
    loc: int = 0
    hook_count: int = 0
    effect_count: int = 0
    jsx_depth: int = 0
    prop_count: int = 0
    inline_handler_count: int = 0
    jsx_conditional_count: int = 0
    # (metric id, node, note) for the code viewer's marks.
    marks: list[tuple[str, Node, str]] = field(default_factory=list)


def _text(node: Node | None) -> str:
    return node.text.decode("utf-8", errors="ignore") if node is not None else ""


def component_name(fn: Node) -> str:
    """The name a function is known by, if it's a named declaration or assigned."""
    name = fn.child_by_field_name("name")
    if name is not None and fn.type == "function_declaration":
        return _text(name)
    current = fn
    for _ in range(_WRAPPER_DEPTH):
        parent = current.parent
        if parent is None:
            break
        if parent.type == "variable_declarator":
            return _text(parent.child_by_field_name("name"))
        if parent.type == "arguments" and parent.parent is not None and parent.parent.type == "call_expression":
            current = parent.parent  # memo(fn), forwardRef(fn), observer(fn)
            continue
        if parent.type in {"parenthesized_expression", "as_expression", "satisfies_expression"}:
            current = parent
            continue
        break
    # `export default function Foo()` written as a named function expression.
    return _text(name) if name is not None else ""


def _walk_own(node: Node, *, stop_at_functions: bool):
    """Descendants of ``node``, not entering nested functions when asked."""
    stack = list(reversed(node.children))
    while stack:
        n = stack.pop()
        yield n
        if stop_at_functions and n.type in _ALL_FUNCTION_TYPES:
            continue
        stack.extend(reversed(n.children))


def _returns_jsx(fn: Node) -> bool:
    body = fn.child_by_field_name("body")
    if body is None:
        return False
    if body.type != "statement_block":  # arrow with an expression body
        return body.type in JSX_ELEMENT_TYPES or any(n.type in JSX_ELEMENT_TYPES for n in _walk_own(body, stop_at_functions=True))
    for n in _walk_own(body, stop_at_functions=True):
        if n.type == "return_statement" and any(c.type in JSX_ELEMENT_TYPES for c in _walk_own(n, stop_at_functions=True)):
            return True
    return False


def is_component(fn: Node) -> bool:
    if fn.type not in FUNCTION_TYPES:
        return False
    name = component_name(fn)
    return bool(name) and name[0].isupper() and _returns_jsx(fn)


def find_components(root: Node) -> list[ComponentInfo]:
    types = _type_declarations(root)
    found: list[ComponentInfo] = []
    stack = [root]
    while stack:
        n = stack.pop()
        if n.type in FUNCTION_TYPES and is_component(n):
            found.append(_measure(n, types))
        stack.extend(n.children)
    found.sort(key=lambda c: (c.start_line, c.end_line))
    return found


# --- measurement -----------------------------------------------------------


def _callee_name(call: Node) -> str:
    fn = call.child_by_field_name("function")
    if fn is None:
        return ""
    if fn.type == "member_expression":  # React.useState
        return _text(fn.child_by_field_name("property"))
    return _text(fn) if fn.type == "identifier" else ""


def _attribute_name(attr: Node) -> str:
    for child in attr.children:
        if child.type in {"property_identifier", "jsx_identifier", "identifier", "jsx_namespace_name"}:
            return _text(child)
    return ""


def _is_inline_handler(attr: Node) -> bool:
    name = _attribute_name(attr)
    if not name.startswith("on"):
        return False
    for child in attr.children:
        if child.type == "jsx_expression":
            return any(c.type in {"arrow_function", "function_expression"} for c in child.children)
    return False


def _tag_name(element: Node) -> str:
    if element.type == "jsx_element":
        opening = element.child_by_field_name("open_tag")
        return _text(opening.child_by_field_name("name")) if opening is not None else ""
    if element.type == "jsx_self_closing_element":
        return _text(element.child_by_field_name("name"))
    return ""


def _unwrap(node: Node | None) -> Node | None:
    while node is not None and node.type == "parenthesized_expression":
        node = node.named_children[0] if node.named_children else None
    return node


def _jsx_conditional_note(node: Node) -> str | None:
    """A note when ``node`` is a conditional that picks what renders."""
    if node.type == "ternary_expression":
        operands = [node.child_by_field_name("consequence"), node.child_by_field_name("alternative")]
        note = "?:"
    elif node.type == "binary_expression":
        op = _text(node.child_by_field_name("operator"))
        if op not in {"&&", "||", "??"}:
            return None
        operands = [node.child_by_field_name("right")]
        note = op
    else:
        return None
    if any((o := _unwrap(op_node)) is not None and o.type in JSX_ELEMENT_TYPES for op_node in operands):
        return note
    parent = node.parent
    # `{cond && "text"}` as a JSX child (not an attribute value).
    if parent is not None and parent.type == "jsx_expression" and parent.parent is not None and parent.parent.type in {"jsx_element", "jsx_fragment"}:
        return note
    return None


def _measure(fn: Node, types: dict[str, Node]) -> ComponentInfo:
    info = ComponentInfo(
        name=component_name(fn),
        node=fn,
        start_line=fn.start_point.row + 1,
        end_line=fn.end_point.row + 1,
    )
    info.loc = info.end_line - info.start_line + 1
    info.marks.append(("component_loc", fn, f"{info.name}: {info.loc} lines"))

    deepest: tuple[int, Node | None] = (0, None)
    # Iterative walk with JSX depth, skipping nested components.
    stack: list[tuple[Node, int]] = [(c, 0) for c in reversed(fn.children)]
    while stack:
        n, depth = stack.pop()
        if n.type in FUNCTION_TYPES and is_component(n):
            continue
        t = n.type
        if t in JSX_ELEMENT_TYPES:
            depth += 1
            if depth > deepest[0]:
                deepest = (depth, n)
            if _tag_name(n) in _CONDITIONAL_TAGS:
                info.jsx_conditional_count += 1
                info.marks.append(("component_jsx_conditional_count", n, f"<{_tag_name(n)}>"))
        elif t == "call_expression":
            callee = _callee_name(n)
            if _HOOK_RE.match(callee) and callee not in _NOT_HOOKS:
                info.hook_count += 1
                info.marks.append(("component_hook_count", n, callee))
                if callee in EFFECTS:
                    info.effect_count += 1
                    info.marks.append(("component_effect_count", n, callee))
        elif t == "jsx_attribute":
            if _is_inline_handler(n):
                info.inline_handler_count += 1
                info.marks.append(("component_inline_handler_count", n, _attribute_name(n)))
        else:
            note = _jsx_conditional_note(n)
            if note:
                info.jsx_conditional_count += 1
                info.marks.append(("component_jsx_conditional_count", n, note))
        stack.extend((c, depth) for c in reversed(n.children))

    info.jsx_depth = deepest[0]
    if deepest[1] is not None:
        info.marks.append(("component_jsx_depth", deepest[1], f"depth {deepest[0]}"))

    info.prop_count, prop_node = _declared_props(fn, types)
    if prop_node is not None and info.prop_count:
        info.marks.append(("component_prop_count", prop_node, f"{info.prop_count} prop{'s' if info.prop_count != 1 else ''}"))
    return info


# --- declared props ----------------------------------------------------------


def _type_declarations(root: Node) -> dict[str, Node]:
    """Interfaces and type aliases declared anywhere in the file, by name."""
    found: dict[str, Node] = {}
    stack = [root]
    while stack:
        n = stack.pop()
        if n.type in {"interface_declaration", "type_alias_declaration"}:
            name = _text(n.child_by_field_name("name"))
            if name and name not in found:
                found[name] = n
        stack.extend(n.children)
    return found


def _type_members(type_node: Node | None, types: dict[str, Node], depth: int = 0) -> int | None:
    """Members of an object-like type, or None when it doesn't resolve here."""
    if type_node is None or depth > _TYPE_DEPTH:
        return None
    t = type_node.type
    if t == "type_annotation":
        return _type_members(type_node.named_children[0] if type_node.named_children else None, types, depth)
    if t in {"object_type", "interface_body"}:
        return sum(1 for c in type_node.named_children if c.type in {"property_signature", "method_signature"})
    if t == "parenthesized_type":
        return _type_members(type_node.named_children[0] if type_node.named_children else None, types, depth + 1)
    if t == "intersection_type":
        parts = [_type_members(c, types, depth + 1) for c in type_node.named_children]
        known = [p for p in parts if p is not None]
        return sum(known) if known else None
    if t == "type_identifier":
        decl = types.get(_text(type_node))
        if decl is None:
            return None
        if decl.type == "interface_declaration":
            own = _type_members(decl.child_by_field_name("body"), types, depth + 1) or 0
            for clause in decl.named_children:
                if clause.type == "extends_type_clause":
                    for parent in clause.named_children:
                        own += _type_members(parent, types, depth + 1) or 0
            return own
        return _type_members(decl.child_by_field_name("value"), types, depth + 1)
    if t == "generic_type":
        # Props wrappers (`ParentProps<{...}>`, `PropsWithChildren<P>`): count the argument.
        args = type_node.child_by_field_name("type_arguments")
        if args is None:
            args = next((c for c in type_node.named_children if c.type == "type_arguments"), None)
        if args is not None and args.named_children:
            return _type_members(args.named_children[0], types, depth + 1)
        return _type_members(type_node.child_by_field_name("name"), types, depth + 1)
    return None


def _declarator_type(fn: Node) -> Node | None:
    """`const Card: FC<Props> = ...` → `Props`; also `Component<Props>` in Solid."""
    current = fn
    for _ in range(_WRAPPER_DEPTH):
        parent = current.parent
        if parent is None:
            return None
        if parent.type == "variable_declarator":
            annotation = parent.child_by_field_name("type")
            if annotation is None:
                return None
            inner = annotation.named_children[0] if annotation.named_children else None
            if inner is not None and inner.type == "generic_type":
                args = next((c for c in inner.named_children if c.type == "type_arguments"), None)
                if args is not None and args.named_children:
                    return args.named_children[0]
            return None
        current = parent
    return None


def _declared_props(fn: Node, types: dict[str, Node]) -> tuple[int, Node | None]:
    params = fn.child_by_field_name("parameters")
    if params is None:
        # `props => ...` arrow with one bare parameter.
        single = fn.child_by_field_name("parameter")
        if single is None:
            return 0, None
        param, pattern, annotation = single, single, None
    else:
        named = [c for c in params.named_children if c.type != "comment"]
        if not named:
            return 0, None
        param = named[0]
        pattern = param.child_by_field_name("pattern") or param
        annotation = param.child_by_field_name("type")

    members = _type_members(annotation, types) if annotation is not None else None
    if members is None:
        declared = _declarator_type(fn)
        members = _type_members(declared, types) if declared is not None else None
    if members is not None:
        return members, param

    if pattern.type == "object_pattern":
        keys = [c for c in pattern.named_children if c.type in {
            "shorthand_property_identifier_pattern", "pair_pattern", "object_assignment_pattern",
        }]
        return len(keys), param

    if pattern.type == "identifier":
        name = _text(pattern)
        seen: set[str] = set()
        body = fn.child_by_field_name("body")
        for n in _walk_own(body, stop_at_functions=False) if body is not None else ():
            if n.type == "member_expression":
                obj = n.child_by_field_name("object")
                if obj is not None and obj.type == "identifier" and _text(obj) == name:
                    seen.add(_text(n.child_by_field_name("property")))
        return len(seen), param
    return 0, param
