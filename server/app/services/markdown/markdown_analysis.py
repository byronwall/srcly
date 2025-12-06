import re
from typing import List

import tree_sitter_markdown as tsmarkdown
from tree_sitter import Language, Node, Parser

from app.services.analysis_types import FileMetrics, FunctionMetrics


MARKDOWN_LANGUAGE = Language(tsmarkdown.language())


class MarkdownTreeSitterAnalyzer:
    """
    Analyze Markdown files using tree-sitter-markdown and emit a hierarchy of
    "scopes" that mirror the existing FunctionMetrics / FileMetrics pipeline.

    We treat:
      - Each heading section as a scope (using the built-in `section` nodes)
      - Block quotes as scopes
      - Fenced / indented code blocks as scopes
      - Each data: URL as a tiny dedicated scope
    """

    def __init__(self) -> None:
        self.md_parser = Parser(MARKDOWN_LANGUAGE)

    def analyze_file(self, file_path: str) -> FileMetrics:
        with open(file_path, "rb") as f:
            content = f.read()

        tree = self.md_parser.parse(content)

        # Simple non-empty line count for LOC
        lines = content.splitlines()
        nloc = len([l for l in lines if l.strip()])

        # Build section hierarchy from the markdown AST
        functions = self._extract_sections(tree.root_node, content)

        # Detect data URLs and attach tiny scopes for each occurrence
        data_url_scopes, data_url_count = self._create_data_url_scopes(
            content, functions
        )

        if data_url_scopes:
            functions.extend(data_url_scopes)

        average_complexity = (
            sum(f.cyclomatic_complexity for f in functions) / len(functions)
            if functions
            else 0.0
        )

        # For now we do not attempt to compute detailed nesting / comment
        # metrics for Markdown itself; they remain 0 so that the rest of the
        # pipeline can aggregate them safely.
        total_function_length = sum(f.nloc for f in functions)
        average_function_length = (
            total_function_length / len(functions) if functions else 0.0
        )

        return FileMetrics(
            nloc=nloc,
            average_cyclomatic_complexity=average_complexity,
            function_list=functions,
            filename=file_path,
            comment_lines=0,
            comment_density=0.0,
            max_nesting_depth=0,
            average_function_length=average_function_length,
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
            md_data_url_count=data_url_count,
        )

    # ---- Section / block extraction -------------------------------------------------

    def _extract_sections(self, root: Node, content: bytes) -> List[FunctionMetrics]:
        """
        Extract top-level sections from the markdown document. The grammar
        organises the document as nested `section` nodes headed by
        atx/setext headings, so we can mirror that hierarchy directly.
        """

        sections: List[FunctionMetrics] = []

        for child in root.children:
            if child.type != "section":
                continue

            # Some tree-sitter-markdown versions emit an initial anonymous
            # `section` node that does not have a heading; skip these so that
            # the scopes tree starts at the first real heading.
            title = self._get_section_title(child, content)
            if title == "(section)":
                continue

            sections.append(self._build_section_metrics(child, content))

        return sections

    def _build_section_metrics(
        self, section_node: Node, content: bytes
    ) -> FunctionMetrics:
        """
        Build a FunctionMetrics node for a single markdown `section`, with
        nested children for subsections, block quotes and code blocks.
        """

        name = self._get_section_title(section_node, content)
        start_line = section_node.start_point.row + 1
        end_line = section_node.end_point.row + 1
        nloc = max(0, end_line - start_line + 1)

        section_metrics = FunctionMetrics(
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
            origin_type="markdown_section",
            is_jsx_container=False,
        )

        children: List[FunctionMetrics] = []

        for child in section_node.children:
            if child.type == "section":
                # Nested heading section – recurse.
                children.append(self._build_section_metrics(child, content))
            else:
                # Look for block-level scopes beneath this section, but avoid
                # walking into nested `section` nodes (they are handled above).
                children.extend(self._collect_block_scopes(child, content))

        section_metrics.children = children
        return section_metrics

    def _collect_block_scopes(
        self, node: Node, content: bytes
    ) -> List[FunctionMetrics]:
        """
        Recursively collect block-level scopes (block quotes and code blocks)
        under the given node, stopping at any nested `section` node so that
        subsections can manage their own block scopes.
        """

        scopes: List[FunctionMetrics] = []

        if node.type == "section":
            # Handled separately in _build_section_metrics
            return scopes

        if node.type in {"block_quote", "fenced_code_block", "indented_code_block"}:
            scopes.append(self._build_block_scope(node, content))
            return scopes

        for child in node.children:
            scopes.extend(self._collect_block_scopes(child, content))

        return scopes

    def _build_block_scope(self, node: Node, content: bytes) -> FunctionMetrics:
        """
        Create a FunctionMetrics representation for a block quote or code block.
        """

        start_line = node.start_point.row + 1
        end_line = node.end_point.row + 1
        nloc = max(0, end_line - start_line + 1)

        if node.type == "block_quote":
            preview = self._extract_inline_preview(node, content)
            name = f"> {preview}" if preview else "> quote"
            origin_type = "markdown_block_quote"
        elif node.type in {"fenced_code_block", "indented_code_block"}:
            lang = self._extract_code_language(node, content)
            if lang:
                name = f"``` {lang}"
            else:
                name = "```"
            origin_type = "markdown_code_block"
        else:
            name = node.type
            origin_type = node.type

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

    # ---- Helpers for headings / code / data URLs -----------------------------------

    def _get_section_title(self, section_node: Node, content: bytes) -> str:
        """
        Derive a human-friendly title for a markdown `section` by looking at
        its heading node. For atx headings we preserve the leading '#' markers
        so that hierarchy is obvious in the scopes tree (e.g. '# H1', '## H2').
        """

        heading = None
        for child in section_node.children:
            if child.type in {"atx_heading", "setext_heading"}:
                heading = child
                break

        if heading is None:
            return "(section)"

        marker_text = ""
        inline_text = ""

        # ATX-style: '# Title', '## Title', etc.
        for c in heading.children:
            if c.type.startswith("atx_h") and c.type.endswith("_marker"):
                marker_text = c.text.decode("utf-8", errors="ignore").strip()
            elif c.type == "inline":
                inline_text = c.text.decode("utf-8", errors="ignore").strip()

        if not marker_text and heading.type == "setext_heading":
            # For setext headings ('Title' underlined with ===/---) we don't
            # have explicit '#' markers; just use the inline content.
            for c in heading.children:
                if c.type == "inline":
                    inline_text = c.text.decode("utf-8", errors="ignore").strip()
                    break
            return inline_text or "(section)"

        if inline_text:
            return f"{marker_text} {inline_text}".strip()

        return marker_text or "(section)"

    def _extract_inline_preview(self, node: Node, content: bytes, max_len: int = 40) -> str:
        """
        Grab a short inline text preview from the first inline-descendant of
        the given node. Used for naming block quotes.
        """

        inline_node = self._find_first_descendant_of_type(node, "inline")
        if inline_node is None:
            return ""

        text = inline_node.text.decode("utf-8", errors="ignore").strip()
        if len(text) > max_len:
            return text[: max_len - 1] + "…"
        return text

    def _extract_code_language(self, node: Node, content: bytes) -> str:
        """
        Extract the fenced code block language info string, if present.
        """

        info = node.child_by_field_name("info_string")
        if info is None:
            # Fall back to scanning children for an info_string node
            for c in node.children:
                if c.type == "info_string":
                    info = c
                    break

        if info is None:
            return ""

        return info.text.decode("utf-8", errors="ignore").strip()

    def _find_first_descendant_of_type(self, node: Node, node_type: str) -> Node | None:
        """
        Depth-first search for the first descendant with the given type.
        """

        if node.type == node_type:
            return node

        for child in node.children:
            found = self._find_first_descendant_of_type(child, node_type)
            if found is not None:
                return found

        return None

    def _create_data_url_scopes(
        self, content: bytes, roots: List[FunctionMetrics]
    ) -> tuple[List[FunctionMetrics], int]:
        """
        Scan the raw markdown content for `data:` URLs and create a tiny scope
        for each one. Each scope is attached to the deepest existing section /
        block that encloses its line range; if no such container exists, it is
        emitted as a top-level scope for the file.
        """

        text = content.decode("utf-8", errors="ignore")

        # Look for "data:" occurrences and then expand to the end of the URL
        # token manually. This is intentionally simple and robust across
        # different markdown shapes.
        pattern = re.compile(r"data:")

        matches = list(pattern.finditer(text))
        if not matches:
            return [], 0

        scopes: List[FunctionMetrics] = []

        # Flatten the existing FunctionMetrics hierarchy so we can search for
        # the smallest enclosing container by line range.
        all_containers: List[FunctionMetrics] = []

        def collect_containers(fn: FunctionMetrics) -> None:
            all_containers.append(fn)
            for child in fn.children:
                collect_containers(child)

        for root in roots:
            collect_containers(root)

        for m in matches:
            start_index = m.start()
            # Map byte offset to 1-based line number.
            line = text.count("\n", 0, start_index) + 1

            # Expand from "data:" to the end of the URI (whitespace or a
            # closing delimiter such as ')' or ']' or '"').
            end_index = len(text)
            for i in range(start_index, len(text)):
                ch = text[i]
                if ch.isspace() or ch in ")]\">":
                    end_index = i
                    break
            full = text[start_index:end_index]

            # Build a short label that exposes the MIME/type portion of the URL.
            # e.g. data:image/png;base64,... -> data-url:image/png
            label = "data-url"
            if ":" in full:
                after_scheme = full.split(":", 1)[1]
                mime = after_scheme.split(",", 1)[0]
                label = f"data-url:{mime}"

            parent = self._find_enclosing_container(all_containers, line)

            scope = FunctionMetrics(
                name=label,
                cyclomatic_complexity=0,
                nloc=1,
                start_line=line,
                end_line=line,
                parameter_count=0,
                max_nesting_depth=0,
                comment_lines=0,
                todo_count=0,
                ts_type_interface_count=0,
                md_data_url_count=1,
                origin_type="markdown_data_url",
                is_jsx_container=False,
            )

            if parent is not None:
                parent.children.append(scope)
            else:
                scopes.append(scope)

        return scopes, len(matches)

    def _find_enclosing_container(
        self, containers: List[FunctionMetrics], line: int
    ) -> FunctionMetrics | None:
        """
        Find the smallest FunctionMetrics node whose [start_line, end_line]
        range contains the given line. This lets us nest data URL scopes under
        the most specific heading / block that encloses them.
        """

        best: FunctionMetrics | None = None
        for c in containers:
            if c.start_line <= 0 or c.end_line <= 0:
                continue
            if c.start_line <= line <= c.end_line:
                if best is None or (c.start_line >= best.start_line and c.end_line <= best.end_line):
                    best = c
        return best


