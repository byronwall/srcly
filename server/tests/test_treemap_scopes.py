
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

def test_treemap_scopes(tmp_path):
    analyzer = TreeSitterAnalyzer()

    code = """
    const myObj = {
        foo: function() {
            return 1;
        },
        nested: {
            bar: 2
        }
    };

    class MyClass {
        method() {
            return 1;
        }
    }

    interface MyInterface {
        prop: string;
        method(): void;
    }

    type MyType = {
        a: number;
        b: () => void;
    };
    """

    f = tmp_path / "test_treemap.ts"
    f.write_text(code, encoding="utf-8")

    metrics = analyzer.analyze_file(str(f))
    
    # We expect 'myObj', 'MyClass', 'MyInterface', 'MyType' to be in the function_list
    # or some equivalent list of top-level items that become nodes in the treemap.
    # Currently, 'function_list' is used for everything that has children in the treemap.
    
    names = [item.name for item in metrics.function_list]
    
    # Check for presence
    assert "myObj" in names or "myObj (object)" in names
    assert "MyClass" in names or "MyClass (class)" in names
    # Interfaces and Types might not be in function_list currently
    assert "MyInterface" in names or "MyInterface (interface)" in names
    assert "MyType" in names or "MyType (type)" in names
    
    # Check for nesting
    # myObj should have children (foo)
    my_obj = next((item for item in metrics.function_list if "myObj" in item.name), None)
    assert my_obj is not None
    assert len(my_obj.children) > 0
    assert any("foo" in child.name for child in my_obj.children)
    
    # MyClass should have children (method)
    my_class = next((item for item in metrics.function_list if "MyClass" in item.name), None)
    assert my_class is not None
    assert len(my_class.children) > 0
    assert any("method" in child.name for child in my_class.children)

