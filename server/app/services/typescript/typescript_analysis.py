import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser, Node
from typing import List

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
        
        # Calculate total LOC (simple line count for now, or we could filter empty lines)
        # Lizard usually counts non-empty lines.
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])
        
        functions = self._extract_functions(tree.root_node, content)
        import_scope = self._compute_import_scope(tree.root_node, content)
        if import_scope is not None:
            # Make imports visible as a top-level "scope" in treemap/scopes views.
            functions.insert(0, import_scope)

        # Post-process TSX scopes so that each function containing TSX gets a
        # single virtual root "<fragment>" node that groups all JSX container
        # scopes beneath it. This keeps TSX scopes together without changing
        # when real scopes (functions/objects/JSX containers) are created.
        self._attach_tsx_fragments(functions)
        
        avg_complexity = 0.0
        if functions:
            avg_complexity = sum(f.cyclomatic_complexity for f in functions) / len(functions)
            
        # Calculate new metrics
        comment_lines, todo_count = self._count_comments_and_todos(tree.root_node, content)
        comment_density = comment_lines / nloc if nloc > 0 else 0.0
        
        max_nesting_depth = self._calculate_max_nesting_depth(tree.root_node)
        
        classes_count = self._count_classes(tree.root_node)
        
        # TS/TSX Specific Metrics
        tsx_nesting_depth = self._calculate_jsx_nesting_depth(tree.root_node)
        tsx_render_branching_count = self._count_render_branching(tree.root_node)
        tsx_react_use_effect_count = self._count_use_effects(tree.root_node)
        tsx_anonymous_handler_count = self._count_anonymous_handlers(tree.root_node)
        tsx_prop_count = self._count_props(tree.root_node)
        ts_any_usage_count = self._count_any_usage(tree.root_node)
        ts_ignore_count = self._count_ts_ignore(tree.root_node, content)
        ts_import_coupling_count = self._count_import_coupling(tree.root_node)
        tsx_hardcoded_string_volume, tsx_duplicated_string_count = self._calculate_string_metrics(tree.root_node)
        ts_type_interface_count = self._count_types_and_interfaces(tree.root_node)
        ts_export_count = self._count_exports(tree.root_node)
        
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
            classes_count=classes_count,
            tsx_nesting_depth=tsx_nesting_depth,
            tsx_render_branching_count=tsx_render_branching_count,
            tsx_react_use_effect_count=tsx_react_use_effect_count,
            tsx_anonymous_handler_count=tsx_anonymous_handler_count,
            tsx_prop_count=tsx_prop_count,
            ts_any_usage_count=ts_any_usage_count,
            ts_ignore_count=ts_ignore_count,
            ts_import_coupling_count=ts_import_coupling_count,
            tsx_hardcoded_string_volume=tsx_hardcoded_string_volume,
            tsx_duplicated_string_count=tsx_duplicated_string_count,
            ts_type_interface_count=ts_type_interface_count,
            ts_export_count=ts_export_count,
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
            """
            Returns True if every line strictly between end_line and start_line
            is blank/whitespace-only. Lines are 1-based.
            """
            if start_line <= end_line + 1:
                return True
            # Between (end_line+1) and (start_line-1), inclusive.
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

        # Merge adjacent import statements into contiguous blocks.
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

        # Pick the largest block (by LOC, then by earliest start line for stability).
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

    def _extract_functions(self, root_node: Node, content: bytes) -> List[FunctionMetrics]:
        function_types = {
            'function_declaration',
            'method_definition',
            'arrow_function',
            'function_expression',
            'generator_function',
            'generator_function_declaration',
            # New container types
            'class_declaration',
            'interface_declaration',
            'type_alias_declaration',
            'object', # Object literal
            'jsx_element',
            'jsx_self_closing_element',
        }
        
        def process_node(node: Node) -> List[FunctionMetrics]:
            results = []
            # Iterate over children to find functions or recurse
            for child in node.children:
                if child.type in function_types:
                    # Special handling for JSX elements: only create a scope if they "define functions"
                    if child.type in {'jsx_element', 'jsx_self_closing_element'}:
                        is_scope = self._is_jsx_scope(child)
                        if not is_scope:
                            # Flatten: recurse but don't create a metrics node for this element
                            results.extend(process_node(child))
                            continue

                    metrics = self._calculate_function_metrics(child)
                    # Recursively find nested functions inside this function
                    metrics.children = process_node(child)
                    results.append(metrics)
                else:
                    # Not a function, but might contain functions (e.g. Block, IfStatement)
                    # Note: Class, Interface, Object are now in function_types, so they are handled in the if block
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

        # TS/TSX specific: count type/interface declarations within this function
        ts_type_interface_count = self._count_types_and_interfaces(func_node)

        # TSX structure info for this function / container
        contains_tsx, tsx_start, tsx_end = self._compute_tsx_bounds(func_node)
        tsx_root_name, tsx_root_is_fragment = self._find_tsx_root_name(func_node)
        is_jsx_container = func_node.type in {'jsx_element', 'jsx_self_closing_element'}
        origin_type = func_node.type

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
            todo_count=todo_count,
            ts_type_interface_count=ts_type_interface_count,
            contains_tsx=contains_tsx,
            tsx_start_line=tsx_start,
            tsx_end_line=tsx_end,
            tsx_root_name=tsx_root_name,
            tsx_root_is_fragment=tsx_root_is_fragment,
            origin_type=origin_type,
            is_jsx_container=is_jsx_container,
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
            # TSX / JSX: object literal used inside a JSX attribute expression, e.g.
            #   <TapestryNode class={classy(..., { wireframe: () => ... })} />
            # Prefer naming after the owning attribute: "class (obj)".
            current = node
            hops = 0
            function_boundary_types = {
                'function_declaration',
                'method_definition',
                'arrow_function',
                'function_expression',
                'generator_function',
                'generator_function_declaration',
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

                # Don't cross into a nested function/container; if the object literal
                # is inside a callback, it should be named by its local context instead.
                if current is not node and current.type in function_boundary_types:
                    break
                if current.type in {'program', 'statement_block'}:
                    break
                current = current.parent
                hops += 1

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

        elif node.type == 'jsx_element':
            opening = node.child_by_field_name('open_tag')
            if opening:
                name_node = opening.child_by_field_name('name')
                if name_node:
                    return f"<{name_node.text.decode('utf-8')}>"
            return "<div>" # Fallback
        
        elif node.type == 'jsx_self_closing_element':
            name_node = node.child_by_field_name('name')
            if name_node:
                return f"<{name_node.text.decode('utf-8')} />"
            return "<div />"

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
            # an attribute, use its name – but **do not** cross another
            # function boundary so that nested callbacks inside the handler
            # body don't also inherit the JSX attribute name.
            current = node
            hops = 0
            function_boundary_types = {
                'function_declaration',
                'method_definition',
                'arrow_function',
                'function_expression',
                'generator_function',
                'generator_function_declaration',
            }
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

                # Stop climbing once we leave the *current* function. This
                # prevents inner callbacks like `run((ch) => { ... })` from
                # being named after the outer JSX attribute such as `onChange`.
                if current is not node and current.type in function_boundary_types:
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
                                return f"<{name_node.text.decode('utf-8')}>(ƒ)"
                    break # Stop if we hit a jsx_expression but it wasn't a direct child of an element (unlikely but safe)
                
                current = current.parent
                hops += 1

        return "(anonymous)"

    def _is_jsx_scope(self, node: Node) -> bool:
        """
        Determines if a JSX element should be a scope.
        It is a scope if it has any attributes that define functions (inline functions),
        or if it has children that are inline functions (e.g. {() => ...}).
        """
        # Check attributes
        if node.type == 'jsx_element':
            opening = node.child_by_field_name('open_tag')
            if opening:
                for child in opening.children:
                    if child.type == 'jsx_attribute':
                        if self._attribute_defines_function(child):
                            return True
            
            # Check children (body)
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
            # Fallback: look for jsx_expression in children
            for child in attr_node.children:
                if child.type == 'jsx_expression':
                    value_node = child
                    break
        
        if not value_node:
            return False
        
        if value_node.type == 'jsx_expression':
            return self._expression_defines_function(value_node)
        
        return False

    def _expression_defines_function(self, expr_node: Node) -> bool:
        # Check if the expression contains an inline function definition
        # It might be wrapped in parenthesized_expression, and it may be nested
        # inside other expressions (e.g. call arguments, object literals) like:
        #   class={classy(..., { wireframe: () => ... })}
        
        def has_func(n: Node) -> bool:
            if n.type in {"arrow_function", "function_expression"}:
                return True
            for c in n.children:
                if has_func(c):
                    return True
            return False

        return has_func(expr_node)

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

    def _find_tsx_root_name(self, node: Node) -> tuple[str, bool]:
        """
        Find the first (top-most in source order) TSX node within the given
        subtree and derive a human-friendly display name for it.

        Returns:
            (name, is_fragment)
        """
        root_tsx_node: Node | None = None

        def is_before(a: Node, b: Node) -> bool:
            if a.start_point.row != b.start_point.row:
                return a.start_point.row < b.start_point.row
            return a.start_point.column < b.start_point.column

        # Mirror the notion of a “function boundary” used in other visitors so
        # that TSX inside nested functions (e.g. inner helpers that return
        # `<Show>`) does not accidentally become the “root” TSX node for the
        # parent component’s virtual TSX group.
        function_boundary_types = {
            "function_declaration",
            "method_definition",
            "arrow_function",
            "function_expression",
            "generator_function",
            "generator_function_declaration",
        }

        def traverse(n: Node):
            nonlocal root_tsx_node

            # Do not walk into nested functions when computing the TSX root
            # for this container; those functions will compute their own TSX
            # roots independently.
            if n is not node and n.type in function_boundary_types:
                return

            if n.type in {'jsx_element', 'jsx_self_closing_element', 'jsx_fragment'}:
                if root_tsx_node is None or is_before(n, root_tsx_node):
                    root_tsx_node = n
            for child in n.children:
                traverse(child)

        traverse(node)

        if root_tsx_node is None:
            return "", False

        if root_tsx_node.type == 'jsx_fragment':
            # This corresponds to a real `<>...</>` fragment.
            return "<fragment>", True

        # Delegate to the existing JSX naming logic so tags like <Show> or <Item />
        # are rendered consistently.
        return self._get_function_name(root_tsx_node), False

    def _compute_tsx_bounds(self, node: Node) -> tuple[bool, int, int]:
        """
        For a given function/container node, determine whether it contains any
        TSX/JSX elements and, if so, return the min/max line span that
        encloses all such elements within that function.
        """
        has_tsx = False
        start_line: int | None = None
        end_line: int | None = None

        # Mirror the notion of a “function boundary” used in other visitors so
        # that TSX in *nested* functions doesn’t accidentally extend the TSX
        # range of the parent container. Each function/arrow gets its own
        # `_compute_tsx_bounds` call, so we only want to consider TSX nodes that
        # actually belong to this node’s body.
        function_boundary_types = {
            "function_declaration",
            "method_definition",
            "arrow_function",
            "function_expression",
            "generator_function",
            "generator_function_declaration",
        }

        def traverse(n: Node):
            nonlocal has_tsx, start_line, end_line

            # Don’t walk into nested functions when computing bounds for the
            # current one – they will get their own TSX ranges.
            if n is not node and n.type in function_boundary_types:
                return

            if n.type in {'jsx_element', 'jsx_self_closing_element', 'jsx_fragment'}:
                has_tsx = True
                s = n.start_point.row + 1
                e = n.end_point.row + 1
                if start_line is None or s < start_line:
                    start_line = s
                if end_line is None or e > end_line:
                    end_line = e
            for child in n.children:
                traverse(child)

        traverse(node)
        if not has_tsx:
            return False, 0, 0
        return True, start_line or 0, end_line or 0

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

    def _calculate_jsx_nesting_depth(self, node: Node) -> int:
        max_depth = 0
        
        def traverse(n: Node, current_depth: int):
            nonlocal max_depth
            if n.type == 'jsx_element' or n.type == 'jsx_self_closing_element':
                current_depth += 1
                max_depth = max(max_depth, current_depth)
            
            for child in n.children:
                traverse(child, current_depth)
                
        traverse(node, 0)
        return max_depth

    def _count_render_branching(self, node: Node) -> int:
        count = 0
        
        def traverse(n: Node):
            nonlocal count
            # Check for ternaries or logical && inside JSX expressions
            if n.type == 'jsx_expression':
                # Check children for ternary or binary expression
                for child in n.children:
                    if child.type == 'ternary_expression':
                        count += 1
                    elif child.type == 'binary_expression':
                        operator = child.child_by_field_name('operator')
                        if operator and operator.text.decode('utf-8') == '&&':
                            count += 1
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return count

    def _count_use_effects(self, node: Node) -> int:
        count = 0
        
        def traverse(n: Node):
            nonlocal count
            if n.type == 'call_expression':
                function_node = n.child_by_field_name('function')
                if function_node:
                    name = function_node.text.decode('utf-8')
                    if name == 'useEffect' or name.endswith('.useEffect'):
                        count += 1
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return count

    def _count_anonymous_handlers(self, node: Node) -> int:
        count = 0
        
        def traverse(n: Node):
            nonlocal count
            if n.type == 'jsx_attribute':
                # Check if it's an event handler (starts with 'on')
                name_node = n.child_by_field_name('name')
                if not name_node:
                    # Fallback: find first identifier-like child
                    for child in n.children:
                        if child.type in {'property_identifier', 'jsx_identifier'}:
                            name_node = child
                            break
                
                if name_node:
                    prop_name = name_node.text.decode('utf-8')
                    if prop_name.startswith('on'):
                        # Check value
                        value_node = n.child_by_field_name('value')
                        if not value_node:
                            # Fallback: find jsx_expression child
                            for child in n.children:
                                if child.type == 'jsx_expression':
                                    value_node = child
                                    break
                        
                        if value_node and value_node.type == 'jsx_expression':
                            # Check if the expression contains an inline function
                            for child in value_node.children:
                                if child.type in {'arrow_function', 'function_expression'}:
                                    count += 1
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return count

    def _count_props(self, node: Node) -> int:
        # Count of props passed to JSX elements.
        count = 0
        
        def traverse(n: Node):
            nonlocal count
            if n.type == 'jsx_attribute':
                count += 1
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return count

    def _count_any_usage(self, node: Node) -> int:
        count = 0
        
        def traverse(n: Node):
            nonlocal count
            # Tree-sitter TypeScript represents `any` as a predefined type in most
            # contexts (e.g. `predefined_type` with text "any"), but some versions
            # may also expose a dedicated `any_keyword` node type. To be robust
            # across grammar variants, treat both shapes as valid `any` usages.
            if n.type in {'any_keyword', 'predefined_type'}:
                text = n.text.decode('utf-8', errors='ignore')
                if text == 'any':
                    count += 1
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return count

    def _count_ts_ignore(self, node: Node, content: bytes) -> int:
        # These are usually comments.
        count = 0
        
        # We can scan the content or traverse comments if they are in the tree.
        # Scanning content is safer for comments.
        text = content.decode('utf-8', errors='ignore')
        count += text.count('@ts-ignore')
        count += text.count('@ts-expect-error')
        
        return count

    def _count_import_coupling(self, node: Node) -> int:
        unique_imports = set()
        
        def traverse(n: Node):
            if n.type == 'import_statement':
                # import ... from 'source'
                source = n.child_by_field_name('source')
                if source:
                    # source is a string literal, remove quotes
                    import_path = source.text.decode('utf-8').strip("'\"")
                    unique_imports.add(import_path)
            
            for child in n.children:
                traverse(child)
                
        traverse(node)
        return len(unique_imports)

    def _count_types_and_interfaces(self, node: Node) -> int:
        """
        Count the number of TypeScript type aliases and interfaces declared
        within the given subtree.
        """
        count = 0

        def traverse(n: Node):
            nonlocal count
            if n.type in {"type_alias_declaration", "interface_declaration"}:
                count += 1
            for child in n.children:
                traverse(child)

        traverse(node)
        return count

    def _count_exports(self, node: Node) -> int:
        """
        Count the number of exports in a file. For `export { foo, bar }` we
        count individual specifiers; for `export default ...` and other forms
        we count the statement as a single export.
        """
        count = 0

        def traverse(n: Node):
            nonlocal count
            if n.type == "export_statement":
                # tree-sitter-typescript represents `export { foo, bar }` via an
                # export_clause child that contains export_specifier nodes.
                clause = n.child_by_field_name("clause")
                if clause and clause.type == "export_clause":
                    specifiers = [
                        c for c in clause.children if c.type == "export_specifier"
                    ]
                    if specifiers:
                        count += len(specifiers)
                    else:
                        count += 1
                else:
                    # export default ..., export = ..., etc.
                    count += 1

            for child in n.children:
                traverse(child)

        traverse(node)
        return count

    def _calculate_string_metrics(self, node: Node) -> tuple[int, int]:
        hardcoded_string_volume = 0
        string_counts = {}
        
        def traverse(n: Node):
            nonlocal hardcoded_string_volume
            # Check for JSX text or string literals inside JSX
            if n.type == 'jsx_text':
                text = n.text.decode('utf-8').strip()
                if text:
                    length = len(text)
                    hardcoded_string_volume += length
                    string_counts[text] = string_counts.get(text, 0) + 1
            elif n.type == 'string_literal' or n.type == 'string':
                # Check if it's inside a JSX attribute or expression
                parent = n.parent
                if parent and (parent.type == 'jsx_attribute' or parent.type == 'jsx_expression'):
                     text = n.text.decode('utf-8').strip("'\"")
                     if text:
                        length = len(text)
                        hardcoded_string_volume += length
                        string_counts[text] = string_counts.get(text, 0) + 1

            for child in n.children:
                traverse(child)
                
        traverse(node)
        
        duplicated_string_count = sum(1 for count in string_counts.values() if count > 1)
        
        return hardcoded_string_volume, duplicated_string_count

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
                                        # child children: name, "as", alias
                                        # We want the original name if possible to link to export, 
                                        # but usually we want the local name for usage. 
                                        # For dependency linking, we want the IMPORTED name (the one exported by the other file).
                                        # In `import { A as B }`, 'A' is the name in the source.
                                        
                                        # Tree-sitter structure for `import { A as B }`:
                                        # import_specifier -> name: (identifier "A"), alias: (identifier "B")
                                        
                                        # If we just have `import { A }`:
                                        # import_specifier -> name: (identifier "A")
                                        
                                        # So we always want 'name'.
                                        
                                        # Let's check children manually if child_by_field_name fails (it shouldn't)
                                        pass
                                        
                        # Default import: import A from ...
                        # In tree-sitter-typescript the import_clause children look like:
                        #   - identifier (default import)
                        #   - named_imports (optional)
                        # For named-only imports (`import { A } from ...`) there is
                        # only a `named_imports` child and no bare identifier.
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

                    # `export default ...` – we represent this solely as a single
                    # default export, even if the underlying declaration has a
                    # name (e.g. `export default function Explorer() {}`).
                    # In ES modules that declaration name is local-only and does
                    # not create a separate named export, so modelling it as a
                    # second export is misleading in the dependency graph.
                    if has_default:
                        exports.append({"name": "default", "type": "default"})
                    else:
                        # Named declaration exports:
                        #   export const foo = ...
                        #   export function bar() ...
                        #   export class Baz ...
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

