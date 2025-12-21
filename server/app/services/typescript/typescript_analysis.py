import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser, Node
from typing import List, Set, Dict

# Load TypeScript and TSX grammars
TYPESCRIPT_LANGUAGE = Language(tstypescript.language_typescript())
TSX_LANGUAGE = Language(tstypescript.language_tsx())

from app.services.analysis_types import FileMetrics, FunctionMetrics

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
        
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])
        
        # Initialize file-level counters
        self._file_comment_lines = 0
        self._file_todo_count = 0
        self._file_classes_count = 0
        self._file_max_nesting_depth = 0
        
        self._file_tsx_nesting_depth = 0
        self._file_tsx_render_branching_count = 0
        self._file_tsx_react_use_effect_count = 0
        self._file_tsx_anonymous_handler_count = 0
        self._file_tsx_prop_count = 0
        self._file_ts_any_usage_count = 0
        self._file_ts_ignore_count = 0 # Handled via comments
        self._file_ts_import_coupling_count = 0
        self._file_tsx_hardcoded_string_volume = 0
        self._file_ts_type_interface_count = 0
        self._file_ts_export_count = 0
        
        self._unique_imports: Set[str] = set()
        self._string_literals: Dict[str, int] = {} # content -> count

        # Run single-pass traversal
        top_level_functions: List[FunctionMetrics] = []
        
        self._scan_tree(tree.root_node, top_level_functions, [], 0, 0)
        
        # Compute derived metrics
        import_scope = self._compute_import_scope(tree.root_node, content)
        if import_scope is not None:
             top_level_functions.insert(0, import_scope)
             
        self._attach_tsx_fragments(top_level_functions)
        
        avg_complexity = 0.0
        if top_level_functions:
            avg_complexity = sum(f.cyclomatic_complexity for f in top_level_functions) / len(top_level_functions)
            
        comment_density = self._file_comment_lines / nloc if nloc > 0 else 0.0
        
        self._file_ts_import_coupling_count = len(self._unique_imports)
        
        duplicated_string_count = sum(1 for count in self._string_literals.values() if count > 1)

        # Aggregate function metrics
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
            tsx_nesting_depth=self._file_tsx_nesting_depth,
            tsx_render_branching_count=self._file_tsx_render_branching_count,
            tsx_react_use_effect_count=self._file_tsx_react_use_effect_count,
            tsx_anonymous_handler_count=self._file_tsx_anonymous_handler_count,
            tsx_prop_count=self._file_tsx_prop_count,
            ts_any_usage_count=self._file_ts_any_usage_count,
            ts_ignore_count=self._file_ts_ignore_count,
            ts_import_coupling_count=self._file_ts_import_coupling_count,
            tsx_hardcoded_string_volume=self._file_tsx_hardcoded_string_volume,
            tsx_duplicated_string_count=duplicated_string_count,
            ts_type_interface_count=self._file_ts_type_interface_count,
            ts_export_count=self._file_ts_export_count,
        )

    def _scan_tree(
        self,
        node: Node,
        parent_list: List[FunctionMetrics],
        active_scopes: List[dict],
        current_nesting: int,
        current_jsx_depth: int
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
            
        elif node_type == 'import_statement':
            # Extract source
            # import ... from 'source'
            source_node = node.child_by_field_name('source')
            if source_node:
                self._unique_imports.add(source_node.text.decode('utf-8'))
        
        elif node_type == 'any': 
            # 'any' type usage
            self._file_ts_any_usage_count += 1
            
        elif node_type == 'jsx_text':
            text = node.text.decode('utf-8').strip()
            if text:
                length = len(text)
                self._file_tsx_hardcoded_string_volume += length
                self._string_literals[text] = self._string_literals.get(text, 0) + 1

        elif node_type == 'string' or node_type == 'string_literal':
            # Check if it's inside a JSX attribute or expression
            parent = node.parent
            if parent and (parent.type == 'jsx_attribute' or parent.type == 'jsx_expression'):
                 text = node.text.decode('utf-8').strip("'\"")
                 if text:
                    length = len(text)
                    self._file_tsx_hardcoded_string_volume += length
                    self._string_literals[text] = self._string_literals.get(text, 0) + 1
                 
        # --- Nesting & Logic ---
        
        is_nesting_node = node_type in {
            'if_statement', 'for_statement', 'for_in_statement', 'for_of_statement',
            'while_statement', 'do_statement', 'switch_statement', 'try_statement', 'catch_clause'
        }
        
        next_nesting = current_nesting
        if is_nesting_node:
            next_nesting += 1
            if next_nesting > self._file_max_nesting_depth:
                self._file_max_nesting_depth = next_nesting

        # --- Comments ---
        if node_type == 'comment':
            lines = (node.end_point.row - node.start_point.row + 1)
            text = node.text.decode('utf-8', errors='ignore')
            
            is_todo = 'TODO' in text or 'FIXME' in text
            is_ts_ignore = '@ts-ignore' in text or '@ts-expect-error' in text
            
            self._file_comment_lines += lines
            if is_todo:
                self._file_todo_count += 1
            if is_ts_ignore:
                self._file_ts_ignore_count += 1
                
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
                current_scope_metrics.cyclomatic_complexity += 1
                if node_type == 'ternary_expression':
                     if active_scopes[-1]['metrics'].is_jsx_container or active_scopes[-1]['metrics'].contains_tsx:
                         self._file_tsx_render_branching_count += 1
                     
            elif node_type == 'binary_expression':
                # Check operator
                op = node.child_by_field_name('operator')
                if op and op.text in {b'&&', b'||', b'??'}:
                     current_scope_metrics.cyclomatic_complexity += 1
                     # Render branching heuristic
                     if (op.text == b'&&' or op.text == b'??') and (active_scopes[-1]['metrics'].is_jsx_container or active_scopes[-1]['metrics'].contains_tsx):
                         self._file_tsx_render_branching_count += 1
                     
            if node_type in {'interface_declaration', 'type_alias_declaration'}:
                current_scope_metrics.ts_type_interface_count += 1

        # --- TSX/JSX Specifics ---
        
        is_jsx_element = node_type in {'jsx_element', 'jsx_self_closing_element', 'jsx_fragment'}
        
        next_jsx_depth = current_jsx_depth
        if is_jsx_element:
            next_jsx_depth += 1
            if next_jsx_depth > self._file_tsx_nesting_depth:
                self._file_tsx_nesting_depth = next_jsx_depth
            
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

        if node_type == 'jsx_attribute':
             self._file_tsx_prop_count += 1
             # Check for anonymous handler
             if self._is_anonymous_handler(node):
                 self._file_tsx_anonymous_handler_count += 1

        if node_type == 'call_expression':
             # useEffect check
             func = node.child_by_field_name('function')
             if func:
                 func_name = func.text.decode('utf-8', errors='ignore')
                 if func_name == 'useEffect' or func_name.endswith('.useEffect'):
                     self._file_tsx_react_use_effect_count += 1
        
        if node_type in {'interface_declaration', 'type_alias_declaration'}:
            self._file_ts_type_interface_count += 1
            
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
            self._scan_tree(child, target_list_for_children, active_scopes, next_nesting, next_jsx_depth)
            
        if scope_created:
            active_scopes.pop()

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

    def _is_anonymous_handler(self, attr_node: Node) -> bool:
        # 1. Check if it looks like an event handler (starts with 'on')
        # name node can be child by field 'name' or just text scan
        name_node = attr_node.child_by_field_name('name')
        if not name_node:
             for child in attr_node.children:
                 if child.type in {'property_identifier', 'jsx_identifier'}:
                     name_node = child
                     break
        
        if not name_node:
            return False
            
        prop_name = name_node.text.decode('utf-8')
        if not prop_name.startswith('on'):
            return False

        # 2. Check value
        value = attr_node.child_by_field_name('value')
        if not value:
             for child in attr_node.children:
                if child.type == 'jsx_expression':
                    value = child
                    break
        
        if not value: return False
        
        if value.type == 'jsx_expression':
            # Check inside
             for child in value.children:
                 if child.type in {'arrow_function', 'function_expression'}:
                     return True
        return False

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

    def extract_imports_exports(self, file_path: str) -> tuple[List[dict], List[dict]]:
        """
        Extracts a list of imported module paths and a list of exported identifiers
        from the given file.
        
        Returns:
            imports: List of dicts { "source": str, "symbols": List[str] }
            exports: List of dicts { "name": str, "type": str }
        """
        with open(file_path, 'rb') as f:
            content = f.read()
        
        is_tsx = file_path.endswith('x')
        parser = self.tsx_parser if is_tsx else self.ts_parser
        tree = parser.parse(content)
        
        imports = self._get_imports(tree.root_node)
        exports = self._get_exports(tree.root_node)
        
        return imports, exports

    def _get_imports(self, node: Node) -> List[dict]:
        imports = []
        
        def traverse(n: Node):
            if n.type == 'import_statement':
                # Check if it is a type-only import: `import type ...`
                # In tree-sitter-typescript, this appears as a 'type' keyword child in the import_statement.
                # We want to ignore these completely for dependency analysis.
                is_type_import = False
                for child in n.children:
                    if child.type == "type" and child.text == b"type":
                        is_type_import = True
                        break
                
                if is_type_import:
                    return

                # import ... from 'source'
                source = n.child_by_field_name('source')
                if source:
                    import_path = source.text.decode('utf-8').strip("'\"")
                    symbols = []
                    
                    # Extract imported symbols
                    clause = n.child_by_field_name('clause')  # import_clause
                    # Newer versions of tree-sitter-typescript don't always expose
                    # the import clause via a 'clause' field; instead we see a
                    # plain 'import_clause' child. Fall back to that shape.
                    if clause is None:
                        for child in n.children:
                            if child.type == "import_clause":
                                clause = child
                                break

                    if clause:
                        # Named imports: import { A, B } from ...
                        named_imports = clause.child_by_field_name('named_imports')
                        if named_imports is None:
                            for child in clause.children:
                                if child.type == "named_imports":
                                    named_imports = child
                                    break

                        if named_imports:
                            for child in named_imports.children:
                                if child.type == 'import_specifier':
                                    name_node = child.child_by_field_name('name')
                                    if name_node:
                                        symbols.append(name_node.text.decode('utf-8'))
                                    else:
                                        # Fallback if alias is used? import { A as B }
                                        pass
                                        
                        # Default import: import A from ...
                        for child in clause.children:
                            if child.type == 'identifier':
                                symbols.append('default')

                    imports.append({"source": import_path, "symbols": symbols})

            elif n.type == 'export_statement':
                # export ... from 'source'
                source = n.child_by_field_name('source')
                if source:
                    import_path = source.text.decode('utf-8').strip("'\"")
                    symbols = []
                    
                    # export { foo } from 'bar'
                    clause = n.child_by_field_name('clause')
                    if clause and clause.type == 'export_clause':
                        for child in clause.children:
                            if child.type == 'export_specifier':
                                name_node = child.child_by_field_name('name')
                                if name_node:
                                    symbols.append(name_node.text.decode('utf-8'))
                    
                    imports.append({"source": import_path, "symbols": symbols})
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return imports

    def _get_exports(self, node: Node) -> List[dict]:
        exports = []

        def traverse(n: Node):
            if n.type == "export_statement":
                # export { foo, bar }
                clause = None
                for child in n.children:
                    if child.type == "export_clause":
                        clause = child
                        break
                
                if clause:
                    for c in clause.children:
                        if c.type == "export_specifier":
                            alias = c.child_by_field_name("alias")
                            name_node = c.child_by_field_name("name")
                            
                            export_name = ""
                            if alias:
                                export_name = alias.text.decode('utf-8')
                            elif name_node:
                                export_name = name_node.text.decode('utf-8')
                            else:
                                export_name = c.text.decode('utf-8')
                            
                            exports.append({"name": export_name, "type": "value"})  # simplified type
                else:
                    # For non-clause export statements we distinguish between
                    # `export default ...` and named declaration exports.
                    has_default = any(
                        child.text.decode("utf-8", errors="ignore") == "default"
                        for child in n.children
                    )

                    if has_default:
                        exports.append({"name": "default", "type": "default"})
                    else:
                        # Named declaration exports:
                        declaration = n.child_by_field_name("declaration")
                        if declaration:
                            if declaration.type in {
                                "function_declaration",
                                "generator_function_declaration",
                                "class_declaration",
                            }:
                                name_node = declaration.child_by_field_name("name")
                                if name_node:
                                    exports.append(
                                        {
                                            "name": name_node.text.decode("utf-8"),
                                            "type": "declaration",
                                        }
                                    )
                            elif declaration.type == "lexical_declaration":
                                # export const foo = ...
                                for child in declaration.children:
                                    if child.type == "variable_declarator":
                                        name_node = child.child_by_field_name("name")
                                        if name_node:
                                            exports.append(
                                                {
                                                    "name": name_node.text.decode(
                                                        "utf-8"
                                                    ),
                                                    "type": "variable",
                                                }
                                            )


            for child in n.children:
                traverse(child)

        traverse(node)
        return exports

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
