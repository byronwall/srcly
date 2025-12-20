from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from tree_sitter import Language, Node, Parser
import tree_sitter_typescript as tstypescript

from app.models import FocusOverlayResponse, OverlayToken


TYPESCRIPT_LANGUAGE = Language(tstypescript.language_typescript())
TSX_LANGUAGE = Language(tstypescript.language_tsx())

logger = logging.getLogger(__name__)

_SUPPORTED_TYPESCRIPT_SUFFIXES: set[str] = {
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
}


def _is_supported_typescript_file(path: Path) -> bool:
    """
    Focus overlay currently only supports TypeScript/TSX sources.

    For all other file types we no-op (return an empty overlay) to avoid
    confusing errors when the client requests overlays for unsupported languages.
    """
    suffix = path.suffix.lower()
    if suffix in _SUPPORTED_TYPESCRIPT_SUFFIXES:
        return True
    # `.d.ts` is still TypeScript; keep an explicit check for clarity/future-proofing.
    if path.name.lower().endswith(".d.ts"):
        return True
    return False


@dataclass(frozen=True)
class _Def:
    name: str
    kind: str  # "param" | "local" | "module" | "import"
    scope_id: str
    scope_type: str  # "global" | "function" | "block" | ...
    def_line: int  # 1-based
    def_col: int  # 0-based
    import_source: str | None = None
    import_is_internal: bool | None = None


@dataclass
class _Scope:
    id: str
    type: str  # "global" | "function" | "block" | "catch"
    parent_id: str | None
    start_line: int
    end_line: int
    vars: Dict[str, _Def]


@dataclass(frozen=True)
class _Usage:
    name: str
    line: int  # 1-based
    start_col: int  # 0-based
    end_col: int  # exclusive
    resolved: _Def | None


_BUILTINS: set[str] = {
    # JS/TS builtins
    "console",
    "Math",
    "JSON",
    "Promise",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Date",
    "RegExp",
    "Set",
    "Map",
    "WeakMap",
    "WeakSet",
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "Symbol",
    "BigInt",
    "Intl",
    "Proxy",
    "Reflect",
    "Atomics",
    "DataView",
    "ArrayBuffer",
    "SharedArrayBuffer",
    "AggregateError",
    "FinalizationRegistry",
    "WeakRef",
    # Typed Arrays
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    # Fetch / Streams
    "fetch",
    "Request",
    "Response",
    "Headers",
    "URL",
    "URLSearchParams",
    "ReadableStream",
    "WritableStream",
    "TransformStream",
    "TextEncoder",
    "TextDecoder",
    # Environment / Global
    "window",
    "document",
    "globalThis",
    "process",
    "Buffer",
    "navigator",
    "location",
    "history",
    "screen",
    "frames",
    "performance",
    "structuredClone",
    "queueMicrotask",
    "requestIdleCallback",
    "cancelIdleCallback",
    # Common DOM / Web APIs
    "Object",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "localStorage",
    "sessionStorage",
    "confirm",
    "alert",
    "prompt",
    "Node",
    "NodeFilter",
    "HTMLElement",
    "Element",
    "Event",
    "CustomEvent",
    "CSS",
    "IntersectionObserver",
    "ResizeObserver",
    "MutationObserver",
    "AbortController",
    "AbortSignal",
    "Crypto",
    "crypto",
    "indexedDB",
    "ShadowRoot",
    "DocumentFragment",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    # Node.js legacy/common
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    # Constants
    "undefined",
    "NaN",
    "Infinity",
}


def _strip_json_comments(text: str) -> str:
    """
    Best-effort removal of `//` and `/* ... */` comments from a JSON-like file.
    """
    result: list[str] = []
    i = 0
    n = len(text)
    in_string = False
    string_quote = ""
    in_line_comment = False
    in_block_comment = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
                result.append(ch)
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue

        if in_string:
            result.append(ch)
            if ch == "\\":
                if i + 1 < n:
                    result.append(text[i + 1])
                    i += 2
                else:
                    i += 1
            elif ch == string_quote:
                in_string = False
                i += 1
            else:
                i += 1
            continue

        if ch in ("'", '"'):
            in_string = True
            string_quote = ch
            result.append(ch)
            i += 1
            continue

        if ch == "/" and nxt == "/":
            in_line_comment = True
            i += 2
            continue

        if ch == "/" and nxt == "*":
            in_block_comment = True
            i += 2
            continue

        result.append(ch)
        i += 1

    return "".join(result)


TSCONFIG_CANDIDATE_NAMES: Tuple[str, ...] = (
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.base.json",
)


def _find_candidate_tsconfig_files(start: Path) -> List[Path]:
    current = start if start.is_dir() else start.parent
    seen: set[Path] = set()
    candidates: List[Path] = []

    for parent in [current, *current.parents]:
        for name in TSCONFIG_CANDIDATE_NAMES:
            candidate = parent / name
            if candidate.exists() and candidate not in seen:
                seen.add(candidate)
                candidates.append(candidate)

    return candidates


def _load_tsconfig_paths(tsconfig_path: Path) -> tuple[Path, Dict[str, List[str]]]:
    import json

    try:
        raw = tsconfig_path.read_text(encoding="utf-8")
        data = json.loads(_strip_json_comments(raw))
    except Exception:
        return tsconfig_path.parent.resolve(), {}

    compiler = data.get("compilerOptions") or {}
    base_url = compiler.get("baseUrl")

    if isinstance(base_url, str) and base_url.strip():
        base_dir = (tsconfig_path.parent / base_url).resolve()
    else:
        base_dir = tsconfig_path.parent.resolve()

    raw_paths = compiler.get("paths") or {}
    paths: Dict[str, List[str]] = {}
    if isinstance(raw_paths, dict):
        for key, value in raw_paths.items():
            if not isinstance(key, str):
                continue
            if isinstance(value, list):
                paths[key] = [v for v in value if isinstance(v, str)]
            elif isinstance(value, str):
                paths[key] = [value]

    return base_dir, paths


def _apply_tsconfig_paths(
    import_path: str, base_dir: Path, paths: Dict[str, List[str]]
) -> List[Path]:
    if not paths:
        return []

    candidates: List[Path] = []

    for pattern, target_patterns in paths.items():
        if "*" in pattern:
            star_index = pattern.find("*")
            prefix = pattern[:star_index]
            suffix = pattern[star_index + 1 :]
            if not import_path.startswith(prefix) or not import_path.endswith(suffix):
                continue
            wildcard_value = import_path[len(prefix) : len(import_path) - len(suffix)]
            for target_pattern in target_patterns:
                if "*" not in target_pattern:
                    target = target_pattern
                    if wildcard_value:
                        if not target.endswith("/") and not wildcard_value.startswith("/"):
                            target = f"{target}/{wildcard_value}"
                        else:
                            target = f"{target}{wildcard_value}"
                else:
                    t_star = target_pattern.find("*")
                    target = (
                        f"{target_pattern[:t_star]}"
                        f"{wildcard_value}"
                        f"{target_pattern[t_star + 1 :]}"
                    )
                candidates.append((base_dir / target).resolve())
        else:
            if import_path != pattern:
                continue
            for target_pattern in target_patterns:
                candidates.append((base_dir / target_pattern).resolve())

    return candidates


def _resolve_to_existing_ts_module(candidate: Path) -> Optional[Path]:
    """
    Resolve a module specifier candidate to an existing TS/TSX module path.
    Returns the resolved file path if it exists, otherwise None.
    """
    resolved = candidate.resolve()
    if resolved.is_file():
        return resolved

    if resolved.suffix == "":
        for ext in (".ts", ".tsx", ".d.ts"):
            p = resolved.with_suffix(ext)
            if p.is_file():
                return p
        for index_name in ("index.ts", "index.tsx"):
            p = (resolved / index_name).resolve()
            if p.is_file():
                return p

    asset_exts = {
        ".css",
        ".scss",
        ".sass",
        ".less",
        ".styl",
        ".json",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".svg",
        ".ico",
        ".webp",
        ".bmp",
        ".avif",
        ".md",
        ".txt",
    }
    if resolved.suffix and resolved.suffix in asset_exts:
        return None

    if resolved.suffix and not resolved.is_file():
        base_name = resolved.name
        for ext in (".ts", ".tsx", ".d.ts"):
            p = (resolved.parent / f"{base_name}{ext}").resolve()
            if p.is_file():
                return p

    return None


def _classify_import_source(
    *, importing_file: Path, import_path: str
) -> tuple[bool, Optional[Path]]:
    """
    Return (is_internal, resolved_path_if_internal_and_resolved).
    """
    if import_path.startswith("."):
        candidate = (importing_file.parent / import_path).resolve()
        resolved = _resolve_to_existing_ts_module(candidate)
        return True, resolved

    tsconfig_candidates = _find_candidate_tsconfig_files(importing_file)
    if tsconfig_candidates:
        base_dir, paths = _load_tsconfig_paths(tsconfig_candidates[0])
        if paths:
            for cand in _apply_tsconfig_paths(import_path, base_dir, paths):
                resolved = _resolve_to_existing_ts_module(cand)
                if resolved is not None:
                    return True, resolved

    return False, None


def compute_focus_overlay(
    *,
    file_path: str,
    slice_start_line: int,
    slice_end_line: int,
    focus_start_line: int,
    focus_end_line: int,
) -> FocusOverlayResponse:
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # No-op for unsupported languages / file types (currently only TS/TSX are supported).
    if not _is_supported_typescript_file(path):
        return FocusOverlayResponse(tokens=[])

    slice_start_line = max(1, int(slice_start_line))
    slice_end_line = max(slice_start_line, int(slice_end_line))
    focus_start_line = max(1, int(focus_start_line))
    focus_end_line = max(focus_start_line, int(focus_end_line))

    content = path.read_bytes()
    is_tsx = path.suffix.lower() == ".tsx" or path.name.endswith(".tsx")
    parser = Parser(TSX_LANGUAGE if is_tsx else TYPESCRIPT_LANGUAGE)
    tree = parser.parse(content)

    file_total_lines = tree.root_node.end_point.row + 1
    focus_start_line = min(focus_start_line, file_total_lines)
    focus_end_line = min(focus_end_line, file_total_lines)
    slice_start_line = min(slice_start_line, file_total_lines)
    slice_end_line = min(slice_end_line, file_total_lines)

    scopes: Dict[str, _Scope] = {}
    
    # Deterministic scope IDs based on start/end lines + a monotonic counter for collisions.
    scope_counter = 0

    def new_scope(scope_type: str, node: Node | None, parent: _Scope | None) -> _Scope:
        nonlocal scope_counter
        scope_counter += 1
        if node is None:
            start_line = 1
            end_line = file_total_lines
        else:
            start_line = node.start_point.row + 1
            end_line = node.end_point.row + 1
        sid = f"{scope_type}:{start_line}:{end_line}:{scope_counter}"
        scope = _Scope(
            id=sid,
            type=scope_type,
            parent_id=parent.id if parent else None,
            start_line=start_line,
            end_line=end_line,
            vars={},
        )
        scopes[scope.id] = scope
        return scope

    global_scope = new_scope("global", tree.root_node, None)

    # --- Helpers ---
    def _is_function_node(n: Node) -> bool:
        return n.type in {
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
            "generator_function",
            "generator_function_declaration",
        }
    
    def _is_catch_clause(n: Node) -> bool:
        return n.type == "catch_clause"

    def _is_scope_boundary(n: Node) -> bool:
        # Mirror the data-flow analyzer behavior: don't create a redundant block
        # scope for function bodies.
        if n.type in {"block", "statement_block"}:
            parent = n.parent
            if parent and (_is_function_node(parent) or _is_catch_clause(parent)):
                return False
            return True
        
        if _is_catch_clause(n):
            return True

        return _is_function_node(n)

    def _scope_type(n: Node) -> str:
        if _is_function_node(n):
            return "function"
        if _is_catch_clause(n):
            return "catch"
        if n.type in {"block", "statement_block"}:
            return "block"
        return "block"

    def _collect_pattern_identifiers(n: Node) -> List[Node]:
        idents: List[Node] = []

        def walk(x: Node) -> None:
            # Plain identifiers and shorthand properties inside patterns.
            if x.type in {"identifier", "shorthand_property_identifier"}:
                idents.append(x)
                return

            # Tree-sitter-typescript represents object destructuring shorthand bindings
            # as `shorthand_property_identifier_pattern` nodes whose text is the binding
            # name (and they often have no identifier children).
            #
            # Example: `const { extensions } = options;`
            #   object_pattern -> shorthand_property_identifier_pattern ("extensions")
            if x.type == "shorthand_property_identifier_pattern":
                idents.append(x)
                return

            # For `{ key: value }` patterns, only the value side introduces bindings.
            # (The key is just a property name.)
            if x.type == "pair_pattern":
                value = x.child_by_field_name("value")
                if value is not None:
                    walk(value)
                else:
                    for c in x.children:
                        walk(c)
                return

            # Skip contexts where identifiers are not bindings.
            if x.type in {
                "member_expression",
                "call_expression",
                "property_identifier",
                "jsx_opening_element",
                "jsx_closing_element",
                "jsx_self_closing_element",
            }:
                return

            for c in x.children:
                walk(c)

        walk(n)
        return idents

    def _add_def(
        *,
        name_node: Node,
        kind: str,
        scope: _Scope,
        scope_type: str,
        import_source: str | None = None,
        import_is_internal: bool | None = None,
    ) -> None:
        name = name_node.text.decode("utf-8", errors="ignore")
        if not name:
            return
        def_line = name_node.start_point.row + 1
        def_col = name_node.start_point.column
        d = _Def(
            name=name,
            kind=kind,
            scope_id=scope.id,
            scope_type=scope_type,
            def_line=def_line,
            def_col=def_col,
            import_source=import_source,
            import_is_internal=import_is_internal,
        )
        scope.vars[name] = d

    def _resolve(name: str, start_scope: _Scope) -> _Def | None:
        curr = start_scope
        while curr:
            if name in curr.vars:
                return curr.vars[name]
            if curr.parent_id:
                curr = scopes[curr.parent_id]
            else:
                break
        return None

    def _ancestor_chain(scope_id: str) -> List[str]:
        chain: List[str] = []
        curr = scopes.get(scope_id)
        while curr is not None:
            chain.append(curr.id)
            if curr.parent_id is None:
                break
            curr = scopes.get(curr.parent_id)
        return chain

    # --- Phase 1: Create scopes and record definitions ---
    
    # We maintain a mapping of node_id -> created_scope so we can look them up in Phase 2
    # `scope_boundary_map[id(node)] = scope`
    scope_boundary_map: Dict[int, _Scope] = {}
    
    def phase1_traverse(n: Node, current_scope: _Scope) -> None:
        next_scope = current_scope
        if _is_scope_boundary(n):
            # If we are effectively creating a new scope
            # Ensure we don't recreate global scope if n is root
            if n != tree.root_node:
                next_scope = new_scope(_scope_type(n), n, current_scope)
                scope_boundary_map[n.id] = next_scope

        # Definitions
        if n.type == "import_statement":
            # Skip `import type ...` statements.
            is_type_import = any(c.type == "type" and c.text == b"type" for c in n.children)
            if not is_type_import:
                source_node = n.child_by_field_name("source")
                import_source = (
                    source_node.text.decode("utf-8", errors="ignore").strip("'\"")
                    if source_node is not None
                    else ""
                )
                is_internal, _resolved = _classify_import_source(
                    importing_file=path, import_path=import_source
                )

                clause = n.child_by_field_name("clause")
                if clause is None:
                    for child in n.children:
                        if child.type == "import_clause":
                            clause = child
                            break

                if clause is not None:
                    # Default import: import Foo from "x"
                    for child in clause.children:
                        if child.type == "identifier":
                            _add_def(
                                name_node=child,
                                kind="import",
                                scope=global_scope,
                                scope_type=global_scope.type,
                                import_source=import_source,
                                import_is_internal=is_internal,
                            )

                    # Namespace import: import * as ns from "x"
                    for child in clause.children:
                        if child.type == "namespace_import":
                            name_node = child.child_by_field_name("name")
                            if name_node is None:
                                for c in child.children:
                                    if c.type == "identifier":
                                        name_node = c
                                        break
                            if name_node is not None:
                                _add_def(
                                    name_node=name_node,
                                    kind="import",
                                    scope=global_scope,
                                    scope_type=global_scope.type,
                                    import_source=import_source,
                                    import_is_internal=is_internal,
                                )

                    # Named imports: import { A, B as C, type T } from "x"
                    named_imports = clause.child_by_field_name("named_imports")
                    if named_imports is None:
                        for child in clause.children:
                            if child.type == "named_imports":
                                named_imports = child
                                break
                    if named_imports is not None:
                        for spec in named_imports.children:
                            if spec.type != "import_specifier":
                                continue
                            # Skip `type` specifiers: { type Foo }
                            if any(
                                c.type == "type" and c.text == b"type"
                                for c in spec.children
                            ):
                                continue
                            alias = spec.child_by_field_name("alias")
                            name_node = spec.child_by_field_name("name")
                            local = alias or name_node
                            if local is not None:
                                _add_def(
                                    name_node=local,
                                    kind="import",
                                    scope=global_scope,
                                    scope_type=global_scope.type,
                                    import_source=import_source,
                                    import_is_internal=is_internal,
                                )

        elif n.type == "variable_declarator":
            name_node = n.child_by_field_name("name")
            if name_node is not None:
                if name_node.type == "identifier":
                    _add_def(
                        name_node=name_node,
                        kind="local",
                        scope=next_scope,
                        scope_type=next_scope.type,
                    )
                else:
                    for ident in _collect_pattern_identifiers(name_node):
                        _add_def(
                            name_node=ident,
                            kind="local",
                            scope=next_scope,
                            scope_type=next_scope.type,
                        )

        elif n.type in {"required_parameter", "optional_parameter", "rest_parameter"}:
            for ident in _collect_pattern_identifiers(n):
                _add_def(
                    name_node=ident,
                    kind="param",
                    scope=next_scope,
                    scope_type=next_scope.type,
                )
        
        elif n.type == "identifier" and n.parent and n.parent.type == "arrow_function":
            # In arrow functions like `tile => { ... }`, the parameter `tile`
            # is a direct identifier child of the arrow_function node.
            _add_def(
                name_node=n,
                kind="param",
                scope=next_scope,
                scope_type=next_scope.type,
            )
        
        elif n.type == "catch_clause":
             # catch (err) ...
             param = n.child_by_field_name("parameter")
             if param:
                # The parameter node might be an identifier or a pattern (destructuring)
                # But it is physically outside the 'body' block.
                # Since we created a 'catch' scope for this catch_clause node, we can add it there.
                
                # In tree-sitter-typescript, the parameter field of catch_clause serves as the binding.
                if param.type == "identifier":
                    _add_def(name_node=param, kind="param", scope=next_scope, scope_type="catch")
                else:
                    for ident in _collect_pattern_identifiers(param):
                         _add_def(name_node=ident, kind="param", scope=next_scope, scope_type="catch")


        elif n.type == "function_declaration":
            name_node = n.child_by_field_name("name")
            if name_node is not None:
                # Define function name in parent scope (if any).
                # `next_scope` IS the function scope.
                # So we want the scope enclosing `n`, which is `current_scope`.
                
                _add_def(
                    name_node=name_node,
                    kind="local" if current_scope.type != "global" else "module",
                    scope=current_scope,
                    scope_type=current_scope.type,
                )

        elif n.type == "class_declaration":
            name_node = n.child_by_field_name("name")
            if name_node is not None:
                _add_def(
                    name_node=name_node,
                    kind="local" if current_scope.type != "global" else "module",
                    scope=current_scope,
                    scope_type=current_scope.type,
                )

        # Loop introductions:
        elif n.type == "for_in_statement":
            # Only treat as an introduction when it's a declaration (const/let/var).
            is_decl = any(c.type in {"const", "let", "var"} for c in n.children)
            if is_decl:
                left = n.child_by_field_name("left")
                if left is not None:
                    if left.type == "identifier":
                        _add_def(
                            name_node=left,
                            kind="local",
                            scope=next_scope,
                            scope_type=next_scope.type,
                        )
                    else:
                        for ident in _collect_pattern_identifiers(left):
                            _add_def(
                                name_node=ident,
                                kind="local",
                                scope=next_scope,
                                scope_type=next_scope.type,
                            )

        for c in n.children:
            phase1_traverse(c, next_scope)

    phase1_traverse(tree.root_node, global_scope)

    # --- Phase 2: Record usages ---
    usages: List[_Usage] = []
    
    unresolved_counts: Dict[str, int] = {}
    
    def phase2_traverse(n: Node, current_scope: _Scope) -> None:
        next_scope = current_scope
        if n.id in scope_boundary_map:
            next_scope = scope_boundary_map[n.id]

        # Usages: resolve identifiers
        if n.type in {"identifier", "undefined", "null", "true", "false"}:
            parent = n.parent
            if parent is not None:
                # Skip identifier occurrences that are themselves definitions.
                if parent.type == "variable_declarator" and parent.child_by_field_name("name") == n:
                    pass
                elif parent.type == "function_declaration" and parent.child_by_field_name("name") == n:
                    pass
                elif parent.type == "class_declaration" and parent.child_by_field_name("name") == n:
                    pass
                elif parent.type in {"required_parameter", "optional_parameter", "rest_parameter"}:
                    pass
                elif parent.type == "catch_clause" and parent.child_by_field_name("parameter") == n:
                    pass
                elif (
                    parent.type == "for_in_statement"
                    and parent.child_by_field_name("left") == n
                    and any(c.type in {"const", "let", "var"} for c in parent.children)
                ):
                    pass
                elif parent.type == "property_identifier":
                    pass
                elif parent.type in {"jsx_opening_element", "jsx_closing_element", "jsx_self_closing_element"}:
                    pass
                else:
                    # Skip identifiers inside binding patterns (destructuring LHS / params)
                    # We need to be careful not to skip usages on the RHS.
                    # e.g. `const { x: y } = z` -> x is prop (skipped), y is def (skipped), z is usage.
                    curr = n
                    is_definition_part = False
                    
                    while curr is not None:
                        p = curr.parent
                        if p is None:
                            break
                        
                        # Variable declarator: `name` field is the pattern/identifier being defined.
                        if p.type == "variable_declarator":
                            name_node = p.child_by_field_name("name")
                            if name_node is not None:
                                check = n
                                # Walk up from n to p. If we hit name_node, we are inside the definition side.
                                while check is not None and check is not p:
                                    if check is name_node:
                                        is_definition_part = True
                                        break
                                    check = check.parent
                                if is_definition_part:
                                    break
                            
                        if p.type in {"required_parameter", "optional_parameter", "rest_parameter"}:
                            is_definition_part = True
                            break
                        
                        if p.type == "catch_clause":
                            param = p.child_by_field_name("parameter")
                             # If we are inside the parameter node
                            if param:
                                check = n
                                while check is not None and check is not p:
                                    if check is param:
                                        is_definition_part = True
                                        break
                                    check = check.parent
                            if is_definition_part:
                                break

                        # Boundaries where definition context definitely ends
                        if p.type in {
                            "program",
                            "statement_block",
                            "function_declaration",
                            "function_expression",
                            "arrow_function",
                            "method_definition",
                            "class_declaration",
                        }:
                            break
                        
                        curr = p
                        if is_definition_part:
                            break
                            
                    if not is_definition_part:
                        name = n.text.decode("utf-8", errors="ignore")
                        if name:
                            resolved = _resolve(name, next_scope)
                            if resolved is None and name not in _BUILTINS:
                                unresolved_counts[name] = unresolved_counts.get(name, 0) + 1
                                
                            usages.append(
                                _Usage(
                                    name=name,
                                    line=n.start_point.row + 1,
                                    start_col=n.start_point.column,
                                    end_col=n.end_point.column,
                                    resolved=resolved,
                                )
                            )

        for c in n.children:
            phase2_traverse(c, next_scope)

    phase2_traverse(tree.root_node, global_scope)

    if unresolved_counts:
        # Log top unresolved identifiers to help identify missing builtins/globals
        sorted_unresolved = sorted(unresolved_counts.items(), key=lambda x: x[1], reverse=True)
        logger.info(f"Focus overlay unresolved symbols for {path.name}: {sorted_unresolved[:20]}")

    # --- Find focus function scope (preferred boundary for param/local/capture semantics) ---
    def smallest_containing_function_scope() -> _Scope:
        candidates: List[_Scope] = []
        for s in scopes.values():
            if s.type != "function":
                continue
            if s.start_line <= focus_start_line and s.end_line >= focus_end_line:
                candidates.append(s)
        if not candidates:
            return global_scope
        return min(candidates, key=lambda s: (s.end_line - s.start_line, s.start_line))

    focus_fn_scope = smallest_containing_function_scope()
    focus_fn_chain = set(_ancestor_chain(focus_fn_scope.id))  # includes global

    # --- Build tokens ---
    tokens: List[OverlayToken] = []

    for u in usages:
        u_line = u.line
        if u_line < slice_start_line or u_line > slice_end_line:
            continue
        if u_line < focus_start_line or u_line > focus_end_line:
            continue

        name = u.name

        u_col_start = u.start_col
        u_col_end = u.end_col
        if u_col_end <= u_col_start:
            continue

        d = u.resolved

        category: str
        tooltip: str
        symbol_id: str

        if d is None:
            if name in _BUILTINS:
                category = "builtin"
                tooltip = "Builtin/global"
                symbol_id = f"builtin:{name}"
            else:
                category = "unresolved"
                tooltip = "Unresolved identifier"
                symbol_id = f"unresolved:{name}"
        else:
            if d.kind == "import":
                symbol_id = f"imp:{file_path}:{d.import_source or ''}:{d.name}"
                if d.import_is_internal:
                    category = "importInternal"
                    tooltip = f"Import (internal): {d.import_source}"
                else:
                    category = "importExternal"
                    tooltip = f"Import (external): {d.import_source}"
            else:
                # Deterministic symbol ID based on definition location.
                symbol_id = f"def:{file_path}:{d.def_line}:{d.def_col}:{d.name}"

                # Parameters should always be classified as parameters, independent
                # of the current focus scope (e.g. when focusing an outer function
                # that contains a nested function).
                if d.kind == "param":
                    category = "param"
                    tooltip = "Parameter"
                else:
                    def_scope = scopes.get(d.scope_id)
                    if def_scope is None:
                        # Should not happen if d.scope_id is valid
                        category = "local"
                        tooltip = f"Declaration (line {d.def_line})"
                    else:
                        if def_scope.type == "global" or def_scope.parent_id is None:
                            category = "module"
                            tooltip = f"Module scope (line {d.def_line})"
                        else:
                            def_chain = set(_ancestor_chain(def_scope.id))
                            if focus_fn_scope.id in def_chain:
                                category = "local"
                                tooltip = f"Local declaration (line {d.def_line})"
                            elif def_scope.id in focus_fn_chain and def_scope.id != global_scope.id:
                                category = "capture"
                                tooltip = f"Captured from outer scope (line {d.def_line})"
                            else:
                                category = "local"
                                tooltip = f"Local declaration (line {d.def_line})"

        tokens.append(
            OverlayToken(
                fileLine=u_line,
                startCol=int(u_col_start),
                endCol=int(u_col_end),
                category=category,
                symbolId=symbol_id,
                tooltip=tooltip,
            )
        )

    return FocusOverlayResponse(tokens=tokens)
