import pytest
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

@pytest.fixture
def analyzer():
    return TreeSitterAnalyzer()

def test_nested_functions(analyzer, tmp_path):
    # Create a dummy TS file
    ts_content = """
    function outer() {
        console.log("outer");
        
        function inner() {
            console.log("inner");
            
            const arrow = () => {
                return "arrow";
            }
        }
        
        class MyClass {
            method() {
                console.log("method");
            }
        }
    }
    """
    
    test_file = tmp_path / "test_sample.ts"
    test_file.write_text(ts_content, encoding="utf-8")
    
    metrics = analyzer.analyze_file(str(test_file))
    
    assert metrics.filename == str(test_file)
    # Total LOC might vary slightly depending on how lizard/tree-sitter counts, 
    # but let's check the structure primarily.
    
    # We expect one top-level function: outer
    assert len(metrics.function_list) == 1
    outer = metrics.function_list[0]
    assert outer.name == "outer"
    
    # outer should have 2 children: inner and method (inside MyClass)
    # Wait, MyClass is inside outer. The current logic extracts functions.
    # Does it extract classes as functions? No.
    # But it extracts methods inside classes.
    # Let's check the structure returned by the updated logic.
    
    # The updated logic:
    # process_node(outer_body) -> finds inner, MyClass
    #   inner -> finds arrow
    #   MyClass -> finds method
    
    # So outer should at least have children: inner, MyClass (class)
    # and the MyClass node should in turn have the method as a child.
    # Let's verify the names of children
    child_names = [c.name for c in outer.children]
    assert "inner" in child_names
    assert "MyClass (class)" in child_names
    
    # Check inner's children
    inner = next(c for c in outer.children if c.name == "inner")
    assert len(inner.children) == 1
    assert inner.children[0].name == "arrow" or inner.children[0].name == "(anonymous)" # Depending on how variable decl is handled
    # In the code: const arrow = ... 
    # The logic for arrow_function looks at parent. 
    # If parent is variable_declarator, it gets the name.
    # So it should be "arrow".
    assert inner.children[0].name == "arrow"

    # Check MyClass children (method)
    my_class = next(c for c in outer.children if c.name == "MyClass (class)")
    assert any(child.name == "method" for child in my_class.children)

def test_tsx_handling(analyzer, tmp_path):
    tsx_content = """
    const Component = () => {
        return (
            <div>
                {items.map(item => (
                    <span key={item.id}>{item.name}</span>
                ))}
            </div>
        )
    }
    """
    test_file = tmp_path / "test_component.tsx"
    test_file.write_text(tsx_content, encoding="utf-8")
    
    metrics = analyzer.analyze_file(str(test_file))
    
    assert len(metrics.function_list) == 1
    component = metrics.function_list[0]
    assert component.name == "Component"

    # The component should now expose a virtual TSX root that groups TSX scopes,
    # plus the arrow function used in items.map(...). The virtual root should be
    # named after the real top-level TSX element (<div>) rather than a generic
    # "<fragment>" label.
    tsx_root = next(
        c
        for c in component.children
        if getattr(c, "origin_type", "") == "jsx_virtual_root" and c.name == "<div>"
    )
    # The real <div> container scope should exist and contain the map callback.
    div_scope = next(c for c in tsx_root.children if c.name == "<div>")

    def _has_descendant_named(node, name: str) -> bool:
        if node.name == name:
            return True
        return any(_has_descendant_named(ch, name) for ch in getattr(node, "children", []) or [])

    assert _has_descendant_named(div_scope, "map(ƒ)")
