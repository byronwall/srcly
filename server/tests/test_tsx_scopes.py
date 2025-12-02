
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

def test_tsx_scopes_complex(tmp_path):
    analyzer = TreeSitterAnalyzer()

    code = """
    function MyComp() {
        return (
            <div className="container">
                <span>Simple Text</span>
                <button onClick={() => console.log('clicked')}>
                    Click Me
                </button>
                <List>
                    <Item onSelect={function(id) { handle(id) }} />
                </List>
            </div>
        );
    }
    """

    f = tmp_path / "test_tsx.tsx"
    f.write_text(code, encoding="utf-8")

    metrics = analyzer.analyze_file(str(f))
    
    # Find MyComp
    my_comp = next((f for f in metrics.function_list if f.name == "MyComp"), None)
    assert my_comp is not None
    
    # MyComp should have a child for the root <div>? 
    # Based on "Only create new container scopes when there is a nested attribute or function to deal with",
    # the root <div> has NO function attributes or function children (it has element children).
    # So it should NOT be a scope.
    div_scope = next((c for c in my_comp.children if "div" in c.name), None)
    assert div_scope is None, "Root div should NOT be a scope (simple container)"
    
    # The <span> is simple, so it should NOT be a scope
    span_scope = next((c for c in my_comp.children if "span" in c.name), None)
    assert span_scope is None, "Simple span should not be a scope"
    
    # The <button> has an onClick function, so it SHOULD be a scope
    # Since div is flattened, button is a direct child of MyComp
    button_scope = next((c for c in my_comp.children if "button" in c.name), None)
    assert button_scope is not None, "Button with onClick should be a scope"
    
    # The onClick arrow function should be a child of the button scope
    onclick_scope = next((c for c in button_scope.children if "onClick" in c.name or "anonymous" in c.name), None)
    assert onclick_scope is not None, "onClick function should be a child of button"
    
    # <List> contains <Item> which has a function.
    # List itself has no function attributes. So List should be flattened.
    list_scope = next((c for c in my_comp.children if "List" in c.name), None)
    assert list_scope is None, "List should NOT be a scope (simple container)"
    
    # <Item> has onSelect, so it should be a scope. Direct child of MyComp.
    item_scope = next((c for c in my_comp.children if "Item" in c.name), None)
    assert item_scope is not None, "Item should be a scope"
    
    # onSelect function
    onselect_scope = next((c for c in item_scope.children if "onSelect" in c.name or "function" in c.name), None)
    assert onselect_scope is not None, "onSelect function should be a child of Item"

def test_tsx_scopes_simple(tmp_path):
    analyzer = TreeSitterAnalyzer()
    
    code = """
    const Simple = () => (
        <div>
            <span>Hello</span>
            <p>World</p>
        </div>
    );
    """
    
    f = tmp_path / "simple.tsx"
    f.write_text(code, encoding="utf-8")
    
    metrics = analyzer.analyze_file(str(f))
    
    simple = next((f for f in metrics.function_list if "Simple" in f.name), None)
    assert simple is not None
    
    # Root div might be a scope, or maybe flattened if it's the ONLY thing?
    # But generally, if it's a JSX element, we might want it as a scope if it's the return value.
    # However, the requirement says "Only create new container scopes when there is a nested attribute or function".
    # Here there are NO nested attributes or functions.
    # So maybe NO child scopes at all?
    
    # Let's check if there are children.
    # If the logic is strict "only if nested function/attr", then `div` should NOT be a scope.
    # But `Simple` itself is a function.
    
    # If `div` is not a scope, then `Simple` has 0 children.
    assert len(simple.children) == 0, "Simple component with no nested functions should have no child scopes"

