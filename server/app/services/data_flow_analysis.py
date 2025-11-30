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
        if node.type == "if_statement":
            # For `if` statements, we want to treat the condition expression as a
            # first-class child scope so that variables used in the condition
            # (e.g. `containerRef` or `target`) can be grouped visually at the
            # top of the `if` cluster in the data-flow graph.
            self._traverse_if_statement_children(node)
        else:
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
            'for_statement',
            # 'try_statement', # Flatten try/catch
            'catch_clause',
            'finally_clause',
            'switch_statement',
            'switch_case',
            'switch_default',
            'while_statement',
            'do_statement',
            # The full `if` statement becomes a scope so we can group its
            # condition and branches together visually.
            'if_statement',
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

            if scope_type == 'if_condition':
                return "condition"

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
                    "labels": [{"text": f"{usage.attribute_name}: {usage.name}" if usage.attribute_name else usage.name}],
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

                # If / else branches: link then/else blocks that appear as siblings.
                if curr_type == "if_branch" and next_type == "else_branch":
                    elk_edges.append({
                        "id": f"flow-{curr['id']}-{next_node['id']}",
                        "sources": [curr['id']],
                        "targets": [next_node['id']],
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

        # root_scope = self.scopes[self.current_scope_stack[0].id] # Unused
        # The root is the one with no parent.
        root = next(s for s in self.scopes.values() if s.parent_id is None)
        
        graph = build_scope_node(root)
        graph["edges"] = elk_edges
        
        return graph
