from app.services.focus_overlay import compute_scope_graph

# Sample TSX content
SAMPLE_CODE = """
import { useState } from 'react';

function Outer(props) {
    const [count, setCount] = useState(0);
    const split = 10;

    function handleIncrement() {
        setCount(count + 1);
        console.log(split);
    }

    return (
        <div onClick={handleIncrement}>
            <Inner value={count} />
        </div>
    );
}

function Inner({ value }) {
    return <span>{value}</span>;
}
"""

def test_scope_graph_structure(tmp_path):
    f = tmp_path / "test.tsx"
    f.write_text(SAMPLE_CODE)

    # Focus on 'Outer' function (lines 4-18)
    graph = compute_scope_graph(
        file_path=str(f),
        focus_start_line=5, # Inside Outer
        focus_end_line=15
    )

    root = graph.root
    assert root.kind == "function"
    assert root.name == "Outer"
    assert root.startLine == 4
    
    # Check declared vars in Outer
    decl_names = {d.name for d in root.declared}
    assert "count" in decl_names
    assert "setCount" in decl_names
    assert "split" in decl_names
    assert "handleIncrement" in decl_names
    assert "props" in decl_names # param
    
    children_names = [c.name for c in root.children]
    # handleIncrement is a function declaration, so it should be a child scope with name.
    assert "handleIncrement" in children_names
    # TSX: every JSX element becomes its own scope layer
    assert "<div>" in children_names
    
    # Find handleIncrement scope
    handle_inc = next(c for c in root.children if c.name == "handleIncrement")
    assert handle_inc.kind == "function"
    
    # Check captures in handleIncrement
    # It uses `setCount`, `count`, `split`.
    cap_names = {c.name for c in handle_inc.captured}
    assert "setCount" in cap_names
    assert "count" in cap_names
    assert "split" in cap_names
    assert "console" not in cap_names # Builtin
    
    
def test_nested_jsx_callback(tmp_path):
    code = """
    function Component() {
        const x = 1;
        return (
            <div onClick={() => console.log(x)}></div>
        );
    }
    """
    f = tmp_path / "comp.tsx"
    f.write_text(code)
    
    graph = compute_scope_graph(
         file_path=str(f),
         focus_start_line=2,
         focus_end_line=6
    )
    
    # Root is Component
    root = graph.root
    assert root.kind == "function"
    assert root.name == "Component"
    
    # TSX: root should include a JSX scope layer (<div>), and the inline handler should
    # be nested under that element.
    assert "<div>" in [c.name for c in root.children]
    div_scope = next(c for c in root.children if c.name == "<div>")
    assert div_scope.kind == "jsx"
    assert len(div_scope.children) == 1
    arrow = div_scope.children[0]
    assert arrow.kind == "function"
    assert arrow.name == "onClick" # Should be named after the attribute
    
    # Arrow should capture x
    cap_names = {c.name for c in arrow.captured}
    assert "x" in cap_names

def test_empty_scope_pruning(tmp_path):
    code = """
    function Foo() {
        if (true) {
            // Empty block
        }
        {
            // Another empty block
        }
    }
    """
    f = tmp_path / "empty.ts"
    f.write_text(code)

    graph = compute_scope_graph(
        file_path=str(f),
        focus_start_line=2,
        focus_end_line=9
    )

    root = graph.root
    assert root.name == "Foo"
    # Both blocks should be pruned
    assert len(root.children) == 0


def test_module_scope_not_captured(tmp_path):
    code = """
    const moduleVar = 123;
    
    function foo() {
        return moduleVar;
    }
    """
    f = tmp_path / "modTest.ts"
    f.write_text(code)
    
    graph = compute_scope_graph(
        file_path=str(f),
        focus_start_line=4,
        focus_end_line=6
    )
    
    root = graph.root
    assert root.name == "foo"
    
    # Ideally moduleVar is NOT captured because it's module-level
    cap_names = {c.name for c in root.captured}
    assert "moduleVar" not in cap_names


def test_tsx_every_jsx_element_is_a_scope_layer(tmp_path):
    code = """
    function Simple() {
        return (
            <div>
                <span>Hello</span>
                <p>World</p>
            </div>
        );
    }
    """
    f = tmp_path / "simple.tsx"
    f.write_text(code, encoding="utf-8")

    graph = compute_scope_graph(
        file_path=str(f),
        focus_start_line=2,
        focus_end_line=9,
    )

    root = graph.root
    assert root.kind == "function"
    assert root.name == "Simple"

    # The returned tree should include the JSX structure, even for leaf nodes.
    assert "<div>" in [c.name for c in root.children]
    div_scope = next(c for c in root.children if c.name == "<div>")
    assert div_scope.kind == "jsx"

    child_names = [c.name for c in div_scope.children]
    assert "<span>" in child_names
    assert "<p>" in child_names

    span_scope = next(c for c in div_scope.children if c.name == "<span>")
    p_scope = next(c for c in div_scope.children if c.name == "<p>")
    assert span_scope.kind == "jsx"
    assert p_scope.kind == "jsx"


def test_tsx_inline_handler_still_tracks_declared_and_captured(tmp_path):
    code = """
    function WithHandler() {
        const x = 1;
        return (
            <button onClick={() => {
                const y = 2;
                return x + y;
            }}>
                Click
            </button>
        );
    }
    """
    f = tmp_path / "handler.tsx"
    f.write_text(code, encoding="utf-8")

    graph = compute_scope_graph(
        file_path=str(f),
        focus_start_line=2,
        focus_end_line=12,
    )

    root = graph.root
    assert root.kind == "function"
    assert root.name == "WithHandler"

    assert "<button>" in [c.name for c in root.children]
    btn = next(c for c in root.children if c.name == "<button>")
    assert btn.kind == "jsx"

    # Inline arrow is nested under the JSX element.
    arrow = next(c for c in btn.children if c.kind == "function")
    assert arrow.name == "onClick"

    decl_names = {d.name for d in arrow.declared}
    assert "y" in decl_names

    cap_names = {c.name for c in arrow.captured}
    assert "x" in cap_names


