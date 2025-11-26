import pytest
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

@pytest.fixture
def analyzer():
    return TreeSitterAnalyzer()

def test_anonymous_function_naming(analyzer, tmp_path):
    content = """
    function main() {
        // Case 1: Anonymous function in sort
        [1, 2].sort((a, b) => a - b);

        // Case 2: Anonymous function in map
        items.map(function(item) { return item.id; });

        // Case 3: Assigned to variable (should be named 'myFunc')
        const myFunc = () => {};

        // Case 4: Object property (should be named 'myMethod')
        const obj = {
            myMethod: () => {}
        };
        
        // Case 5: Deeply nested call
        foo.bar.baz(() => {});
        
        // Case 6: IIFE
        const value = (() => {
            return 42;
        })();
    }
    """
    
    test_file = tmp_path / "test_naming.ts"
    test_file.write_text(content, encoding="utf-8")
    
    metrics = analyzer.analyze_file(str(test_file))
    
    main_func = metrics.function_list[0]
    children = main_func.children
    
    # We expect 6 children corresponding to the 6 functions above
    assert len(children) == 6
    
    names = [c.name for c in children]
    
    # Current behavior (expected to fail after changes, but for now let's see what we get)
    # I'll write assertions for the DESIRED behavior
    
    # Case 1: sort((a, b) => a - b) -> sort(ƒ)
    assert "sort(ƒ)" in names
    
    # Case 2: map(function(item) ...) -> map(ƒ)
    assert "map(ƒ)" in names
    
    # Case 3: const myFunc = ... -> myFunc
    assert "myFunc" in names
    
    # Case 4: myMethod: ... -> myMethod
    assert "myMethod" in names
    
    # Case 5: foo.bar.baz(() => {}) -> baz(ƒ)
    assert "baz(ƒ)" in names
    
    # Case 6: (() => { ... })() -> IIFE(ƒ)
    assert "IIFE(ƒ)" in names
