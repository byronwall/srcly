import textwrap
from pathlib import Path

from app.services.tree_sitter_analysis import MarkdownTreeSitterAnalyzer
from app.services.analysis import scan_codebase


def write(tmp_path: Path, name: str, content: str) -> Path:
    p = tmp_path / name
    p.write_text(textwrap.dedent(content), encoding="utf-8")
    return p


def test_markdown_headings_create_nested_sections(tmp_path):
    analyzer = MarkdownTreeSitterAnalyzer()

    md = write(
        tmp_path,
        "doc.md",
        """
        # H1

        Intro

        ## H2

        Text under H2.

        ### H3

        More text.
        """,
    )

    metrics = analyzer.analyze_file(str(md))

    # One top-level section for H1
    assert len(metrics.function_list) == 1
    h1 = metrics.function_list[0]
    assert h1.name.startswith("# H1")

    # H2 should be a child of H1 and H3 a child of H2
    h2 = next((c for c in h1.children if c.name.startswith("## H2")), None)
    assert h2 is not None

    h3 = next((c for c in h2.children if c.name.startswith("### H3")), None)
    assert h3 is not None

    # Ensure line ranges are sane and nested
    assert h1.start_line < h2.start_line < h3.start_line
    assert h1.end_line >= h2.end_line >= h3.end_line


def test_markdown_blocks_and_quotes_become_scopes(tmp_path):
    analyzer = MarkdownTreeSitterAnalyzer()

    md = write(
        tmp_path,
        "blocks.md",
        """
        # Title

        > quoted text

        ```js
        console.log("hi");
        ```
        """,
    )

    metrics = analyzer.analyze_file(str(md))
    assert len(metrics.function_list) == 1
    section = metrics.function_list[0]

    # Expect a block quote and a fenced code block as children scopes.
    names = [c.name for c in section.children]
    assert any(name.startswith("> ") for name in names)
    assert any(name.startswith("```") for name in names)


def test_markdown_data_urls_create_scopes_and_metric(tmp_path):
    analyzer = MarkdownTreeSitterAnalyzer()

    md = write(
        tmp_path,
        "dataurl.md",
        """
        # Assets

        Here is an embedded image:

        ![logo](data:image/png;base64,AAAA)

        And another:

        [link](data:text/plain,hello)
        """,
    )

    metrics = analyzer.analyze_file(str(md))

    # File-level metric should count all data URLs.
    assert metrics.md_data_url_count == 2

    # At least one child scope should be a data-url scope.
    def walk(funcs):
        for f in funcs:
            yield f
            yield from walk(f.children)

    data_scopes = [f for f in walk(metrics.function_list) if f.name.startswith("data-url")]
    assert len(data_scopes) == 2
    assert all(f.md_data_url_count == 1 for f in data_scopes)


def test_scan_codebase_includes_markdown_scopes(tmp_path):
    root = tmp_path / "proj"
    root.mkdir()

    md = root / "README.md"
    md.write_text(
        textwrap.dedent(
            """
            # Project

            > summary
            """
        ),
        encoding="utf-8",
    )

    tree = scan_codebase(root)

    # Find the file node for README.md
    file_node = None

    def find_file(node):
        nonlocal file_node
        if node.type == "file" and node.name == "README.md":
            file_node = node
            return
        for child in node.children:
            find_file(child)

    find_file(tree)
    assert file_node is not None

    # The markdown analyzer should have created at least one child scope
    # (the top-level heading section).
    assert file_node.children
    heading = next((c for c in file_node.children if c.name.startswith("# Project")), None)
    assert heading is not None


