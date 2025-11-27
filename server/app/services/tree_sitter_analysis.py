import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser, Node
from dataclasses import dataclass, field
from typing import List

# Load TypeScript and TSX grammars
TYPESCRIPT_LANGUAGE = Language(tstypescript.language_typescript())
TSX_LANGUAGE = Language(tstypescript.language_tsx())

@dataclass
class FunctionMetrics:
    name: str
    cyclomatic_complexity: int
    nloc: int
    start_line: int
    end_line: int
    parameter_count: int = 0
    max_nesting_depth: int = 0
    comment_lines: int = 0
    todo_count: int = 0
    children: List["FunctionMetrics"] = field(default_factory=list)
    # We store children to represent nested functions.

@dataclass
class FileMetrics:
    nloc: int
    average_cyclomatic_complexity: float
    function_list: List[FunctionMetrics] = field(default_factory=list)
    filename: str = ""
    comment_lines: int = 0
    comment_density: float = 0.0
    max_nesting_depth: int = 0
    average_function_length: float = 0.0
    parameter_count: int = 0
    todo_count: int = 0
    classes_count: int = 0

class TreeSitterAnalyzer:
    def __init__(self):
        self.ts_parser = Parser(TYPESCRIPT_LANGUAGE)
        self.tsx_parser = Parser(TSX_LANGUAGE)

    def analyze_file(self, file_path: str) -> FileMetrics:
        with open(file_path, 'rb') as f:
            content = f.read()
        
        is_tsx = file_path.endswith('x')
        parser = self.tsx_parser if is_tsx else self.ts_parser
        tree = parser.parse(content)
        
        # Calculate total LOC (simple line count for now, or we could filter empty lines)
        # Lizard usually counts non-empty lines.
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])
        
        functions = self._extract_functions(tree.root_node, content)
        
        avg_complexity = 0.0
        if functions:
            avg_complexity = sum(f.cyclomatic_complexity for f in functions) / len(functions)
            
        # Calculate new metrics
        comment_lines, todo_count = self._count_comments_and_todos(tree.root_node, content)
        comment_density = comment_lines / nloc if nloc > 0 else 0.0
        
        max_nesting_depth = self._calculate_max_nesting_depth(tree.root_node)
        
        classes_count = self._count_classes(tree.root_node)
        
        # Aggregate function metrics
        total_function_length = sum(f.nloc for f in functions)
        average_function_length = total_function_length / len(functions) if functions else 0.0
        
        # We need to extract parameter counts. 
        # Since _extract_functions returns FunctionMetrics which doesn't currently have param count,
        # we might need to update FunctionMetrics or calculate it separately.
        # Let's update _extract_functions to also return parameter count if possible, 
        # OR just traverse for it. Traversing again is safer for now to avoid breaking _extract_functions signature too much
        # unless we update FunctionMetrics too. 
        # Actually, let's update FunctionMetrics to include parameter_count, it's cleaner.
        parameter_count = sum(f.parameter_count for f in functions)

        return FileMetrics(
            nloc=nloc,
            average_cyclomatic_complexity=avg_complexity,
            function_list=functions,
            filename=file_path,
            comment_lines=comment_lines,
            comment_density=comment_density,
            max_nesting_depth=max_nesting_depth,
            average_function_length=average_function_length,
            parameter_count=parameter_count,
            todo_count=todo_count,
            classes_count=classes_count
        )

    def _extract_functions(self, root_node: Node, content: bytes) -> List[FunctionMetrics]:
        function_types = {
            'function_declaration',
            'method_definition',
            'arrow_function',
            'function_expression',
            'generator_function',
            'generator_function_declaration'
        }
        
        def process_node(node: Node) -> List[FunctionMetrics]:
            results = []
            # Iterate over children to find functions or recurse
            for child in node.children:
                if child.type in function_types:
                    metrics = self._calculate_function_metrics(child)
                    # Recursively find nested functions inside this function
                    metrics.children = process_node(child)
                    results.append(metrics)
                else:
                    # Not a function, but might contain functions (e.g. Class, Block, IfStatement)
                    results.extend(process_node(child))
            return results

        return process_node(root_node)

    def _calculate_function_metrics(self, func_node: Node) -> FunctionMetrics:
        name = self._get_function_name(func_node)
        start_line = func_node.start_point.row + 1
        end_line = func_node.end_point.row + 1
        
        # LOC for function
        nloc = end_line - start_line + 1
        
        # Complexity
        complexity = self._calculate_complexity(func_node)
        
        # Parameter count
        parameter_count = self._count_parameters(func_node)

        # Calculate new metrics for function
        comment_lines, todo_count = self._count_comments_and_todos(func_node, b"") # Content not needed for simple traversal if we access node.text
        max_nesting_depth = self._calculate_max_nesting_depth(func_node)

        return FunctionMetrics(
            name=name,
            cyclomatic_complexity=complexity,
            nloc=nloc,
            start_line=start_line,
            end_line=end_line,
            parameter_count=parameter_count,
            max_nesting_depth=max_nesting_depth,
            comment_lines=comment_lines,
            todo_count=todo_count
        )

    def _get_function_name(self, node: Node) -> str:
        # Extract name based on node type
        if node.type == 'function_declaration' or node.type == 'generator_function_declaration':
            # Child with field_name 'name'
            name_node = node.child_by_field_name('name')
            if name_node:
                return name_node.text.decode('utf-8')
        elif node.type == 'method_definition':
            name_node = node.child_by_field_name('name')
            if name_node:
                return name_node.text.decode('utf-8')
        elif node.type == 'arrow_function' or node.type == 'function_expression':
            # Often anonymous, but might be assigned to a variable.
            # Tree-sitter doesn't link to the parent variable automatically in a way that gives us the name easily
            # without looking at the parent.
            parent = node.parent
            if parent and parent.type == 'variable_declarator':
                name_node = parent.child_by_field_name('name')
                if name_node:
                    return name_node.text.decode('utf-8')
            elif parent and parent.type == 'assignment_expression':
                left = parent.child_by_field_name('left')
                if left:
                    return left.text.decode('utf-8')
            elif parent and parent.type == 'pair':  # In object literal
                key = parent.child_by_field_name('key')
                if key:
                    return key.text.decode('utf-8')

            # TSX / JSX: function used as a JSX attribute value, e.g.
            # <input onFocus={(e) => { ... }} />
            # The arrow/function expression may be wrapped in nodes like
            # 'parenthesized_expression' and 'jsx_expression' whose ancestor
            # is a 'jsx_attribute' node. Walk up the tree and, if we find such
            # an attribute, use its name.
            current = node
            hops = 0
            while current is not None and hops < 10:
                if current.type == 'jsx_attribute':
                    # Prefer a dedicated 'name' field if present, otherwise fall back to
                    # the first identifier-like child (e.g. 'property_identifier').
                    name_node = current.child_by_field_name('name')
                    if name_node is None:
                        for c in current.children:
                            if c.type in {"property_identifier", "identifier", "jsx_identifier"}:
                                name_node = c
                                break

                    if name_node:
                        return name_node.text.decode('utf-8')
                    break
                if current.type in {'program', 'statement_block'}:
                    break
                current = current.parent
                hops += 1

            # Anonymous function passed as an argument: foo.bar(() => {}) -> bar(ƒ)
            if parent and parent.type == 'arguments':
                grandparent = parent.parent
                if grandparent:
                    if grandparent.type == 'call_expression':
                        func_node = grandparent.child_by_field_name('function')
                        if func_node:
                            if func_node.type == 'member_expression':
                                prop = func_node.child_by_field_name('property')
                                if prop:
                                    return f"{prop.text.decode('utf-8')}(ƒ)"
                            elif func_node.type == 'identifier':
                                return f"{func_node.text.decode('utf-8')}(ƒ)"
                    elif grandparent.type == 'new_expression':
                        constructor = grandparent.child_by_field_name('constructor')
                        if constructor and constructor.type == 'identifier':
                            return f"{constructor.text.decode('utf-8')}(ƒ)"

            # IIFE: (() => { ... })() or (function () { ... })()
            if parent and parent.type == 'parenthesized_expression':
                grandparent = parent.parent
                if grandparent and grandparent.type == 'call_expression':
                    func_node = grandparent.child_by_field_name('function')
                    # In an IIFE the "function" is the parenthesized expression that wraps
                    # our anonymous function.
                    if func_node and func_node == parent:
                        return "IIFE(ƒ)"

            # TSX: Anonymous function as child of a JSX element (e.g. <Show>{() => ...}</Show>)
            # Structure: jsx_element -> jsx_expression -> arrow_function
            # Or: jsx_element -> jsx_expression -> parenthesized_expression -> arrow_function
            current = node
            hops = 0
            while current is not None and hops < 5:
                if current.type == 'jsx_expression':
                    parent = current.parent
                    if parent and parent.type == 'jsx_element':
                        # Get the opening element
                        opening = parent.child_by_field_name('open_tag')
                        if opening:
                            # Get the name of the tag
                            name_node = opening.child_by_field_name('name')
                            if name_node:
                                return f"{name_node.text.decode('utf-8')}(ƒ)"
                    break # Stop if we hit a jsx_expression but it wasn't a direct child of an element (unlikely but safe)
                
                current = current.parent
                hops += 1

        return "(anonymous)"

    def _calculate_complexity(self, node: Node) -> int:
        complexity = 1
        
        complexity_node_types = {
            'if_statement',
            'for_statement',
            'for_in_statement',
            'for_of_statement',
            'while_statement',
            'do_statement',
            'catch_clause',
            'ternary_expression',
        }
        
        # Logical operators
        logical_operators = {'&&', '||', '??'} # ?? (nullish coalescing) is usually not counted in standard cyclomatic complexity, but && and || are.
        
        function_boundary_types = {
            'function_declaration',
            'method_definition',
            'arrow_function',
            'function_expression',
            'generator_function',
            'generator_function_declaration',
            'class_declaration', # Don't count complexity inside nested classes?
            'interface_declaration'
        }

        def traverse(n: Node):
            nonlocal complexity
            
            # Stop if we hit a nested function boundary (but not the root node itself)
            if n != node and n.type in function_boundary_types:
                return

            if n.type in complexity_node_types:
                complexity += 1
            elif n.type == 'binary_expression':
                operator = n.child_by_field_name('operator')
                if operator and operator.text.decode('utf-8') in logical_operators:
                    complexity += 1
            elif n.type == 'switch_case': # case_clause in some grammars, switch_case in others?
                # In tree-sitter-typescript: 'case_clause' and 'default_clause' are children of 'switch_body'
                pass
            elif n.type == 'case_clause':
                complexity += 1
            
            for child in n.children:
                traverse(child)

        traverse(node)
        return complexity

    def _count_comments_and_todos(self, node: Node, content: bytes) -> tuple[int, int]:
        comment_lines = 0
        todo_count = 0
        
        # Tree-sitter often puts comments as 'comment' nodes, but sometimes they are extras.
        # We might need to traverse or query.
        # A simple traversal for 'comment' type nodes works for many languages in tree-sitter.
        
        def traverse(n: Node):
            nonlocal comment_lines, todo_count
            if n.type == 'comment':
                comment_lines += (n.end_point.row - n.start_point.row + 1)
                text = n.text.decode('utf-8', errors='ignore')
                if 'TODO' in text or 'FIXME' in text:
                    todo_count += 1
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return comment_lines, todo_count

    def _calculate_max_nesting_depth(self, node: Node) -> int:
        max_depth = 0
        
        nesting_types = {
            'if_statement',
            'for_statement',
            'for_in_statement',
            'for_of_statement',
            'while_statement',
            'do_statement',
            'switch_statement',
            'try_statement',
            'catch_clause'
        }

        def traverse(n: Node, current_depth: int):
            nonlocal max_depth
            max_depth = max(max_depth, current_depth)
            
            for child in n.children:
                next_depth = current_depth
                if child.type in nesting_types:
                    next_depth += 1
                traverse(child, next_depth)
        
        traverse(node, 0)
        return max_depth

    def _count_classes(self, node: Node) -> int:
        count = 0
        class_types = {'class_declaration', 'class_expression'}
        
        def traverse(n: Node):
            nonlocal count
            if n.type in class_types:
                count += 1
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return count

    def _count_parameters(self, func_node: Node) -> int:
        # This depends on the language grammar.
        # For TS/JS:
        # function_declaration -> formal_parameters -> [required_parameter, optional_parameter, ...]
        # arrow_function -> formal_parameters OR identifier (single param)
        
        params_node = func_node.child_by_field_name('parameters')
        if not params_node:
            # Check if it's an arrow function with a single parameter (identifier)
            if func_node.type == 'arrow_function':
                # If the first child is an identifier and not a parenthesized list, it's a single param
                # But tree-sitter-typescript might wrap it.
                # Let's look for 'formal_parameters' child generally if 'parameters' field isn't set (though it should be)
                pass
        
        if params_node:
            # Count children that are parameters. 
            # In tree-sitter, punctuation like '(' and ',' are also children.
            # We should count named nodes that are not punctuation.
            count = 0
            for child in params_node.children:
                if child.type not in {',', '(', ')', '{', '}'}:
                    count += 1
            return count
            
        # Fallback for arrow function with single param not in parens?
        # In TS grammar, arrow_function parameters are usually in 'formal_parameters' or just a single 'identifier'
        if func_node.type == 'arrow_function':
             # If it has a child that is an identifier and it's the first child...
             # Actually, let's just traverse children and see if we find 'formal_parameters'
             pass

        return 0

