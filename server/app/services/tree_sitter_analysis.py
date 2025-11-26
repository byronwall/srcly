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
    children: List["FunctionMetrics"] = field(default_factory=list)
    # We store children to represent nested functions.

@dataclass
class FileMetrics:
    nloc: int
    average_cyclomatic_complexity: float
    function_list: List[FunctionMetrics] = field(default_factory=list)
    filename: str = ""

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
            
        return FileMetrics(
            nloc=nloc,
            average_cyclomatic_complexity=avg_complexity,
            function_list=functions,
            filename=file_path
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
        
        return FunctionMetrics(
            name=name,
            cyclomatic_complexity=complexity,
            nloc=nloc,
            start_line=start_line,
            end_line=end_line
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
            elif parent and parent.type == 'pair': # In object literal
                key = parent.child_by_field_name('key')
                if key:
                    return key.text.decode('utf-8')
                    
            return "(anonymous)"
            
        return "(unknown)"

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
