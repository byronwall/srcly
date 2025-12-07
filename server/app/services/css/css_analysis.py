import re
from typing import List

import tree_sitter_css as tscss
import tree_sitter_scss as tsscss
from tree_sitter import Language, Node, Parser

from app.services.analysis_types import FileMetrics, FunctionMetrics


CSS_LANGUAGE = Language(tscss.language())
SCSS_LANGUAGE = Language(tsscss.language())


class CssTreeSitterAnalyzer:
    """
    Analyze CSS and SCSS files using tree-sitter and emit a hierarchy of
    "scopes" compatible with the existing FunctionMetrics / FileMetrics
    pipeline.

    Goals:
      - For CSS: treat each rule / at-rule block as a scope.
      - For SCSS: in addition to CSS rules, create scopes for:
          - nested rules (selectors inside selectors / at-rules)
          - mixin definitions
          - function definitions
    """

    def __init__(self) -> None:
        self.css_parser = Parser(CSS_LANGUAGE)
        self.scss_parser = Parser(SCSS_LANGUAGE)

    def analyze_file(self, file_path: str) -> FileMetrics:
        with open(file_path, "rb") as f:
            content = f.read()

        is_scss = file_path.endswith(".scss")
        parser = self.scss_parser if is_scss else self.css_parser
        tree = parser.parse(content)

        # Simple non-empty line count for LOC
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])

        scopes = self._extract_scopes(tree.root_node, content, is_scss=is_scss)

        average_complexity = (
            sum(f.cyclomatic_complexity for f in scopes) / len(scopes)
            if scopes
            else 0.0
        )

        total_scope_loc = sum(f.nloc for f in scopes)
        average_scope_length = total_scope_loc / len(scopes) if scopes else 0.0

        # For now we do not compute any CSS/SCSS-specific metrics; everything
        # other than LOC and the scope hierarchy stays at 0 so the rest of the
        # pipeline can aggregate safely.
        return FileMetrics(
            nloc=nloc,
            average_cyclomatic_complexity=average_complexity,
            function_list=scopes,
            filename=file_path,
            comment_lines=0,
            comment_density=0.0,
            max_nesting_depth=0,
            average_function_length=average_scope_length,
            parameter_count=0,
            todo_count=0,
            classes_count=0,
            tsx_nesting_depth=0,
            tsx_render_branching_count=0,
            tsx_react_use_effect_count=0,
            tsx_anonymous_handler_count=0,
            tsx_prop_count=0,
            ts_any_usage_count=0,
            ts_ignore_count=0,
            ts_import_coupling_count=0,
            tsx_hardcoded_string_volume=0,
            tsx_duplicated_string_count=0,
            ts_type_interface_count=0,
            ts_export_count=0,
            md_data_url_count=0,
        )

    # ---- Scope extraction ----------------------------------------------------

    def _extract_scopes(
        self, root: Node, content: bytes, is_scss: bool
    ) -> List[FunctionMetrics]:
        """
        Walk the CSS / SCSS syntax tree and build a hierarchy of scopes.

        We treat any node that looks like a "rule" / "block" container (rule
        sets, at-rules, etc.) as a scope. For SCSS we also treat mixin and
        function definitions as scopes.
        """

        def walk(node: Node) -> List[FunctionMetrics]:
            results: List[FunctionMetrics] = []
            for child in node.children:
                if self._node_is_scope(child, is_scss=is_scss):
                    scope = self._build_scope_metrics(child, content, is_scss=is_scss)
                    scope.children = walk(child)
                    results.append(scope)
                else:
                    results.extend(walk(child))
            return results

        return walk(root)

    def _node_is_scope(self, node: Node, is_scss: bool) -> bool:
        """
        Heuristic: identify rule / at-rule / mixin / function nodes.

        The exact node type names differ slightly between CSS and SCSS
        grammars, so we rely on a mix of explicit names and substring checks.
        """

        t = node.type

        # Common CSS rule / at-rule containers.
        rule_like_types = {
            "rule_set",
            "ruleset",
            "style_rule",
            "qualified_rule",
            "media_rule",
            "supports_rule",
            "keyframes_rule",
            "font_face_rule",
            "page_rule",
        }
        if t in rule_like_types:
            return True

        # Generic heuristic: anything with "rule" in the name (but not the
        # root stylesheet) is probably a rule-like container.
        if "rule" in t and t not in {"stylesheet"}:
            return True

        if is_scss:
            # SCSS-specific constructs for functions / mixins and control flow
            # that introduce nested blocks.
            scss_scope_types = {
                "mixin_declaration",
                "mixin_definition",
                "function_declaration",
                "function_definition",
                "if_statement",
                "each_statement",
                "for_statement",
                "while_statement",
            }
            if t in scss_scope_types:
                return True

            if any(
                key in t
                for key in (
                    "mixin",
                    "function",
                )
            ):
                return True

            if t == "include_statement":
                # Only treat @include as a scope if it has a content block ie { ... }
                # otherwise it's just a one-line mixin call.
                return any(child.type == "block" for child in node.children)

        return False

    def _build_scope_metrics(
        self, node: Node, content: bytes, is_scss: bool
    ) -> FunctionMetrics:
        start_line = node.start_point.row + 1
        end_line = node.end_point.row + 1
        nloc = max(0, end_line - start_line + 1)

        name = self._get_scope_name(node, content)
        origin_type = "scss_scope" if is_scss else "css_scope"

        return FunctionMetrics(
            name=name,
            cyclomatic_complexity=0,
            nloc=nloc,
            start_line=start_line,
            end_line=end_line,
            parameter_count=0,
            max_nesting_depth=0,
            comment_lines=0,
            todo_count=0,
            ts_type_interface_count=0,
            md_data_url_count=0,
            origin_type=origin_type,
            is_jsx_container=False,
        )

    # ---- Helpers -------------------------------------------------------------

    def _get_scope_name(self, node: Node, content: bytes, max_len: int = 80) -> str:
        """
        Derive a human-friendly name for a CSS / SCSS scope by taking the
        first line of the node text up to the opening '{', if present.
        """

        # Use byte offsets so we don't depend on child layout details.
        src = content[node.start_byte : node.end_byte].decode(
            "utf-8", errors="ignore"
        )

        # Take the first non-empty line.
        first_line = ""
        for line in src.splitlines():
            stripped = line.strip()
            if stripped:
                first_line = stripped
                break

        if not first_line:
            first_line = node.type

        # Trim everything after '{' so selectors / rule headers look clean.
        brace_index = first_line.find("{")
        if brace_index != -1:
            first_line = first_line[:brace_index].rstrip()

        # Collapse internal whitespace to keep long selectors readable.
        first_line = re.sub(r"\s+", " ", first_line).strip()

        if len(first_line) > max_len:
            first_line = first_line[: max_len - 1] + "…"

        return first_line or node.type


