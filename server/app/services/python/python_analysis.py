import tree_sitter_python as tspython
from tree_sitter import Language, Parser, Node
from typing import List, Tuple

from app.services.analysis_types import FileMetrics, FunctionMetrics

# Load Python grammar
PYTHON_LANGUAGE = Language(tspython.language())

class PythonTreeSitterAnalyzer:
    def __init__(self):
        self.parser = Parser(PYTHON_LANGUAGE)

    def analyze_file(self, file_path: str) -> FileMetrics: # dictionary or FileMetrics? based on other analyzers it returns FileMetrics
        with open(file_path, 'rb') as f:
            content = f.read()

        tree = self.parser.parse(content)
        
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])

        # Extract functions, classes, and other scopes
        functions = self._extract_scopes(tree.root_node)
        import_scope = self._compute_import_scope(tree.root_node, content)
        if import_scope is not None:
            functions.insert(0, import_scope)

        avg_complexity = 0.0
        if functions:
            avg_complexity = sum(f.cyclomatic_complexity for f in functions) / len(functions)

        # Calculate file-level metrics
        comment_lines, todo_count = self._count_comments_and_todos(tree.root_node)
        comment_density = comment_lines / nloc if nloc > 0 else 0.0
        
        max_nesting_depth = self._calculate_max_nesting_depth(tree.root_node)
        classes_count = self._count_classes(tree.root_node)
        
        # New metrics specific to Python or general
        # Replicating TS metrics where applicable
        
        # Aggregate function metrics
        total_function_length = sum(f.nloc for f in functions)
        average_function_length = total_function_length / len(functions) if functions else 0.0
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
            classes_count=classes_count,
            # Initialize other fields to valid defaults
            tsx_nesting_depth=0,
            tsx_render_branching_count=0,
            tsx_react_use_effect_count=0,
            tsx_anonymous_handler_count=0,
            tsx_prop_count=0,
            ts_any_usage_count=0,
            ts_ignore_count=0,
            ts_import_coupling_count=0,
            python_import_count=self._count_imports(tree.root_node),
            tsx_hardcoded_string_volume=0,
            tsx_duplicated_string_count=0,
            ts_type_interface_count=0,
            ts_export_count=0,
            md_data_url_count=0
        )

    def _compute_import_scope(self, root_node: Node, content: bytes) -> FunctionMetrics | None:
        """
        Create a synthetic top-level scope representing import statements.

        - nloc: total LOC occupied by *all* import statements in the file
        - start/end_line: span of the largest contiguous block of imports
        """
        import_spans: List[tuple[int, int]] = []
        lines = content.splitlines()

        def only_blank_lines_between(end_line: int, start_line: int) -> bool:
            if start_line <= end_line + 1:
                return True
            for line_no in range(end_line + 1, start_line):
                idx = line_no - 1
                if 0 <= idx < len(lines):
                    if lines[idx].strip():
                        return False
            return True

        def traverse(n: Node) -> None:
            if n.type in {"import_statement", "import_from_statement"}:
                start_line = n.start_point.row + 1
                end_line = n.end_point.row + 1
                import_spans.append((start_line, end_line))
            for child in n.children:
                traverse(child)

        traverse(root_node)

        if not import_spans:
            return None

        import_spans.sort(key=lambda s: (s[0], s[1]))
        total_import_loc = sum(e - s + 1 for s, e in import_spans)

        blocks: List[tuple[int, int, int]] = []  # (block_start, block_end, block_loc_sum)
        cur_s, cur_e = import_spans[0]
        cur_loc = cur_e - cur_s + 1
        for s, e in import_spans[1:]:
            # Allow blank lines between imports to still count as one contiguous block.
            if only_blank_lines_between(cur_e, s):
                cur_e = max(cur_e, e)
                cur_loc += (e - s + 1)
            else:
                blocks.append((cur_s, cur_e, cur_loc))
                cur_s, cur_e = s, e
                cur_loc = e - s + 1
        blocks.append((cur_s, cur_e, cur_loc))

        block_s, block_e, _ = max(blocks, key=lambda b: (b[2], -b[0]))

        return FunctionMetrics(
            name="(imports)",
            cyclomatic_complexity=0,
            nloc=total_import_loc,
            start_line=block_s,
            end_line=block_e,
            parameter_count=0,
            max_nesting_depth=0,
            comment_lines=0,
            todo_count=0,
            origin_type="imports",
        )

    def _extract_scopes(self, root_node: Node) -> List[FunctionMetrics]:
        # We want to capture:
        # - Functions (def)
        # - Classes (class)
        # - Lambdas (lambda)
        
        scope_types = {
            'function_definition',
            'class_definition',
            'lambda',
            'async_function_definition'
        }

        def process_node(node: Node) -> List[FunctionMetrics]:
            results = []
            for child in node.children:
                if child.type in scope_types:
                    metrics = self._calculate_scope_metrics(child)
                    metrics.children = process_node(child)
                    results.append(metrics)
                else:
                    # Recurse but don't create scope
                    results.extend(process_node(child))
            return results

        return process_node(root_node)

    def _calculate_scope_metrics(self, node: Node) -> FunctionMetrics:
        name = self._get_scope_name(node)
        start_line = node.start_point.row + 1
        end_line = node.end_point.row + 1
        nloc = end_line - start_line + 1
        
        complexity = self._calculate_complexity(node)
        parameter_count = self._count_parameters(node)
        max_nesting_depth = self._calculate_max_nesting_depth(node)
        comment_lines, todo_count = self._count_comments_and_todos(node)

        return FunctionMetrics(
            name=name,
            cyclomatic_complexity=complexity,
            nloc=nloc,
            start_line=start_line,
            end_line=end_line,
            parameter_count=parameter_count,
            max_nesting_depth=max_nesting_depth,
            comment_lines=comment_lines,
            todo_count=todo_count,
            origin_type=node.type
        )

    def _get_scope_name(self, node: Node) -> str:
        if node.type in {'function_definition', 'class_definition', 'async_function_definition'}:
            name_node = node.child_by_field_name('name')
            if name_node:
                prefix = ""
                if node.type == 'class_definition': prefix = "(class) "
                if node.type == 'async_function_definition': prefix = "(async) "
                return f"{prefix}{name_node.text.decode('utf-8')}"
        
        elif node.type == 'lambda':
            return "(lambda)"
            
        return "(anonymous)"

    def _calculate_complexity(self, node: Node) -> int:
        complexity = 1
        complexity_node_types = {
            'if_statement',
            'for_statement',
            'while_statement',
            'except_clause',
            'with_statement', 
            'match_statement',
            'case_pattern'
            # try_statement itself is not usually a branch, except_clauses are
        }
        
        scope_boundary_types = {
            'function_definition',
            'class_definition',
            'lambda',
            'async_function_definition'
        }

        def traverse(n: Node):
            nonlocal complexity
            # Stop if we hit a nested function/class scope (metrics are calculated separately for them)
            if n != node and n.type in scope_boundary_types:
                return
            
            if n.type in complexity_node_types:
                complexity += 1
            
            # Check for boolean operators
            if n.type == 'boolean_operator':
                text = n.text.decode('utf-8')
                if 'and' in text or 'or' in text:
                    complexity += 1
            
            for child in n.children:
                traverse(child)

        traverse(node)
        return complexity

    def _count_comments_and_todos(self, node: Node) -> Tuple[int, int]:
        comment_lines = 0
        todo_count = 0
        
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
            'if_statement', 'for_statement', 'while_statement', 'try_statement', 'with_statement', 'match_statement'
            # function/class are also nesting, but we treat them as scopes usually
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
        def traverse(n: Node):
            nonlocal count
            if n.type == 'class_definition':
                count += 1
            for child in n.children:
                traverse(child)
        traverse(node)
        return count

    def _count_parameters(self, node: Node) -> int:
        # Check for 'parameters' field
        params_node = node.child_by_field_name('parameters') 

        if params_node:
            count = 0
            for child in params_node.children:
                # Filter punctuation
                if child.type in {'identifier', 'typed_parameter', 'default_parameter', 'typed_default_parameter', 'list_splat_pattern', 'dictionary_splat_pattern'}:
                     count += 1
            return count
        return 0

    def _count_imports(self, node: Node) -> int:
        count = 0
        def traverse(n: Node):
            nonlocal count
            if n.type == 'import_statement' or n.type == 'import_from_statement':
                count += 1
            for child in n.children:
                traverse(child)
        traverse(node)
        return count
