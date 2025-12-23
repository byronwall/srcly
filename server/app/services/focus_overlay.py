from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, TYPE_CHECKING

from fastapi import HTTPException
from tree_sitter import Language, Node, Parser
import tree_sitter_typescript as tstypescript

from app.models import FocusOverlayResponse, OverlayToken

if TYPE_CHECKING:
    from app.models import ScopeGraph


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
    def_line: int  # Line of the node that created the scope
    vars: Dict[str, _Def]
    children_ids: List[str] = field(default_factory=list)  # IDs of direct child scopes
    name: str | None = None  # Display name of the scope (e.g. function name)


@dataclass(frozen=True)
class _Usage:
    name: str
    line: int  # 1-based
    start_col: int  # 0-based
    end_col: int  # exclusive
    resolved: _Def | None
    containing_fn_scope_id: str  # Added to track where this usage occurs


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
            if ch == "\\n":
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
            if ch == "\\\\":
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


# --- FocusAnalyzer ---

class FocusAnalyzer:
    def __init__(self, path: Path, content: bytes):
        self.path = path
        self.content = content
        self.source_lines = content.decode("utf-8", errors="replace").splitlines()
        self.is_tsx = path.suffix.lower() == ".tsx" or path.name.endswith(".tsx")
        
        parser = Parser(TSX_LANGUAGE if self.is_tsx else TYPESCRIPT_LANGUAGE)
        self.tree = parser.parse(content)
        self.file_total_lines = self.tree.root_node.end_point.row + 1
        
        self.scopes: Dict[str, _Scope] = {}
        self.usages: List[_Usage] = []
        self.unresolved_counts: Dict[str, int] = {}
        self.global_scope: _Scope | None = None
        self.scope_boundary_map: Dict[int, _Scope] = {} # node_id -> scope

        self._scope_counter = 0

    def analyze(self):
        """Run Phase 1 (Scopes/Defs) and Phase 2 (Usages)."""
        self._scope_counter = 0
        self.global_scope = self._new_scope("global", self.tree.root_node, None)
        
        # Phase 1
        self._phase1_traverse(self.tree.root_node, self.global_scope)
        
        # Phase 2
        self._phase2_traverse(self.tree.root_node, self.global_scope)
        
        if self.unresolved_counts:
            sorted_unresolved = sorted(self.unresolved_counts.items(), key=lambda x: x[1], reverse=True)
            logger.info(f"Focus overlay unresolved symbols for {self.path.name}: {sorted_unresolved[:20]}")

    def _new_scope(self, scope_type: str, node: Node | None, parent: _Scope | None) -> _Scope:
        self._scope_counter += 1
        if node is None:
            start_line = 1
            end_line = self.file_total_lines
        else:
            start_line = node.start_point.row + 1
            end_line = node.end_point.row + 1
        sid = f"{scope_type}:{start_line}:{end_line}:{self._scope_counter}"
        
        scope_name = self._get_scope_name(node) if node else None
        
        scope = _Scope(
            id=sid,
            type=scope_type,
            parent_id=parent.id if parent else None,
            start_line=start_line,
            end_line=end_line,
            def_line=start_line,
            vars={},
            children_ids=[],
            name=scope_name,
        )
        if parent:
            parent.children_ids.append(scope.id)
            
        self.scopes[scope.id] = scope
        return scope

    def _get_scope_name(self, node: Node) -> str | None:
        if node.type in {"function_declaration", "generator_function_declaration", "class_declaration", "method_definition"}:
            name_node = node.child_by_field_name("name")
            if name_node:
                return name_node.text.decode("utf-8", errors="ignore")
        
        if node.type in {"arrow_function", "function_expression"}:
            # Check parent for assignment
            p = node.parent
            if p:
                if p.type == "variable_declarator":
                    name_node = p.child_by_field_name("name")
                    if name_node:
                        return name_node.text.decode("utf-8", errors="ignore")
                elif p.type == "pair_pattern" or p.type == "pair": # Object assignment
                     key_node = p.child_by_field_name("key")
                     if key_node:
                        # key might be property_identifier or string
                        return key_node.text.decode("utf-8", errors="ignore").strip("\"'")
                elif p.type == "assignment_expression":
                    left = p.child_by_field_name("left")
                    if left:
                        # left might be identifier or member_expression
                        return left.text.decode("utf-8", errors="ignore")
                elif p.type == "jsx_expression": # const x = <div onClick={() => ...} />
                    # grand parent
                    gp = p.parent
                    if gp and gp.type == "jsx_attribute":
                         attr_name = gp.child_by_field_name("name")
                         if not attr_name:
                             # Fallback: find first property_identifier or jsx_identifier child
                             for child in gp.children:
                                 if child.type in {"property_identifier", "jsx_identifier"}:
                                     attr_name = child
                                     break
                         if attr_name:
                             return attr_name.text.decode("utf-8", errors="ignore")

        return None


    def _is_function_node(self, n: Node) -> bool:
        return n.type in {
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
            "generator_function",
            "generator_function_declaration",
        }
    
    def _is_catch_clause(self, n: Node) -> bool:
        return n.type == "catch_clause"

    def _is_scope_boundary(self, n: Node) -> bool:
        if n.type in {"block", "statement_block"}:
            parent = n.parent
            if parent and (self._is_function_node(parent) or self._is_catch_clause(parent)):
                return False
            return True
        if self._is_catch_clause(n):
            return True
        return self._is_function_node(n)

    def _scope_type(self, n: Node) -> str:
        if self._is_function_node(n):
            return "function"
        if self._is_catch_clause(n):
            return "catch"
        if n.type in {"block", "statement_block"}:
            return "block"
        return "block"

    def _collect_pattern_identifiers(self, n: Node) -> List[Node]:
        idents: List[Node] = []
        def walk(x: Node) -> None:
            if x.type in {"identifier", "shorthand_property_identifier"}:
                idents.append(x)
                return
            if x.type == "shorthand_property_identifier_pattern":
                idents.append(x)
                return
            if x.type == "pair_pattern":
                value = x.child_by_field_name("value")
                if value is not None:
                    walk(value)
                else:
                    for c in x.children:
                        walk(c)
                return
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
        self,
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

    def _resolve(self, name: str, start_scope: _Scope) -> _Def | None:
        curr = start_scope
        while curr:
            if name in curr.vars:
                return curr.vars[name]
            if curr.parent_id:
                curr = self.scopes[curr.parent_id]
            else:
                break
        return None

    def _ancestor_chain(self, scope_id: str) -> List[str]:
        chain: List[str] = []
        curr = self.scopes.get(scope_id)
        while curr is not None:
            chain.append(curr.id)
            if curr.parent_id is None:
                break
            curr = self.scopes.get(curr.parent_id)
        return chain

    def _phase1_traverse(self, n: Node, current_scope: _Scope) -> None:
        next_scope = current_scope
        if self._is_scope_boundary(n):
            if n != self.tree.root_node:
                next_scope = self._new_scope(self._scope_type(n), n, current_scope)
                self.scope_boundary_map[n.id] = next_scope

        # Definitions
        if n.type == "import_statement":
            is_type_import = any(c.type == "type" and c.text == b"type" for c in n.children)
            if not is_type_import:
                source_node = n.child_by_field_name("source")
                import_source = (
                    source_node.text.decode("utf-8", errors="ignore").strip("'\"")
                    if source_node is not None
                    else ""
                )
                is_internal, _resolved = _classify_import_source(
                    importing_file=self.path, import_path=import_source
                )

                clause = n.child_by_field_name("clause")
                if clause is None:
                    for child in n.children:
                        if child.type == "import_clause":
                            clause = child
                            break

                if clause is not None:
                    for child in clause.children:
                        if child.type == "identifier":
                            self._add_def(
                                name_node=child,
                                kind="import",
                                scope=self.global_scope,
                                scope_type=self.global_scope.type,
                                import_source=import_source,
                                import_is_internal=is_internal,
                            )
                    for child in clause.children:
                        if child.type == "namespace_import":
                            name_node = child.child_by_field_name("name")
                            if name_node is None:
                                for c in child.children:
                                    if c.type == "identifier":
                                        name_node = c
                                        break
                            if name_node is not None:
                                self._add_def(
                                    name_node=name_node,
                                    kind="import",
                                    scope=self.global_scope,
                                    scope_type=self.global_scope.type,
                                    import_source=import_source,
                                    import_is_internal=is_internal,
                                )

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
                            if any(
                                c.type == "type" and c.text == b"type"
                                for c in spec.children
                            ):
                                continue
                            alias = spec.child_by_field_name("alias")
                            name_node = spec.child_by_field_name("name")
                            local = alias or name_node
                            if local is not None:
                                self._add_def(
                                    name_node=local,
                                    kind="import",
                                    scope=self.global_scope,
                                    scope_type=self.global_scope.type,
                                    import_source=import_source,
                                    import_is_internal=is_internal,
                                )

        elif n.type == "variable_declarator":
            name_node = n.child_by_field_name("name")
            if name_node is not None:
                if name_node.type == "identifier":
                    self._add_def(
                        name_node=name_node,
                        kind="local",
                        scope=next_scope,
                        scope_type=next_scope.type,
                    )
                else:
                    for ident in self._collect_pattern_identifiers(name_node):
                        self._add_def(
                            name_node=ident,
                            kind="local",
                            scope=next_scope,
                            scope_type=next_scope.type,
                        )

        elif n.type in {"required_parameter", "optional_parameter", "rest_parameter"}:
            for ident in self._collect_pattern_identifiers(n):
                self._add_def(
                    name_node=ident,
                    kind="param",
                    scope=next_scope,
                    scope_type=next_scope.type,
                )
        
        elif n.type == "identifier" and n.parent and n.parent.type == "arrow_function":
            self._add_def(
                name_node=n,
                kind="param",
                scope=next_scope,
                scope_type=next_scope.type,
            )
        
        elif n.type == "catch_clause":
             param = n.child_by_field_name("parameter")
             if param:
                if param.type == "identifier":
                    self._add_def(name_node=param, kind="param", scope=next_scope, scope_type="catch")
                else:
                    for ident in self._collect_pattern_identifiers(param):
                         self._add_def(name_node=ident, kind="param", scope=next_scope, scope_type="catch")


        elif n.type == "function_declaration":
            name_node = n.child_by_field_name("name")
            if name_node is not None:
                # Define function name in parent scope
                self._add_def(
                    name_node=name_node,
                    kind="local" if current_scope.type != "global" else "module",
                    scope=current_scope,
                    scope_type=current_scope.type,
                )

        elif n.type == "class_declaration":
            name_node = n.child_by_field_name("name")
            if name_node is not None:
                self._add_def(
                    name_node=name_node,
                    kind="local" if current_scope.type != "global" else "module",
                    scope=current_scope,
                    scope_type=current_scope.type,
                )

        elif n.type == "for_in_statement":
            is_decl = any(c.type in {"const", "let", "var"} for c in n.children)
            if is_decl:
                left = n.child_by_field_name("left")
                if left is not None:
                    if left.type == "identifier":
                        self._add_def(
                            name_node=left,
                            kind="local",
                            scope=next_scope,
                            scope_type=next_scope.type,
                        )
                    else:
                        for ident in self._collect_pattern_identifiers(left):
                            self._add_def(
                                name_node=ident,
                                kind="local",
                                scope=next_scope,
                                scope_type=next_scope.type,
                            )
        
        # Recurse
        for c in n.children:
            self._phase1_traverse(c, next_scope)

    def _phase2_traverse(self, n: Node, current_scope: _Scope) -> None:
        next_scope = current_scope
        if n.id in self.scope_boundary_map:
            next_scope = self.scope_boundary_map[n.id]

        # Usages: resolve identifiers
        if n.type in {"identifier", "jsx_identifier"}:
            parent = n.parent
            if parent is not None:
                # Same skips as before
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
                elif (n.type in {"identifier", "jsx_identifier"}) and parent.type == "jsx_attribute" and parent.child_by_field_name("name") == n:
                    pass
                elif (
                    n.type in {"identifier", "jsx_identifier"} 
                    and parent.type in {"jsx_opening_element", "jsx_closing_element", "jsx_self_closing_element"}
                    and parent.child_by_field_name("name") == n
                    and n.text.decode("utf-8", errors="ignore")[0].islower()
                ):
                    pass
                else:
                    curr = n
                    is_definition_part = False
                    while curr is not None:
                        p = curr.parent
                        if p is None:
                            break
                        if p.type == "variable_declarator":
                            name_node = p.child_by_field_name("name")
                            if name_node is not None:
                                check = n
                                while check is not None and check is not p:
                                    if check == name_node:
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
                            if param:
                                check = n
                                while check is not None and check is not p:
                                    if check is param:
                                        is_definition_part = True
                                        break
                                    check = check.parent
                            if is_definition_part:
                                break
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
                            resolved = self._resolve(name, next_scope)
                            if resolved is None and name not in _BUILTINS:
                                self.unresolved_counts[name] = self.unresolved_counts.get(name, 0) + 1
                            
                            usage_fn_scope = next_scope
                            while usage_fn_scope and usage_fn_scope.type != "function" and usage_fn_scope.parent_id:
                                usage_fn_scope = self.scopes[usage_fn_scope.parent_id]
                            
                            self.usages.append(
                                _Usage(
                                    name=name,
                                    line=n.start_point.row + 1,
                                    start_col=n.start_point.column,
                                    end_col=n.end_point.column,
                                    resolved=resolved,
                                    containing_fn_scope_id=usage_fn_scope.id if usage_fn_scope else self.global_scope.id,
                                )
                            )

        for c in n.children:
            self._phase2_traverse(c, next_scope)


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

    if not _is_supported_typescript_file(path):
        return FocusOverlayResponse(tokens=[])

    slice_start_line = max(1, int(slice_start_line))
    slice_end_line = max(slice_start_line, int(slice_end_line))
    focus_start_line = max(1, int(focus_start_line))
    focus_end_line = max(focus_start_line, int(focus_end_line))

    content = path.read_bytes()
    analyzer = FocusAnalyzer(path, content)
    analyzer.analyze()

    # --- Build tokens ---
    tokens: List[OverlayToken] = []

    for u in analyzer.usages:
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
                symbol_id = f"def:{file_path}:{d.def_line}:{d.def_col}:{d.name}"
                if d.kind == "param":
                    category = "param"
                    tooltip = "Parameter"
                else:
                    def_scope = analyzer.scopes.get(d.scope_id)
                    if def_scope is None:
                        category = "local"
                        tooltip = f"Declaration (line {d.def_line})"
                    else:
                        if def_scope.type == "global" or def_scope.parent_id is None:
                            category = "module"
                            tooltip = f"Module scope (line {d.def_line})"
                        else:
                            usage_fn_scope_id = u.containing_fn_scope_id
                            
                            def_chain = set(analyzer._ancestor_chain(def_scope.id))
                            usage_fn_chain = set(analyzer._ancestor_chain(usage_fn_scope_id))
                            
                            definition_in_focus = (focus_start_line <= d.def_line <= focus_end_line)
                            
                            if definition_in_focus:
                                category = "local"
                                tooltip = f"Local declaration (line {d.def_line})"
                            elif usage_fn_scope_id in def_chain:
                                category = "local"
                                tooltip = f"Local declaration (line {d.def_line})"
                            elif def_scope.id in usage_fn_chain and def_scope.id != analyzer.global_scope.id:
                                category = "capture"
                                tooltip = f"Captured from outer scope (line {d.def_line})"
                            else:
                                category = "local"
                                tooltip = f"Local declaration (line {d.def_line})"

        definition_snippet: str | None = None
        definition_line: int | None = None
        if d:
            definition_line = d.def_line
            if 0 <= d.def_line - 1 < len(analyzer.source_lines):
                 definition_snippet = analyzer.source_lines[d.def_line - 1].strip()

        scope_snippet: str | None = None
        scope_line: int | None = None
        scope_end_line: int | None = None

        if category == "capture" and d:
            def_scope = analyzer.scopes.get(d.scope_id)
            if def_scope:
                scope_line = def_scope.def_line
                scope_end_line = def_scope.end_line
                if 0 <= scope_line - 1 < len(analyzer.source_lines):
                    scope_snippet = analyzer.source_lines[scope_line - 1].strip()

        tokens.append(
            OverlayToken(
                fileLine=u_line,
                startCol=int(u_col_start),
                endCol=int(u_col_end),
                category=category,
                symbolId=symbol_id,
                tooltip=tooltip,
                definitionSnippet=definition_snippet,
                definitionLine=definition_line,
                scopeSnippet=scope_snippet,
                scopeLine=scope_line,
                scopeEndLine=scope_end_line,
            )
        )

    return FocusOverlayResponse(tokens=tokens)


def compute_scope_graph(
    *,
    file_path: str,
    focus_start_line: int,
    focus_end_line: int,
) -> "ScopeGraph":
    from app.models import ScopeGraph, ScopeNode, SymbolNode

    path = Path(file_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    content = path.read_bytes()
    analyzer = FocusAnalyzer(path, content)
    analyzer.analyze()

    # 1. Find the best matching "focused scope"
    
    def fits(s: _Scope) -> bool:
        return s.start_line <= focus_start_line and s.end_line >= focus_end_line

    current = analyzer.global_scope
    while True:
        found_better = False
        for child_id in current.children_ids:
            child = analyzer.scopes[child_id]
            if fits(child):
                current = child
                found_better = True
                break
        if not found_better:
            break
    
    root_scope = current
    
    # 2. Build the ScopeNode tree starting from root_scope
    
    def build_node(s: _Scope) -> Optional[ScopeNode]:
        declared_nodes: List[SymbolNode] = []
        for d in s.vars.values():
             if d.kind != "import":
                declared_nodes.append(SymbolNode(
                    id=f"def:{s.id}:{d.name}",
                    name=d.name,
                    kind=d.kind,
                    declLine=d.def_line,
                    isDeclaredHere=True,
                    isCaptured=False
                ))
        
        captured_map: Dict[str, _Def] = {} 
        
        descendant_ids = {s.id}
        queue = [s.id]
        while queue:
            curr_id = queue.pop(0)
            curr_s = analyzer.scopes[curr_id]
            descendant_ids.add(curr_id)
            queue.extend(curr_s.children_ids)
            
        ancestor_ids = set(analyzer._ancestor_chain(s.id))
        if s.id in ancestor_ids:
            ancestor_ids.remove(s.id)
            
        for u in analyzer.usages:
            if u.containing_fn_scope_id in descendant_ids:
                d = u.resolved
                if d and d.scope_id in ancestor_ids and d.name not in _BUILTINS:
                    if d.kind != "import" and d.scope_type != "global":
                        captured_map[d.name] = d

        captured_nodes: List[SymbolNode] = []
        for d in captured_map.values():
            captured_nodes.append(SymbolNode(
                id=f"cap:{s.id}:{d.name}",
                name=d.name,
                kind=d.kind,
                declLine=d.def_line,
                isDeclaredHere=False,
                isCaptured=True
            ))

        child_nodes: List[ScopeNode] = []
        for child_id in s.children_ids:
            child_scope = analyzer.scopes[child_id]
            node = build_node(child_scope)
            if node:
                child_nodes.append(node)
        
        # Prune empty nodes
        if not declared_nodes and not captured_nodes and not child_nodes:
            # But keep the root of our request? 
            # The function `compute_scope_graph` returns `ScopeGraph(root=...)`.
            # If the top-level scope itself is empty, we must return *something* or handle it.
            # We'll handle the root check at the call site.
            return None

        return ScopeNode(
            id=s.id,
            kind=s.type,
            name=s.name or f"{s.type}@{s.start_line}", 
            startLine=s.start_line,
            endLine=s.end_line,
            children=child_nodes,
            declared=sorted(declared_nodes, key=lambda x: x.name),
            captured=sorted(captured_nodes, key=lambda x: x.name),
        )

    scope_tree_root = build_node(root_scope)
    
    if scope_tree_root is None:
        # Fallback if root is pruned (totally empty scope)
        # Create an empty node for the root scope so we respect the return type
        scope_tree_root = ScopeNode(
            id=root_scope.id,
            kind=root_scope.type,
            name=root_scope.name or f"{root_scope.type}@{root_scope.start_line}",
            startLine=root_scope.start_line,
            endLine=root_scope.end_line,
            children=[],
            declared=[],
            captured=[]
        )

    
    return ScopeGraph(root=scope_tree_root)
