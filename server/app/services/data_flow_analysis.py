import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser, Node
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
import uuid

from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

# Load TypeScript and TSX grammars
TYPESCRIPT_LANGUAGE = Language(tstypescript.language_typescript())
TSX_LANGUAGE = Language(tstypescript.language_tsx())

@dataclass
class VariableDef:
    id: str
    name: str
    kind: str  # 'var', 'let', 'const', 'param', 'function', 'class', 'import'
    scope_id: str
    # 1-based line numbers for the definition in the source file
    start_line: int
    end_line: int

@dataclass
class VariableUsage:
    id: str
    name: str
    scope_id: str
    def_id: Optional[str]  # ID of the definition this usage points to
    # 1-based line numbers for the usage in the source file
    start_line: int
    end_line: int
    context: str  # 'read', 'write', 'call', 'property_access'
    attribute_name: Optional[str] = None

@dataclass
class Scope:
    id: str
    type: str  # 'global', 'function', 'block', 'class', 'jsx'
    parent_id: Optional[str]
    # 1-based line numbers for the scope span in the source file
    start_line: int
    end_line: int
    # Human-friendly label for this scope, e.g. "Toast (function)" or "<Show>"
    label: str = ""
    variables: Dict[str, VariableDef] = field(default_factory=dict)
    children: List["Scope"] = field(default_factory=list)

class DataFlowAnalyzer:
    def __init__(self):
        self.ts_parser = Parser(TYPESCRIPT_LANGUAGE)
        self.tsx_parser = Parser(TSX_LANGUAGE)
        self.scopes: Dict[str, Scope] = {}
        self.usages: List[VariableUsage] = []
        self.definitions: Dict[str, VariableDef] = {}
        self.current_scope_stack: List[Scope] = []
        # Reuse the rich naming heuristics from TreeSitterAnalyzer so that
        # function scopes and JSX-related constructs get meaningful labels.
        self._ts_helper = TreeSitterAnalyzer()

    def analyze_file(self, file_path: str) -> Dict[str, Any]:
        with open(file_path, 'rb') as f:
            content = f.read()
        
        is_tsx = file_path.endswith('x')
        parser = self.tsx_parser if is_tsx else self.ts_parser
        tree = parser.parse(content)
        
        # Reset state
        self.scopes = {}
        self.usages = []
        self.definitions = {}
        self.current_scope_stack = []

        # Create global scope
        global_scope = Scope(
            id=str(uuid.uuid4()),
            type='global',
            parent_id=None,
            start_line=tree.root_node.start_point.row + 1,
            end_line=tree.root_node.end_point.row + 1,
            label='global',
        )
        self.scopes[global_scope.id] = global_scope
        self.current_scope_stack.append(global_scope)

        self._traverse(tree.root_node)

        graph = self._build_graph()
        graph["path"] = file_path
        return graph

    def _traverse(self, node: Node):
        # Handle Scope Creation
        scope_created = False
        if self._is_scope_boundary(node):
            scope_type = self._get_scope_type(node)
            new_scope = Scope(
                id=str(uuid.uuid4()),
                type=scope_type,
                parent_id=self.current_scope_stack[-1].id,
                start_line=node.start_point.row + 1,
                end_line=node.end_point.row + 1,
                label=self._get_scope_label(node, scope_type),
            )
            self.scopes[new_scope.id] = new_scope
            self.current_scope_stack[-1].children.append(new_scope)
            self.current_scope_stack.append(new_scope)
            scope_created = True

        # Handle Variable Definitions
        self._handle_definitions(node)

        # Handle Variable Usages
        self._handle_usages(node)

        # Recurse
        for child in node.children:
            self._traverse(child)

        # Pop Scope
        if scope_created:
            self.current_scope_stack.pop()

    def _is_scope_boundary(self, node: Node) -> bool:
        # Treat the body of a function as part of the function scope instead of
        # introducing an extra "block" cluster. This keeps function visuals
        # compact (function -> locals/usages) while still using statement blocks
        # for control-flow constructs like `if`, `try` and loops.
        if node.type in {"block", "statement_block"}:
            parent = node.parent
            if parent and parent.type in {
                "function_declaration",
                "function_expression",
                "arrow_function",
                "method_definition",
            }:
                return False

        return node.type in {
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
            "class_declaration",
            "statement_block",
            # Treat each JSX element as its own scope so that attributes and
            # children appear at a deeper nesting level in the data-flow graph.
            "jsx_element",
            "jsx_self_closing_element",
            "for_statement",
            # "try_statement", # Flatten try/catch
            "catch_clause",
            "finally_clause",
            "switch_statement",
            "switch_case",
            "switch_default",
            "while_statement",
            "do_statement",
            # The full `if` statement becomes a scope so we can group its
            # condition and branches together visually.
            "if_statement",
            # Object literals should be scopes so their properties (which may be functions)
            # are grouped together.
            "object",
        }

    def _get_scope_type(self, node: Node) -> str:
        if node.type in {
            'function_declaration',
            'function_expression',
            'arrow_function',
            'method_definition',
        }:
            return 'function'
        if node.type == 'class_declaration':
            return 'class'
        if node.type == 'object':
            return 'object'
        if node.type in {'jsx_element', 'jsx_self_closing_element'}:
            return 'jsx'
        
        if node.type == 'if_statement':
            return 'if'
        if node.type == 'for_statement':
            return 'for'
        if node.type == 'for_statement':
            return 'for'
        # if node.type == 'try_statement':
        #     return 'try'
        if node.type == 'catch_clause':
            return 'catch'
        if node.type == 'finally_clause':
            return 'finally'
        if node.type == 'switch_statement':
            return 'switch'
        if node.type == 'switch_case':
            return 'case'
        if node.type == 'switch_default':
            return 'default'
        if node.type == 'while_statement':
            return 'while'
        if node.type == 'do_statement':
            return 'do'
            
        if node.type == 'block' or node.type == 'statement_block':
            # Check if this block is the body of a structured control-flow construct.
            if node.parent:
                if node.parent.type == 'try_statement':
                    # In tree-sitter-typescript, the body of a try_statement is a statement_block
                    return 'try'
                # In the TS grammar, the primary if-body is a statement_block
                # with parent type 'if_statement' and field 'consequence', while
                # the else-body lives under an 'else_clause' whose parent is the
                # same if_statement.
                if node.parent.type == 'if_statement':
                    consequence = node.parent.child_by_field_name('consequence')
                    if (
                        consequence
                        and consequence.start_byte == node.start_byte
                        and consequence.end_byte == node.end_byte
                    ):
                        return 'if_branch'
                if node.parent.type == 'else_clause' and node.parent.parent and node.parent.parent.type == 'if_statement':
                    return 'else_branch'
            return 'block'

    def _get_scope_label(self, node: Node, scope_type: str) -> str:
        """
        Produce a human-friendly label for scopes.

        For functions we delegate to TreeSitterAnalyzer._get_function_name so
        that anonymous callbacks, JSX handlers, etc. get descriptive names.
        For JSX elements we show the tag name (e.g. "<Show>").
        """
        try:
            if scope_type == 'function':
                name = self._ts_helper._get_function_name(node)
                if name and name != "(anonymous)":
                    return f"{name} (function)"
                return "function"

            if scope_type == 'class':
                name_node = node.child_by_field_name('name')
                if name_node:
                    name = name_node.text.decode('utf-8')
                    return f"{name} (class)"
                return "class"
            
            if scope_type == 'object':
                # Try to find the name from the parent assignment or property
                parent = node.parent
                if parent:
                    # const obj = { ... }
                    if parent.type == 'variable_declarator':
                        name_node = parent.child_by_field_name('name')
                        if name_node:
                            return f"{name_node.text.decode('utf-8')} (object)"
                    
                    # obj = { ... }
                    elif parent.type == 'assignment_expression':
                        left = parent.child_by_field_name('left')
                        if left:
                            return f"{left.text.decode('utf-8')} (object)"
                    
                    # nested: { ... }
                    elif parent.type == 'pair':
                        key = parent.child_by_field_name('key')
                        if key:
                            return f"{key.text.decode('utf-8')} (object)"
                            
                return "object"

            if scope_type == 'jsx':
                tag_name = None
                if node.type == 'jsx_element':
                    # In TSX grammar the opening tag is exposed via the 'open_tag'
                    # field; we then fetch its 'name' field.
                    open_tag = node.child_by_field_name('open_tag')
                    if open_tag:
                        name_node = open_tag.child_by_field_name('name')
                        if name_node:
                            tag_name = name_node.text.decode('utf-8')
                elif node.type == 'jsx_self_closing_element':
                    name_node = node.child_by_field_name('name')
                    if name_node:
                        tag_name = name_node.text.decode('utf-8')

                if tag_name:
                    return f"<{tag_name}>"
                return "JSX"
            
            if scope_type == 'if':
                # Check if it's an else-if (not easily distinguishable in tree-sitter without checking parent)
                # For now, just "if"
                return "if"
            
            if scope_type == 'for':
                return "for"
            
            if scope_type == 'try':
                return "try"

            if scope_type == 'catch':
                return "catch"
            
            if scope_type == 'finally':
                return "finally"
            
            if scope_type == 'switch':
                return "switch"
            
            if scope_type == 'case':
                return "case"
            
            if scope_type == 'default':
                return "default"

            if scope_type == 'if_branch':
                # Represent the body of an `if` as a distinct "then" branch so
                # the outer `if` scope remains the only box labelled "if" for a
                # given `if` statement.
                return "then"

            if scope_type == 'else_branch':
                return "else"
                
            if scope_type == 'while':
                return "while"
                
            if scope_type == 'do':
                return "do"

        except Exception:
            # Naming is best-effort; fall through to a basic label on errors.
            pass

        return scope_type

    def _handle_definitions(self, node: Node):
        # Variable Declarations (var, let, const)
        if node.type == "variable_declarator":
            name_node = node.child_by_field_name("name")
            if name_node:
                # When a variable declarator directly initializes a function
                # (e.g. `const handleClickOutside = (event) => { ... }`) we
                # still record a definition for reference resolution, but we
                # mark it as a "function" so the visual graph can choose not to
                # render an extra variable box next to the function scope.
                value_node = node.child_by_field_name("value")
                is_function_initializer = value_node is not None and value_node.type in {
                    "arrow_function",
                    "function_expression",
                }

                # Simple identifier: const x = ...
                if name_node.type == "identifier":
                    kind = "function" if is_function_initializer else "variable"
                    self._add_definition(name_node, kind)
                else:
                    # Destructured patterns: const [a, b] = ..., const { x, y: z } = ...
                    for ident in self._collect_pattern_identifiers(name_node):
                        self._add_definition(ident, "variable")
        
        # Function Parameters
        if node.type in {'required_parameter', 'optional_parameter'}:
            # Parameters can be simple identifiers or destructured patterns.
            for ident in self._collect_pattern_identifiers(node):
                self._add_definition(ident, 'param')
        
        # Function Declarations (name)
        if node.type == 'function_declaration':
            name_node = node.child_by_field_name('name')
            if name_node:
                # Function name is defined in the PARENT scope, not the function's own scope
                # But we just pushed the function scope. So we need to look at parent.
                # Actually, _traverse pushes scope BEFORE calling _handle_definitions.
                # So current scope is the function scope.
                # We want to define the function name in the ENCLOSING scope.
                self._add_definition(name_node, 'function', scope_offset=-1)

        # Class Declarations
        if node.type == 'class_declaration':
            name_node = node.child_by_field_name('name')
            if name_node:
                self._add_definition(name_node, 'class', scope_offset=-1)

    def _handle_usages(self, node: Node):
        if node.type == 'identifier':
            # Check if this identifier is a definition. If so, skip.
            parent = node.parent
            if parent.type == 'variable_declarator' and parent.child_by_field_name('name') == node:
                return
            if parent.type == 'function_declaration' and parent.child_by_field_name('name') == node:
                return
            if parent.type == 'class_declaration' and parent.child_by_field_name('name') == node:
                return
            if parent.type in {'required_parameter', 'optional_parameter'}:
                return
            if parent.type == 'property_identifier': # e.g. obj.prop - prop is property_identifier, not identifier usually
                return

            # Skip identifiers that participate in binding patterns on the
            # left-hand side of declarations or parameters, such as:
            #   const [a, b] = ...
            #   const { x, y: z } = ...
            #   function fn({ foo, bar }) { ... }
            curr = node
            while curr is not None:
                p = curr.parent
                if p is None:
                    break

                # Destructured variable declarator: the pattern lives under the
                # "name" field of a variable_declarator.
                if p.type == 'variable_declarator':
                    name_node = p.child_by_field_name('name')
                    if name_node:
                        # Walk upward from the identifier until we either hit
                        # the name_node (binding position) or escape the
                        # variable_declarator.
                        check = node
                        while check is not None and check is not p:
                            if check is name_node:
                                return
                            check = check.parent

                # Destructured parameters: any identifier within the parameter
                # subtree is a binding.
                if p.type in {'required_parameter', 'optional_parameter', 'rest_parameter'}:
                    return

                # Stop walking once we reach a clear non-binding boundary such
                # as a statement block, function, or the program root.
                if p.type in {
                    'program',
                    'statement_block',
                    'function_declaration',
                    'function_expression',
                    'arrow_function',
                    'method_definition',
                    'class_declaration',
                }:
                    break

                curr = p
            
            # It's a usage
            self._add_usage(node)

    def _is_jsx_tag_name(self, node: Node) -> bool:
        """
        Check if the node is the name of a JSX opening/closing/self-closing element.
        """
        parent = node.parent
        if not parent:
            return False
        
        # <Tag ...>
        if parent.type == 'jsx_opening_element' and parent.child_by_field_name('name') == node:
            return True
        # </Tag>
        if parent.type == 'jsx_closing_element' and parent.child_by_field_name('name') == node:
            return True
        # <Tag />
        if parent.type == 'jsx_self_closing_element' and parent.child_by_field_name('name') == node:
            return True
            
        return False

    def _get_jsx_attribute_name(self, node: Node) -> Optional[str]:
        """
        Walk up to find if we are inside a jsx_attribute, and if so return its property name.
        """
        curr = node
        while curr:
            if curr.type == 'jsx_attribute':
                # Try field name first
                prop = curr.child_by_field_name('property')
                if prop:
                    return prop.text.decode('utf-8')
                
                # Fallback: look for property_identifier child
                for child in curr.children:
                    if child.type == 'property_identifier':
                        return child.text.decode('utf-8')
                return None

            # Stop if we hit a scope boundary or something that definitely isn't an attribute
            if self._is_scope_boundary(curr):
                break
            curr = curr.parent
        return None

    def _add_definition(self, node: Node, kind: str, scope_offset: int = 0):
        name = node.text.decode('utf-8')
        scope_idx = -1 + scope_offset
        if abs(scope_idx) > len(self.current_scope_stack):
             # Fallback to global if offset is too large (shouldn't happen with correct logic)
             scope = self.current_scope_stack[0]
        else:
            scope = self.current_scope_stack[scope_idx]
        
        def_id = str(uuid.uuid4())
        definition = VariableDef(
            id=def_id,
            name=name,
            kind=kind,
            scope_id=scope.id,
            start_line=node.start_point.row + 1,
            end_line=node.end_point.row + 1
        )
        scope.variables[name] = definition
        self.definitions[def_id] = definition

    def _add_usage(self, node: Node):
        if self._is_jsx_tag_name(node):
            return

        name = node.text.decode('utf-8')
        current_scope = self.current_scope_stack[-1]
        
        # Resolve definition
        def_id = self._resolve_variable(name)
        
        attribute_name = self._get_jsx_attribute_name(node)
        
        usage = VariableUsage(
            id=str(uuid.uuid4()),
            name=name,
            scope_id=current_scope.id,
            def_id=def_id,
            start_line=node.start_point.row + 1,
            end_line=node.end_point.row + 1,
            context='read', # TODO: refine context
            attribute_name=attribute_name
        )
        self.usages.append(usage)

    def _collect_pattern_identifiers(self, node: Node) -> List[Node]:
        """
        Recursively collect identifier-like nodes that represent variable names
        in binding patterns (array/object destructuring, parameter lists, etc.).

        We intentionally limit this to identifier-bearing nodes that are valid
        binding targets so we don't accidentally treat property names in
        non-pattern contexts as definitions.
        """
        identifiers: List[Node] = []

        def walk(n: Node):
            # Plain identifiers and shorthand properties inside patterns.
            if n.type in {"identifier", "shorthand_property_identifier"}:
                identifiers.append(n)
                return

            # Skip over non-pattern contexts where identifiers should not be
            # treated as new bindings.
            if n.type in {
                "member_expression",
                "call_expression",
                "property_identifier",
                "jsx_opening_element",
                "jsx_closing_element",
                "jsx_self_closing_element",
            }:
                return

            for child in n.children:
                walk(child)

        walk(node)
        return identifiers

    def _traverse_if_statement_children(self, node: Node) -> None:
        """
        Custom traversal for `if_statement` nodes.

        We treat the condition expression as its own nested scope (`if_condition`)
        so that identifier usages that participate in the condition can be
        grouped visually at the top of the `if` cluster in the client.
        """
        # At this point (inside _traverse), if this `if_statement` is a scope
        # boundary then the current scope on the stack is the enclosing "if"
        # scope. If not, we simply treat the condition as a child scope of
        # whatever the current scope is.
        condition_node = node.child_by_field_name("condition")

        if condition_node is not None:
            condition_scope = Scope(
                id=str(uuid.uuid4()),
                type="if_condition",
                parent_id=self.current_scope_stack[-1].id,
                start_line=condition_node.start_point.row + 1,
                end_line=condition_node.end_point.row + 1,
                label=self._get_scope_label(condition_node, "if_condition"),
            )
            self.scopes[condition_scope.id] = condition_scope
            self.current_scope_stack[-1].children.append(condition_scope)
            self.current_scope_stack.append(condition_scope)
            # Traverse the condition expression within the dedicated scope so
            # that all identifiers used there are attached to it.
            self._traverse(condition_node)
            self.current_scope_stack.pop()

        # Traverse the remaining children (consequence / alternative) using the
        # normal traversal logic.
        for child in node.children:
            if child is condition_node:
                continue
            self._traverse(child)

    def _resolve_variable(self, name: str) -> Optional[str]:
        # Walk up the scope stack
        for scope in reversed(self.current_scope_stack):
            if name in scope.variables:
                return scope.variables[name].id
        return None

    def _build_graph(self) -> Dict[str, Any]:
        # Convert to ELK JSON format
        # Nodes: Scopes (clusters) and Variables (nodes)
        # Edges: Flow (Def -> Usage)
        #
        # We enrich nodes and edges with 1-based line number metadata so the
        # client can drive inline code previews without having to re-parse.

        elk_edges = []
        
        # Helper to recursively build scope nodes
        def build_scope_node(scope: Scope) -> Dict[str, Any]:
            children: List[Dict[str, Any]] = []

            # First, materialize variables/usages/scopes as separate collections
            # so we can form "declaration" clusters that visually group a
            # left-hand-side variable definition with any immediate RHS usages
            # that live on the same source line (e.g. `const current =
            # visibleColumns();`).
            var_nodes: List[Dict[str, Any]] = []
            for var in scope.variables.values():
                # Function definitions (either declared via `function foo() {}` or
                # created via `const foo = () => {}`) already have a dedicated
                # scope cluster in the graph. Skipping a separate "variable"
                # node for these keeps the visualisation from showing two
                # overlapping boxes for the same logical function.
                if var.kind == "function":
                    continue

                var_nodes.append(
                    {
                        "id": var.id,
                        "labels": [{"text": f"{var.name} ({var.kind})"}],
                        "width": 100,
                        "height": 40,
                        "type": "variable",
                        "startLine": var.start_line,
                        "endLine": var.end_line,
                    }
                )

            child_scope_nodes: List[Dict[str, Any]] = [
                build_scope_node(child_scope) for child_scope in scope.children
            ]

            usage_nodes: List[Dict[str, Any]] = []
            scope_usages = [u for u in self.usages if u.scope_id == scope.id]
            for usage in scope_usages:
                definition = self.definitions.get(usage.def_id) if usage.def_id else None

                # Suppress visual nodes for usages that are effectively part of
                # the same declaration as their defining variable – i.e. when
                # the definition and usage share the same scope and line. This
                # avoids duplicate red boxes for patterns like:
                #   const [value, setValue] = createSignal(value());
                suppress_visual_node = (
                    definition is not None
                    and definition.scope_id == usage.scope_id
                    and definition.start_line == usage.start_line
                )

                if not suppress_visual_node:
                    usage_nodes.append(
                        {
                            "id": usage.id,
                            "labels": [
                                {
                                    "text": f"{usage.attribute_name}: {usage.name}"
                                    if usage.attribute_name
                                    else usage.name
                                }
                            ],
                            "width": 60,
                            "height": 30,
                            "type": "usage",
                            "startLine": usage.start_line,
                            "endLine": usage.end_line,
                        }
                    )

                # Edge from Def to Usage. We attach line metadata for convenience:
                # the "usageStartLine"/"usageEndLine" fields point at the read
                # site (target), while "defStartLine"/"defEndLine" point at the
                # defining declaration (source).
                if usage.def_id:
                    elk_edges.append(
                        {
                            "id": f"edge-{usage.def_id}-{usage.id}",
                            "sources": [usage.def_id],
                            "targets": [usage.id],
                            "defStartLine": definition.start_line if definition else None,
                            "defEndLine": definition.end_line if definition else None,
                            "usageStartLine": usage.start_line,
                            "usageEndLine": usage.end_line,
                        }
                    )

            # Group variables + usages that share the same line into a synthetic
            # "declaration" cluster so statements like `const current =
            # visibleColumns();` show up as a single boxed unit instead of
            # loosely scattered siblings.
            line_buckets: Dict[int, List[Dict[str, Any]]] = {}
            standalone_children: List[Dict[str, Any]] = []

            def _bucket_child(node: Dict[str, Any]) -> None:
                line = node.get("startLine")
                if isinstance(line, int):
                    line_buckets.setdefault(line, []).append(node)
                else:
                    standalone_children.append(node)

            for n in var_nodes:
                _bucket_child(n)
            for n in usage_nodes:
                _bucket_child(n)

            # Turn buckets into either declaration-clusters or individual
            # children, then add the nested scope nodes.
            for line, nodes_on_line in sorted(line_buckets.items()):
                has_var = any(n.get("type") == "variable" for n in nodes_on_line)
                has_usage = any(n.get("type") == "usage" for n in nodes_on_line)

                # Only create a declaration cluster when there's at least one
                # variable and one usage on the same line – this typically
                # corresponds to a declaration with an RHS expression.
                if has_var and has_usage and len(nodes_on_line) >= 2:
                    # Order within the declaration: variables first, then usages.
                    def _inner_sort(node: Dict[str, Any]) -> Any:
                        t = node.get("type")
                        if t == "variable":
                            rank = 0
                        elif t == "usage":
                            rank = 1
                        else:
                            rank = 2
                        return (rank, node.get("id", ""))

                    nodes_on_line.sort(key=_inner_sort)

                    decl_id = f"decl-{scope.id}-{line}"
                    children.append(
                        {
                            "id": decl_id,
                            "labels": [{"text": f"line {line}"}],
                            "type": "declaration",
                            "children": nodes_on_line,
                            "startLine": line,
                            "endLine": line,
                        }
                    )
                else:
                    children.extend(nodes_on_line)

            # Add any nodes that didn't have a stable line association (e.g.
            # scopes without explicit ranges) and the nested child scopes
            # themselves.
            children.extend(standalone_children)
            children.extend(child_scope_nodes)

            # Sort children so that, within a given scope, declarations/variables
            # appear before their dependent usages and everything is roughly
            # ordered by source location.
            def _child_sort_key(child: Dict[str, Any]) -> Any:
                start_line = child.get("startLine")
                t = child.get("type")
                if t in {"declaration"}:
                    type_rank = 0
                elif t == "variable":
                    type_rank = 1
                elif t == "usage":
                    type_rank = 2
                else:
                    type_rank = 3
                line_key = start_line if isinstance(start_line, int) else float("inf")
                return (line_key, type_rank, child.get("id", ""))

            children.sort(key=_child_sort_key)
            
            # Add control flow edges between sibling nodes (e.g. try -> catch)
            for i in range(len(children) - 1):
                curr = children[i]
                next_node = children[i+1]
                curr_type = curr.get("type")
                next_type = next_node.get("type")

                # Try/catch/finally sequences: keep related handlers visually linked.
                if curr_type == "try" and next_type in {"catch", "finally"}:
                    elk_edges.append({
                        "id": f"flow-{curr['id']}-{next_node['id']}",
                        "sources": [curr['id']],
                        "targets": [next_node['id']],
                        "type": "control-flow",
                    })
                if curr_type == "catch" and next_type == "finally":
                    elk_edges.append({
                        "id": f"flow-{curr['id']}-{next_node['id']}",
                        "sources": [curr['id']],
                        "targets": [next_node['id']],
                        "type": "control-flow",
                    })

                # If / else branches: link the primary `then` branch to a sibling
                # `else_branch` if one exists, even if other children such as the
                # `if_condition` scope sit between them in the child list.
                if curr_type == "if_branch":
                    target_else = None
                    for j in range(i + 1, len(children)):
                        candidate = children[j]
                        if candidate.get("type") == "else_branch":
                            target_else = candidate
                            break
                    if target_else is not None:
                        elk_edges.append({
                            "id": f"flow-{curr['id']}-{target_else['id']}",
                            "sources": [curr['id']],
                            "targets": [target_else['id']],
                            "type": "control-flow",
                        })

                # Switch / case / default sequences: link consecutive cases for clarity.
                if scope.type == "switch" and curr_type in {"case", "default"} and next_type in {"case", "default"}:
                    elk_edges.append({
                        "id": f"flow-{curr['id']}-{next_node['id']}",
                        "sources": [curr['id']],
                        "targets": [next_node['id']],
                        "type": "control-flow",
                    })

            return {
                "id": scope.id,
                "labels": [{"text": scope.label or scope.type}],
                "type": scope.type,
                "children": children,
                # Scope line range so the client can, if desired, preview scopes.
                "startLine": scope.start_line,
                "endLine": scope.end_line,
                "params": [v.name for v in scope.variables.values() if v.kind == 'param'],
                "layoutOptions": {
                    "elk.algorithm": "layered",
                    "elk.direction": "DOWN",
                    # Use tighter padding and spacing so nested control-flow
                    # structures (like `if`/`else` clusters) render more
                    # compactly in the client.
                    "elk.padding": "[top=20,left=20,bottom=10,right=10]",
                    "elk.spacing.nodeNode": "16",
                    "elk.layered.spacing.nodeNodeBetweenLayers": "16",
                    "elk.spacing.edgeNode": "8",
                },
            }

        # The root is the one with no parent.
        root = next(s for s in self.scopes.values() if s.parent_id is None)
        
        graph = build_scope_node(root)
        graph["edges"] = elk_edges
        
        return graph
