import tree_sitter_python as tspython
from tree_sitter import Language, Parser, Node
from typing import List

from app.services.analysis_types import FileMetrics, FunctionMetrics

# Load Python grammar
PYTHON_LANGUAGE = Language(tspython.language())

class PythonTreeSitterAnalyzer:
    def __init__(self):
        self.parser = Parser(PYTHON_LANGUAGE)

    def analyze_file(self, file_path: str) -> FileMetrics:
        with open(file_path, 'rb') as f:
            content = f.read()

        tree = self.parser.parse(content)
        
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])

        # Initialize file-level counters
        self._file_comment_lines = 0
        self._file_todo_count = 0
        self._file_classes_count = 0
        self._file_python_import_count = 0
        self._file_max_nesting_depth = 0

        # Run single-pass traversal
        top_level_functions = []
        self._scan_tree(tree.root_node, top_level_functions, [], 0)
        
        # Calculate imports separately (logic is distinct and fast enough to keep separate/clean)
        import_scope = self._compute_import_scope(tree.root_node, content)
        if import_scope is not None:
             top_level_functions.insert(0, import_scope)

        # Average complexity (top-level only, matching original behavior)
        avg_complexity = 0.0
        if top_level_functions:
            avg_complexity = sum(f.cyclomatic_complexity for f in top_level_functions) / len(top_level_functions)
            
        # File level comment density
        comment_density = self._file_comment_lines / nloc if nloc > 0 else 0.0

        # Aggregate function metrics for file summary
        # Note: Previous implementation calculated avg function length based on top-level functions?
        # "total_function_length = sum(f.nloc for f in functions)"
        # Yes, purely top-level iteration.
        total_function_length = sum(f.nloc for f in top_level_functions)
        average_function_length = total_function_length / len(top_level_functions) if top_level_functions else 0.0
        parameter_count = sum(f.parameter_count for f in top_level_functions)

        return FileMetrics(
            nloc=nloc,
            average_cyclomatic_complexity=avg_complexity,
            function_list=top_level_functions,
            filename=file_path,
            comment_lines=self._file_comment_lines,
            comment_density=comment_density,
            max_nesting_depth=self._file_max_nesting_depth,
            average_function_length=average_function_length,
            parameter_count=parameter_count,
            todo_count=self._file_todo_count,
            classes_count=self._file_classes_count,
            # Initialize other fields to valid defaults
            tsx_nesting_depth=0,
            tsx_render_branching_count=0,
            tsx_react_use_effect_count=0,
            tsx_anonymous_handler_count=0,
            tsx_prop_count=0,
            ts_any_usage_count=0,
            ts_ignore_count=0,
            ts_import_coupling_count=0,
            python_import_count=self._file_python_import_count,
            tsx_hardcoded_string_volume=0,
            tsx_duplicated_string_count=0,
            ts_type_interface_count=0,
            ts_export_count=0,
            md_data_url_count=0
        )

    def _scan_tree(
        self, 
        node: Node, 
        parent_list: List[FunctionMetrics], 
        active_scopes: List[dict], 
        current_nesting: int
    ):
        """
        Single-pass visitor to collect metrics.
        
        parent_list: List to append new FunctionMetrics to (children of parent scope or top level).
        active_scopes: Stack of dicts: {'metrics': FunctionMetrics, 'base_nesting': int}
        current_nesting: Current nesting depth relative to file root.
        """
        
        node_type = node.type
        
        # 1. Update File Metrics
        if node_type == 'class_definition':
            self._file_classes_count += 1
        elif node_type in {'import_statement', 'import_from_statement'}:
            self._file_python_import_count += 1
            
        # 2. Check Nesting Depth for File
        # File max nesting is just max of current_nesting encountered
        # Wait, if we are at 'if' (nesting), current_nesting is passed as incremented.
        # But we need to record it.
        # Actually, let's track max seen.
        is_nesting_node = node_type in {
            'if_statement', 'for_statement', 'while_statement', 'try_statement', 
            'with_statement', 'match_statement'
        }
        
        # Update nesting for next recursion
        next_nesting = current_nesting
        if is_nesting_node:
            next_nesting += 1

        if next_nesting > self._file_max_nesting_depth:
            self._file_max_nesting_depth = next_nesting

        # 3. Update Active Scopes (Nesting & Comments)
        if node_type == 'comment':
            lines = (node.end_point.row - node.start_point.row + 1)
            text = node.text.decode('utf-8', errors='ignore')
            is_todo = 'TODO' in text or 'FIXME' in text
            
            self._file_comment_lines += lines
            if is_todo:
                self._file_todo_count += 1
                
            for scope in active_scopes:
                scope['metrics'].comment_lines += lines
                if is_todo:
                    scope['metrics'].todo_count += 1
        
        # Update Max Nesting for Scopes
        if is_nesting_node:
             for scope in active_scopes:
                 # Depth relative to where the scope started
                 depth = next_nesting - scope['base_nesting']
                 if depth > scope['metrics'].max_nesting_depth:
                     scope['metrics'].max_nesting_depth = depth

        # 4. Complexity (Applies to immediate scope only)
        # Complexity types
        if active_scopes:
            current_scope = active_scopes[-1]['metrics']
            if node_type in {
                'if_statement', 'for_statement', 'while_statement', 'except_clause',
                'with_statement', 'match_statement', 'case_pattern'
            }:
                current_scope.cyclomatic_complexity += 1
            elif node_type == 'boolean_operator':
                # Check text for 'and'/'or'
                # Optimization: check text content
                text = node.text.decode('utf-8')
                if 'and' in text or 'or' in text:
                     current_scope.cyclomatic_complexity += 1
        
        # 5. Handle Scope Creation
        scope_created = False
        target_list_for_children = parent_list
        
        # Define scope types
        is_scope = node_type in {
            'function_definition',
            'class_definition',
            'lambda',
            'async_function_definition'
        }
        
        if is_scope:
            new_metrics = self._create_scope_metrics(node)
            parent_list.append(new_metrics)
            
            # Function complexity default is 1
            new_metrics.cyclomatic_complexity = 1
            
            new_scope_ctx = {
                'metrics': new_metrics,
                'base_nesting': current_nesting 
                # Note: 'base_nesting' is the ambient nesting level AT the function definition.
                # Content inside will start contributing to depth from there.
            }
            active_scopes.append(new_scope_ctx)
            target_list_for_children = new_metrics.children
            scope_created = True

        # Recurse
        for child in node.children:
            # Optimization: If we just created a scope, we are passing its children list.
            # But we must treat the child as children of the node.
            # The 'target_list_for_children' is where the child's *scopes* should act effectively.
            # Wait, `scan_tree` adds *scopes* to `parent_list`.
            # If `child` is an `if_statement` (not a scope), it shouldn't be added to `parent_list`.
            # `scan_tree` ONLY appends to `parent_list` IF `is_scope` is true.
            # So passing `target_list_for_children` is safe.
            self._scan_tree(child, target_list_for_children, active_scopes, next_nesting)

        if scope_created:
            active_scopes.pop()

    def _create_scope_metrics(self, node: Node) -> FunctionMetrics:
        name = self._get_scope_name(node)
        start_line = node.start_point.row + 1
        end_line = node.end_point.row + 1
        nloc = end_line - start_line + 1
        
        # Parameter count is fast enough to compute locally
        parameter_count = self._count_parameters(node)

        return FunctionMetrics(
            name=name,
            cyclomatic_complexity=0, # Will be accumulated
            nloc=nloc,
            start_line=start_line,
            end_line=end_line,
            parameter_count=parameter_count,
            max_nesting_depth=0, # Will be accumulated
            comment_lines=0, # Will be accumulated
            todo_count=0, # Will be accumulated
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

    def _count_parameters(self, node: Node) -> int:
        params_node = node.child_by_field_name('parameters') 
        if params_node:
            count = 0
            for child in params_node.children:
                if child.type in {'identifier', 'typed_parameter', 'default_parameter', 'typed_default_parameter', 'list_splat_pattern', 'dictionary_splat_pattern'}:
                     count += 1
            return count
        return 0

    def _compute_import_scope(self, root_node: Node, content: bytes) -> FunctionMetrics | None:
        """
        Create a synthetic top-level scope representing import statements.
        Kept separate as it requires specific logic for contiguous block merging.
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

        blocks: List[tuple[int, int, int]] = []
        cur_s, cur_e = import_spans[0]
        cur_loc = cur_e - cur_s + 1
        for s, e in import_spans[1:]:
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
