import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser, Node
from typing import List, Set, Dict

# Load TypeScript and TSX grammars
TYPESCRIPT_LANGUAGE = Language(tstypescript.language_typescript())
TSX_LANGUAGE = Language(tstypescript.language_tsx())

from app.services import comment_noise
from app.services.analysis_types import FileMetrics, FunctionMetrics, is_executable_scope, iter_executable_scopes
from app.services.markers import MarkerSink
from app.services.typescript.components import find_components

_COMPLEXITY_NOTES = {
    'if_statement': 'if', 'for_statement': 'for', 'for_in_statement': 'for',
    'for_of_statement': 'for', 'while_statement': 'while', 'do_statement': 'do',
    'catch_clause': 'catch', 'ternary_expression': '?:', 'case_clause': 'case',
}

# Statements only code has, for telling commented-out code from prose.
_TS_CODE_NODES = frozenset({
    'call_expression', 'assignment_expression', 'augmented_assignment_expression',
    'return_statement', 'lexical_declaration', 'variable_declaration', 'import_statement',
    'export_statement', 'if_statement', 'for_statement', 'for_in_statement', 'while_statement',
    'function_declaration', 'class_declaration', 'jsx_element', 'jsx_self_closing_element',
    'await_expression', 'new_expression', 'throw_statement', 'try_statement',
})

# Nesting at or past this depth is marked, so the overlay shows deep code
# rather than every block. Shallower files mark their deepest blocks.
MARKED_NESTING_DEPTH = 3

def _add_decision_point(active_scopes: List[dict]) -> None:
    """Count a branch on the innermost scope and on its enclosing function.

    JSX containers and object literals are display scopes: a ternary inside
    `<div>` belongs to the component's own CCN too, or the component would
    look simpler than it is.
    """
    innermost = active_scopes[-1]['metrics']
    innermost.cyclomatic_complexity += 1
    if is_executable_scope(innermost):
        return
    for scope in reversed(active_scopes[:-1]):
        if is_executable_scope(scope['metrics']):
            scope['metrics'].cyclomatic_complexity += 1
            return


class TreeSitterAnalyzer:
    def __init__(self):
        self.ts_parser = Parser(TYPESCRIPT_LANGUAGE)
        self.tsx_parser = Parser(TSX_LANGUAGE)
        # A MarkerSink records where each metric fires (code viewer overlay).
        self.markers: MarkerSink | None = None

    def analyze_file(self, file_path: str) -> FileMetrics:
        with open(file_path, 'rb') as f:
            content = f.read()
        
        is_tsx = file_path.endswith('x')
        parser = self.tsx_parser if is_tsx else self.ts_parser
        tree = parser.parse(content)
        
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])
        
        # Initialize file-level counters
        self._file_comment_lines = 0
        self._file_todo_count = 0
        self._file_classes_count = 0
        self._file_max_nesting_depth = 0
        
        self._file_ts_any_usage_count = 0
        self._file_ts_ignore_count = 0 # Handled via comments
        self._file_ts_import_coupling_count = 0
        self._file_ts_type_interface_count = 0
        self._file_ts_export_count = 0
        
        self._unique_imports: Set[str] = set()
        self._comments: List[comment_noise.CommentSpan] = []
        # Marker bookkeeping: nesting depth.
        self._nesting_nodes: List[tuple[int, Node]] = []

        # Run single-pass traversal
        top_level_functions: List[FunctionMetrics] = []
        
        self._scan_tree(tree.root_node, top_level_functions, [], 0)
        
        # Compute derived metrics
        import_scope = self._compute_import_scope(tree.root_node, content)
        if import_scope is not None:
             top_level_functions.insert(0, import_scope)
             
        self._attach_tsx_fragments(top_level_functions)
        
        avg_complexity = 0.0
        real_functions = list(iter_executable_scopes(top_level_functions))
        if real_functions:
            avg_complexity = sum(f.cyclomatic_complexity for f in real_functions) / len(real_functions)
            
        self._file_ts_import_coupling_count = len(self._unique_imports)
        
        if self.markers is not None:
            self._mark_post_scan()
        if is_tsx:
            self._attach_components(tree.root_node, top_level_functions)

        # Aggregate function metrics
        total_function_length = sum(f.nloc for f in real_functions)
        average_function_length = total_function_length / len(real_functions) if real_functions else 0.0
        parameter_count = sum(f.parameter_count for f in top_level_functions)

        file_metrics = FileMetrics(
            nloc=nloc,
            average_cyclomatic_complexity=avg_complexity,
            function_list=top_level_functions,
            filename=file_path,
            comment_lines=self._file_comment_lines,
            max_nesting_depth=self._file_max_nesting_depth,
            average_function_length=average_function_length,
            parameter_count=parameter_count,
            todo_count=self._file_todo_count,
            classes_count=self._file_classes_count,
            ts_any_usage_count=self._file_ts_any_usage_count,
            ts_ignore_count=self._file_ts_ignore_count,
            ts_import_coupling_count=self._file_ts_import_coupling_count,
            ts_type_interface_count=self._file_ts_type_interface_count,
            ts_export_count=self._file_ts_export_count,
        )
        self._apply_comment_noise(content, parser, real_functions, file_metrics)
        return file_metrics

    def _apply_comment_noise(self, content: bytes, parser: Parser, functions: List[FunctionMetrics], file_metrics: FileMetrics) -> None:
        lines = content.decode('utf-8', errors='ignore').splitlines()
        kinds = comment_noise.LineKinds(lines, self._comments)
        scopes = []
        for func in functions:
            doc_start, doc_end = comment_noise.leading_comment_block(kinds, func.start_line)
            scopes.append(comment_noise.ScopeSpan(func.start_line, func.end_line, func, doc_start, doc_end))

        def looks_like_code(text: str) -> bool:
            for source in (text, f"function __srcly__() {{\n{text}\n}}"):
                tree = parser.parse(source.encode('utf-8'))
                if not tree.root_node.has_error:
                    return comment_noise.has_code_node(tree.root_node, _TS_CODE_NODES)
            return False

        result = comment_noise.analyze(lines, self._comments, scopes, looks_like_code)
        comment_noise.apply(result, file_metrics, scopes, self.markers)

    def _attach_components(self, root: Node, functions: List[FunctionMetrics]) -> None:
        """Copy component metrics onto the scopes of the components they measure."""
        by_span: Dict[tuple[int, int, str], FunctionMetrics] = {}
        def index(funcs: List[FunctionMetrics]) -> None:
            for f in funcs:
                by_span.setdefault((f.start_line, f.end_line, f.origin_type), f)
                index(f.children)
        index(functions)

        for comp in find_components(root):
            func = by_span.get((comp.start_line, comp.end_line, comp.node.type))
            if func is None:
                continue
            # `const Card = memo(() => ...)`: name the scope after the component.
            if func.name.endswith('(ƒ)') or func.name == '(anonymous)':
                func.name = comp.name
            func.component_loc = comp.loc
            func.component_hook_count = comp.hook_count
            func.component_effect_count = comp.effect_count
            func.component_jsx_depth = comp.jsx_depth
            func.component_prop_count = comp.prop_count
            func.component_inline_handler_count = comp.inline_handler_count
            func.component_jsx_conditional_count = comp.jsx_conditional_count
            for metric, node, note in comp.marks:
                self._mark(metric, node, note)

    def _scan_tree(
        self,
        node: Node,
        parent_list: List[FunctionMetrics],
        active_scopes: List[dict],
        current_nesting: int,
    ):
        """
        Single-pass visitor.
        active_scopes: List of dicts with keys:
           'metrics': FunctionMetrics
           'base_nesting': int (nesting level at start of scope)
           'visiting_jsx_root': Node | None (tracks the first/root TSX node found in this scope)
        """
        node_type = node.type
        
        # --- File Level Metrics ---
        
        if node_type in {'class_declaration', 'class_expression'}:
            self._file_classes_count += 1
            
        elif node_type == 'export_statement' or node_type == 'export_declaration':
            self._file_ts_export_count += 1
            self._mark('ts_export_count', node, 'export')
            
        elif node_type == 'import_statement':
            # Extract source
            # import ... from 'source'
            source_node = node.child_by_field_name('source')
            if source_node:
                self._unique_imports.add(source_node.text.decode('utf-8'))
                self._mark('ts_import_coupling_count', node, source_node.text.decode('utf-8').strip("'\""))
        
        elif node_type == 'any': 
            # 'any' type usage
            self._file_ts_any_usage_count += 1
            self._mark('ts_any_usage_count', node, 'any')
            

        # --- Nesting & Logic ---
        
        is_nesting_node = node_type in {
            'if_statement', 'for_statement', 'for_in_statement', 'for_of_statement',
            'while_statement', 'do_statement', 'switch_statement', 'try_statement', 'catch_clause'
        }
        # `else if` parses as an if_statement inside the previous if's else_clause;
        # it continues the chain at the same depth rather than nesting deeper.
        if node_type == 'if_statement' and node.parent is not None and node.parent.type == 'else_clause':
            is_nesting_node = False

        next_nesting = current_nesting
        if is_nesting_node:
            next_nesting += 1
            if next_nesting > self._file_max_nesting_depth:
                self._file_max_nesting_depth = next_nesting
            if self.markers is not None:
                self._nesting_nodes.append((next_nesting, node))

        # --- Comments ---
        if node_type == 'comment':
            lines = (node.end_point.row - node.start_point.row + 1)
            text = node.text.decode('utf-8', errors='ignore')
            
            is_todo = 'TODO' in text or 'FIXME' in text
            is_ts_ignore = '@ts-ignore' in text or '@ts-expect-error' in text
            
            self._file_comment_lines += lines
            line_text = None
            if text.startswith('//') and not text.startswith('///'):
                line_text = text[2:].removeprefix(' ')
            self._comments.append(comment_noise.CommentSpan(
                node.start_point.row + 1, node.end_point.row + 1, node.start_point.column, line_text
            ))
            if is_todo:
                self._file_todo_count += 1
                self._mark('todo_count', node, 'FIXME' if 'FIXME' in text and 'TODO' not in text else 'TODO')
            if is_ts_ignore:
                self._file_ts_ignore_count += 1
                self._mark('ts_ignore_count', node, '@ts-expect-error' if '@ts-expect-error' in text else '@ts-ignore')
                
            for scope in active_scopes:
                scope['metrics'].comment_lines += lines
                if is_todo:
                    scope['metrics'].todo_count += 1
            
        
        # --- Scope Nesting ---
        if is_nesting_node and active_scopes:
             for scope in active_scopes:
                 depth = next_nesting - scope['base_nesting']
                 if depth > scope['metrics'].max_nesting_depth:
                     scope['metrics'].max_nesting_depth = depth

        # --- Complexity ---
        if active_scopes:
            current_scope_metrics = active_scopes[-1]['metrics']
            
            # Standard Cyclomatic types
            if node_type in {
                'if_statement', 'for_statement', 'for_in_statement', 'for_of_statement',
                'while_statement', 'do_statement', 'catch_clause', 'ternary_expression',
                'case_clause' # Switch cases
            }:
                _add_decision_point(active_scopes)
                self._mark('complexity', node, _COMPLEXITY_NOTES[node_type])
            elif node_type == 'binary_expression':
                # Check operator
                op = node.child_by_field_name('operator')
                if op and op.text in {b'&&', b'||', b'??'}:
                     _add_decision_point(active_scopes)
                     self._mark('complexity', node, op.text.decode())
            if node_type in {'interface_declaration', 'type_alias_declaration'}:
                current_scope_metrics.ts_type_interface_count += 1

        # --- TSX/JSX Specifics ---
        
        is_jsx_element = node_type in {'jsx_element', 'jsx_self_closing_element', 'jsx_fragment'}
        
        if is_jsx_element:
            # Update Current Scope TSX Bounds
            if active_scopes:
                scope_ctx = active_scopes[-1]
                metrics = scope_ctx['metrics']
                
                metrics.contains_tsx = True
                
                s = node.start_point.row + 1
                e = node.end_point.row + 1
                
                if metrics.tsx_start_line == 0 or s < metrics.tsx_start_line:
                    metrics.tsx_start_line = s
                if metrics.tsx_end_line == 0 or e > metrics.tsx_end_line:
                    metrics.tsx_end_line = e
                    
                # Track Root TSX Node
                if scope_ctx['visiting_jsx_root'] is None:
                    scope_ctx['visiting_jsx_root'] = node
                    # Set name
                    if node_type == 'jsx_fragment':
                         metrics.tsx_root_name = "<fragment>"
                         metrics.tsx_root_is_fragment = True
                    else:
                         metrics.tsx_root_name = self._get_function_name(node) # Reusing helper
                         metrics.tsx_root_is_fragment = False

        if node_type in {'interface_declaration', 'type_alias_declaration'}:
            self._file_ts_type_interface_count += 1
            self._mark('ts_type_interface_count', node, 'interface' if node_type == 'interface_declaration' else 'type')
            
        # --- Scope Handling ---
        
        scope_created = False
        target_list_for_children = parent_list
        
        # Check if this node creates a new function/class/container scope
        is_scope = node_type in {
            'function_declaration',
            'method_definition',
            'arrow_function',
            'function_expression',
            'generator_function',
            'generator_function_declaration',
            'class_declaration',
            'interface_declaration',
            'type_alias_declaration',
            'object',
        }
        
        # JSX Element Scope Check
        if node_type in {'jsx_element', 'jsx_self_closing_element'}:
            if self._is_jsx_scope(node):
                is_scope = True
                
        if is_scope:
            new_metrics = self._create_scope_metrics(node)
            parent_list.append(new_metrics)
            if new_metrics.parameter_count:
                count = new_metrics.parameter_count
                self._mark('parameter_count', node, f"{count} param{'s' if count != 1 else ''}")
            
            # Setup new scope context
            new_scope_ctx = {
                'metrics': new_metrics,
                'base_nesting': current_nesting,
                'visiting_jsx_root': None
            }
            active_scopes.append(new_scope_ctx)
            target_list_for_children = new_metrics.children
            scope_created = True
        
        # --- Recurse ---
        for child in node.children:
            self._scan_tree(child, target_list_for_children, active_scopes, next_nesting)
            
        if scope_created:
            active_scopes.pop()

    def _mark(self, metric: str, node: Node, note: str = "", *, span: bool = False) -> None:
        if self.markers is not None:
            self.markers.add(metric, node, note, span=span)

    def _mark_post_scan(self) -> None:
        """Markers that need the whole file: the deepest nesting."""
        threshold = min(MARKED_NESTING_DEPTH, self._file_max_nesting_depth)
        for depth, node in self._nesting_nodes:
            if threshold and depth >= threshold:
                self._mark('max_nesting_depth', node, f"depth {depth}")

    def _create_scope_metrics(self, node: Node) -> FunctionMetrics:
        name = self._get_function_name(node)
        start_line = node.start_point.row + 1
        end_line = node.end_point.row + 1
        nloc = end_line - start_line + 1
        
        parameter_count = self._count_parameters(node)
        
        is_jsx_container = node.type in {'jsx_element', 'jsx_self_closing_element'}

        return FunctionMetrics(
            name=name,
            cyclomatic_complexity=1, # Default base complexity
            nloc=nloc,
            start_line=start_line,
            end_line=end_line,
            parameter_count=parameter_count,
            max_nesting_depth=0, 
            comment_lines=0,
            todo_count=0,
            ts_type_interface_count=0,
            contains_tsx=False,
            tsx_start_line=0,
            tsx_end_line=0,
            tsx_root_name="",
            tsx_root_is_fragment=False,
            origin_type=node.type,
            is_jsx_container=is_jsx_container,
        )

    def _is_jsx_scope(self, node: Node) -> bool:
        # Copied logic: defined if attributes have functions or children are functions
        # Check attributes
        if node.type == 'jsx_element':
            opening = node.child_by_field_name('open_tag')
            if opening:
                for child in opening.children:
                    if child.type == 'jsx_attribute':
                        if self._attribute_defines_function(child):
                            return True
            for child in node.children:
                if child.type == 'jsx_expression':
                    if self._expression_defines_function(child):
                        return True
        
        elif node.type == 'jsx_self_closing_element':
            for child in node.children:
                if child.type == 'jsx_attribute':
                    if self._attribute_defines_function(child):
                        return True
        return False

    def _attribute_defines_function(self, attr_node: Node) -> bool:
        value_node = attr_node.child_by_field_name('value')
        if not value_node:
             for child in attr_node.children:
                if child.type == 'jsx_expression':
                    value_node = child
                    break
        if not value_node: return False
        if value_node.type == 'jsx_expression':
            return self._expression_defines_function(value_node)
        return False

    def _expression_defines_function(self, expr_node: Node) -> bool:
        def has_func(n: Node) -> bool:
            if n.type in {"arrow_function", "function_expression"}:
                return True
            for c in n.children:
                if has_func(c):
                    return True
            return False
        return has_func(expr_node)
        
    def _count_parameters(self, func_node: Node) -> int:
        params_node = func_node.child_by_field_name('parameters')
        if params_node:
            count = 0
            for child in params_node.children:
                if child.type not in {',', '(', ')', '{', '}'}:
                    count += 1
            return count
        return 0

    def _compute_import_scope(self, root_node: Node, content: bytes) -> FunctionMetrics | None:
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
            if n.type == "import_statement":
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
            ts_type_interface_count=0,
            origin_type="imports",
        )

    def _attach_tsx_fragments(self, functions: List[FunctionMetrics]) -> None:
        """
        For each function/container that contains TSX, insert a synthetic
        "<fragment>" child that groups any JSX container scopes beneath it.
        This keeps all TSX scopes listed together under a single top-level
        node per function while still only creating real scopes for actual
        functions/objects/JSX containers.
        """

        def process(func: FunctionMetrics) -> None:
            # Recurse first so nested scopes are processed before their parents.
            for child in func.children:
                process(child)

            # Skip if this scope doesn't contain TSX at all.
            if not getattr(func, "contains_tsx", False):
                return

            # Don't create fragments for pure JSX container scopes or for
            # already-synthetic virtual roots.
            origin = getattr(func, "origin_type", "")
            if origin in {"jsx_element", "jsx_self_closing_element", "jsx_fragment", "jsx_virtual_root"}:
                return

            # Collect direct children that are JSX container scopes.
            jsx_children = [c for c in func.children if getattr(c, "is_jsx_container", False)]

            # Decide what name to use for the synthetic TSX root. By default we
            # keep "<fragment>", but if this function's TSX actually starts with
            # a JSX element (e.g. <div> or <Show>) we prefer that tag name so
            # the scopes view reflects the real top-level TSX structure. We only
            # keep the "fragment" label when the true root is a `<>` fragment.
            tsx_root_name = getattr(func, "tsx_root_name", "") or ""
            tsx_root_is_fragment = getattr(func, "tsx_root_is_fragment", False)

            display_name = "<fragment>"
            if tsx_root_name and not tsx_root_is_fragment:
                display_name = tsx_root_name

            # Determine the span of the TSX region this fragment represents.
            #
            # IMPORTANT: we always anchor the virtual root to the *full* TSX
            # region inside the parent function/container, not just the nested
            # JSX scopes that we chose to promote as individual children.
            #
            # Otherwise, if the only JSX scopes are event-handler containers
            # like `<button onClick={...}>` or `<Item onSelect={...} />`, the
            # virtual root would start on the first such element instead of the
            # actual TSX root line (e.g. the enclosing `<div>`). That makes the
            # scopes view and inline preview appear a few lines “too low” when
            # users click the TSX group node.
            #
            # By using the recorded TSX bounds we ensure that clicking the TSX
            # group always highlights the same top-level TSX region the user
            # sees in the source file.
            tsx_start = getattr(func, "tsx_start_line", 0) or func.start_line
            tsx_end = getattr(func, "tsx_end_line", 0) or func.end_line
            start_line = tsx_start
            end_line = tsx_end

            nloc = max(0, end_line - start_line + 1) if end_line >= start_line else 0

            fragment = FunctionMetrics(
                name=display_name,
                cyclomatic_complexity=0,
                nloc=nloc,
                start_line=start_line,
                end_line=end_line,
                parameter_count=0,
                max_nesting_depth=0,
                comment_lines=0,
                todo_count=0,
                ts_type_interface_count=0,
                contains_tsx=True,
                tsx_start_line=start_line,
                tsx_end_line=end_line,
                 # For virtual roots, propagate/root the TSX name metadata so
                 # nested processing (and UI consumers) can still understand
                 # what this scope represents.
                tsx_root_name=tsx_root_name or display_name,
                tsx_root_is_fragment=tsx_root_is_fragment,
                origin_type="jsx_virtual_root",
                is_jsx_container=True,
            )

            if jsx_children:
                # Move JSX container scopes under the fragment.
                fragment.children = jsx_children
                first_idx = min(func.children.index(c) for c in jsx_children)
                new_children = []
                inserted = False
                for idx, child in enumerate(func.children):
                    if child in jsx_children:
                        if not inserted and idx == first_idx:
                            new_children.append(fragment)
                            inserted = True
                        # Skip moved child
                        continue
                    new_children.append(child)
                if not inserted:
                    new_children.insert(first_idx, fragment)
                func.children = new_children
            else:
                # No JSX container scopes: just prepend the fragment so that
                # TSX content is still represented as a single virtual node.
                func.children.insert(0, fragment)

        for f in functions:
            process(f)


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
        elif node.type == 'class_declaration':
            name_node = node.child_by_field_name('name')
            if name_node:
                return f"{name_node.text.decode('utf-8')} (class)"
            return "class"
        elif node.type == 'interface_declaration':
            name_node = node.child_by_field_name('name')
            if name_node:
                return f"{name_node.text.decode('utf-8')} (interface)"
            return "interface"
        elif node.type == 'type_alias_declaration':
            name_node = node.child_by_field_name('name')
            if name_node:
                return f"{name_node.text.decode('utf-8')} (type)"
            return "type"
        elif node.type == 'object':
            current = node
            hops = 0
            function_boundary_types = {
                'function_declaration', 'method_definition', 'arrow_function',
                'function_expression', 'generator_function', 'generator_function_declaration',
            }
            while current is not None and hops < 12:
                if current.type == 'jsx_attribute':
                    name_node = current.child_by_field_name('name')
                    if name_node is None:
                        for c in current.children:
                            if c.type in {"property_identifier", "identifier", "jsx_identifier"}:
                                name_node = c
                                break
                    if name_node:
                        return f"{name_node.text.decode('utf-8')} (obj)"
                    break
                if current is not node and current.type in function_boundary_types:
                    break
                if current.type in {'program', 'statement_block'}:
                    break
                current = current.parent
                hops += 1

            parent = node.parent
            if parent:
                if parent.type == 'variable_declarator':
                    name_node = parent.child_by_field_name('name')
                    if name_node:
                        return f"{name_node.text.decode('utf-8')} (object)"
                elif parent.type == 'assignment_expression':
                    left = parent.child_by_field_name('left')
                    if left:
                        return f"{left.text.decode('utf-8')} (object)"
                elif parent.type == 'pair':
                    key = parent.child_by_field_name('key')
                    if key:
                        return f"{key.text.decode('utf-8')} (object)"
            return "object"

        elif node.type == 'jsx_element':
            opening = node.child_by_field_name('open_tag')
            if opening:
                name_node = opening.child_by_field_name('name')
                if name_node:
                    return f"<{name_node.text.decode('utf-8')}>"
            return "<div>"
        
        elif node.type == 'jsx_self_closing_element':
            name_node = node.child_by_field_name('name')
            if name_node:
                return f"<{name_node.text.decode('utf-8')} />"
            return "<div />"

        elif node.type == 'arrow_function' or node.type == 'function_expression':
            parent = node.parent
            if parent and parent.type == 'variable_declarator':
                name_node = parent.child_by_field_name('name')
                if name_node:
                    return name_node.text.decode('utf-8')
            elif parent and parent.type == 'assignment_expression':
                left = parent.child_by_field_name('left')
                if left:
                    return left.text.decode('utf-8')
            elif parent and parent.type == 'pair': 
                key = parent.child_by_field_name('key')
                if key:
                    return key.text.decode('utf-8')
            
            # JSX handling
            current = node
            hops = 0
            function_boundary_types = {
                'function_declaration', 'method_definition', 'arrow_function',
                'function_expression', 'generator_function', 'generator_function_declaration',
            }
            while current is not None and hops < 10:
                if current.type == 'jsx_attribute':
                    name_node = current.child_by_field_name('name')
                    if name_node is None:
                        for c in current.children:
                            if c.type in {"property_identifier", "identifier", "jsx_identifier"}:
                                name_node = c
                                break
                    if name_node:
                        return name_node.text.decode('utf-8')
                    break
                if current is not node and current.type in function_boundary_types:
                    break
                if current.type in {'program', 'statement_block'}:
                    break
                current = current.parent
                hops += 1

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
                             
            if parent and parent.type == 'parenthesized_expression':
                grandparent = parent.parent
                if grandparent and grandparent.type == 'call_expression':
                    func_node = grandparent.child_by_field_name('function')
                    if func_node and func_node == parent:
                        return "IIFE(ƒ)"

            # JSX children anonymous function
            current = node
            hops = 0
            while current is not None and hops < 5:
                if current.type == 'jsx_expression':
                    parent = current.parent
                    if parent and parent.type == 'jsx_element':
                         opening = parent.child_by_field_name('open_tag')
                         if opening:
                             name_node = opening.child_by_field_name('name')
                             if name_node:
                                 return f"<{name_node.text.decode('utf-8')}>(ƒ)"
                    break
                current = current.parent
                hops += 1

        return "(anonymous)"