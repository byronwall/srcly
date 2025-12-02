
from app.services.data_flow_analysis import DataFlowAnalyzer

def _collect_nodes(node, type_name):
    """
    Recursively collect all child nodes of a given type from the ELK graph.
    """
    found = []
    for child in node.get("children", []) or []:
        if child.get("type") == type_name:
            found.append(child)
        found.extend(_collect_nodes(child, type_name))
    return found

def test_top_level_object_scope(tmp_path):
    analyzer = DataFlowAnalyzer()

    code = """
    const myObj = {
        foo: function() {
            return 1;
        },
        bar: () => {
            return 2;
        },
        nested: {
            baz: 3
        }
    };
    """

    f = tmp_path / "test_obj.ts"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))
    
    # We expect 'myObj' to be a scope (container)
    # Currently it might just be a variable definition.
    
    # Check if there is a scope for the object
    # We might need to define what type it has. Maybe 'object'?
    # For now, let's look for any scope that contains 'foo' or 'bar' as children.
    
    root_children = graph["children"]
    
    # Find the scope that corresponds to myObj
    # If it exists, it should be a child of global scope
    
    # Let's look for scopes with type 'object' or similar, or just check if we can find one with label 'myObj'
    # Currently, it probably doesn't exist.
    
    # We want to find a scope that is NOT the global scope, but contains the function 'foo'
    
    # Find 'foo' function scope
    func_scopes = _collect_nodes(graph, "function")
    foo_scope = next((s for s in func_scopes if "foo" in s["labels"][0]["text"]), None)
    
    assert foo_scope is not None
    
    # Check its parent. In the graph structure, we can't easily check parent pointer, 
    # but we can check if it's nested inside another scope in the 'children' hierarchy.
    
    def find_parent_scope(node, target_id):
        for child in node.get("children", []) or []:
            if child["id"] == target_id:
                return node
            res = find_parent_scope(child, target_id)
            if res:
                return res
        return None
        
    parent = find_parent_scope(graph, foo_scope["id"])
    assert parent is not None
    
    # The parent should be the 'myObj' scope, not the global scope.
    # If it's the global scope, then myObj is not being treated as a container.
    
    assert parent["type"] != "global", "foo should be inside an object scope, not directly in global"
    assert "myObj" in parent["labels"][0]["text"]

def test_class_scope(tmp_path):
    analyzer = DataFlowAnalyzer()

    code = """
    class MyClass {
        method() {
            return 1;
        }
    }
    """

    f = tmp_path / "test_class.ts"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))
    
    # Find 'method' function scope
    func_scopes = _collect_nodes(graph, "function")
    method_scope = next((s for s in func_scopes if "method" in s["labels"][0]["text"]), None)
    
    assert method_scope is not None
    
    def find_parent_scope(node, target_id):
        for child in node.get("children", []) or []:
            if child["id"] == target_id:
                return node
            res = find_parent_scope(child, target_id)
            if res:
                return res
        return None
        
    parent = find_parent_scope(graph, method_scope["id"])
    assert parent is not None
    
    # The parent should be the 'MyClass' scope
    assert parent["type"] == "class"
    assert "MyClass" in parent["labels"][0]["text"]
