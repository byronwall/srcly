import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser, Node
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
import uuid

from app.services.tree_sitter_analysis import TreeSitterAnalyzer

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

        return self._build_graph()

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
        return node.type in {
            'function_declaration',
            'function_expression',
            'arrow_function',
            'method_definition',
            'class_declaration',
            'statement_block',
            # Treat each JSX element as its own scope so that attributes and
            # children appear at a deeper nesting level in the data-flow graph.
            'jsx_element',
            'jsx_self_closing_element',
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
        if node.type in {'jsx_element', 'jsx_self_closing_element'}:
            return 'jsx'
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
        except Exception:
            # Naming is best-effort; fall through to a basic label on errors.
            pass

        return scope_type

    def _handle_definitions(self, node: Node):
        # Variable Declarations (var, let, const)
        if node.type == 'variable_declarator':
            name_node = node.child_by_field_name('name')
            if name_node and name_node.type == 'identifier':
                self._add_definition(name_node, 'variable')
            elif name_node:
                 # It might be an array/object pattern, but for now let's just see if we missed it
                 pass
        
        # Function Parameters
        if node.type in {'required_parameter', 'optional_parameter'}:
            # Check for pattern (destructuring) or simple identifier
            # Simple case: identifier
            for child in node.children:
                if child.type == 'identifier':
                    self._add_definition(child, 'param')
        
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
            
            # It's a usage
            self._add_usage(node)

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
        name = node.text.decode('utf-8')
        current_scope = self.current_scope_stack[-1]
        
        # Resolve definition
        def_id = self._resolve_variable(name)
        
        usage = VariableUsage(
            id=str(uuid.uuid4()),
            name=name,
            scope_id=current_scope.id,
            def_id=def_id,
            start_line=node.start_point.row + 1,
            end_line=node.end_point.row + 1,
            context='read' # TODO: refine context
        )
        self.usages.append(usage)

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
            children = []
            
            # Add variables as nodes
            for var in scope.variables.values():
                children.append({
                    "id": var.id,
                    "labels": [{"text": f"{var.name} ({var.kind})"}],
                    "width": 100,
                    "height": 40,
                    "type": "variable",
                    # Line information for code preview
                    "startLine": var.start_line,
                    "endLine": var.end_line,
                })
            
            # Add child scopes
            for child_scope in scope.children:
                children.append(build_scope_node(child_scope))
                
            # Add usages in this scope
            scope_usages = [u for u in self.usages if u.scope_id == scope.id]
            for usage in scope_usages:
                children.append({
                    "id": usage.id,
                    "labels": [{"text": usage.name}],
                    "width": 60,
                    "height": 30,
                    "type": "usage",
                    # Line information for code preview
                    "startLine": usage.start_line,
                    "endLine": usage.end_line,
                })
                
                # Edge from Def to Usage. We attach line metadata for convenience:
                # the "usageStartLine"/"usageEndLine" fields point at the read
                # site (target), while "defStartLine"/"defEndLine" point at the
                # defining declaration (source).
                if usage.def_id:
                    definition = self.definitions.get(usage.def_id)
                    elk_edges.append({
                        "id": f"edge-{usage.def_id}-{usage.id}",
                        "sources": [usage.def_id],
                        "targets": [usage.id],
                        "defStartLine": definition.start_line if definition else None,
                        "defEndLine": definition.end_line if definition else None,
                        "usageStartLine": usage.start_line,
                        "usageEndLine": usage.end_line,
                    })
            
            return {
                "id": scope.id,
                "labels": [{"text": scope.label or scope.type}],
                "type": scope.type,
                "children": children,
                # Scope line range so the client can, if desired, preview scopes.
                "startLine": scope.start_line,
                "endLine": scope.end_line,
                "layoutOptions": {
                    "elk.algorithm": "layered",
                    "elk.direction": "DOWN",
                    "elk.padding": "[top=20,left=20,bottom=20,right=20]",
                },
            }

        # root_scope = self.scopes[self.current_scope_stack[0].id] # Unused
        # The root is the one with no parent.
        root = next(s for s in self.scopes.values() if s.parent_id is None)
        
        graph = build_scope_node(root)
        graph["edges"] = elk_edges
        
        return graph
