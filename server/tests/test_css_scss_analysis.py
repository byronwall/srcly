import textwrap
from pathlib import Path

from app.services.analysis import scan_codebase
from app.services.css.css_analysis import CssTreeSitterAnalyzer


def write(tmp_path: Path, name: str, content: str) -> Path:
    p = tmp_path / name
    p.write_text(textwrap.dedent(content), encoding="utf-8")
    return p


def test_css_basic_rules_become_scopes(tmp_path):
    analyzer = CssTreeSitterAnalyzer()

    css = write(
        tmp_path,
        "styles.css",
        """
        .button {
          color: red;
        }

        .container {
          padding: 1rem;
        }
        """,
    )

    metrics = analyzer.analyze_file(str(css))

    # We should get a scope per top-level rule.
    assert len(metrics.function_list) >= 2
    names = [f.name for f in metrics.function_list]

    assert any(".button" in name for name in names)
    assert any(".container" in name for name in names)


def test_scss_nested_rules_and_mixins(tmp_path):
    analyzer = CssTreeSitterAnalyzer()

    scss = write(
        tmp_path,
        "styles.scss",
        """
        @mixin button-base($color) {
          color: $color;
        }

        .button {
          @include button-base(red);

          .icon {
            width: 16px;
          }
        }

        @function double($value) {
          @return $value * 2;
        }
        """,
    )

    metrics = analyzer.analyze_file(str(scss))

    # Collect top-level scope names.
    top_names = [f.name for f in metrics.function_list]

    # Mixin and function definitions should become top-level scopes.
    assert any(name.startswith("@mixin button-base") for name in top_names)
    assert any(name.startswith("@function double") for name in top_names)

    # The .button rule should also be a top-level scope.
    button_scope = next((f for f in metrics.function_list if ".button" in f.name), None)
    assert button_scope is not None

    # Nested `.icon` selector should become a child scope under `.button`.
    icon_scope = next((c for c in button_scope.children if ".icon" in c.name), None)
    assert icon_scope is not None

    # Ensure nesting line ranges are sane.
    assert button_scope.start_line < icon_scope.start_line <= icon_scope.end_line
    assert button_scope.end_line >= icon_scope.end_line


def test_scan_codebase_includes_css_and_scss_scopes(tmp_path):
    root = tmp_path / "proj"
    root.mkdir()

    css = root / "app.css"
    css.write_text(
        textwrap.dedent(
            """
            .root {
              display: block;
            }
            """
        ),
        encoding="utf-8",
    )

    scss = root / "app.scss"
    scss.write_text(
        textwrap.dedent(
            """
            @mixin spacing($size) {
              margin: $size;
            }

            .wrapper {
              @include spacing(1rem);
            }
            """
        ),
        encoding="utf-8",
    )

    tree = scan_codebase(root)

    def find_file(node, name: str):
        if node.type == "file" and node.name == name:
            return node
        for child in node.children:
            found = find_file(child, name)
            if found:
                return found
        return None

    css_node = find_file(tree, "app.css")
    scss_node = find_file(tree, "app.scss")

    assert css_node is not None
    assert scss_node is not None

    # CSS / SCSS analyzers should have created at least one child scope for each file.
    assert css_node.children
    assert scss_node.children


