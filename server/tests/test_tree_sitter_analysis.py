import pytest
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

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
    
    # So outer should have children: inner, method
    # Let's verify the names of children
    child_names = [c.name for c in outer.children]
    assert "inner" in child_names
    assert "method" in child_names
    
    # Check inner's children
    inner = next(c for c in outer.children if c.name == "inner")
    assert len(inner.children) == 1
    assert inner.children[0].name == "arrow" or inner.children[0].name == "(anonymous)" # Depending on how variable decl is handled
    # In the code: const arrow = ... 
    # The logic for arrow_function looks at parent. 
    # If parent is variable_declarator, it gets the name.
    # So it should be "arrow".
    assert inner.children[0].name == "arrow"

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
    
    # The arrow function inside map might be a child
    # items.map(item => ...)
    assert len(component.children) == 1
    # It's an anonymous arrow function or argument to map
    child = component.children[0]
    assert child.name == "map(ƒ)" # Updated to use new naming convention
