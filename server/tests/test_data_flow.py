from app.services.data_flow_analysis import DataFlowAnalyzer

def test_simple_variable_flow(tmp_path):
    analyzer = DataFlowAnalyzer()
    
    code = """
    const x = 10;
    const y = x + 5;
    """
    
    f = tmp_path / "test.ts"
    f.write_text(code, encoding="utf-8")
    
    graph = analyzer.analyze_file(str(f))
    
    # Verify structure
    assert graph["id"] is not None
    children = graph["children"]
    
    # Should have x and y definitions
    vars = [c for c in children if c.get("type") == "variable"]
    assert len(vars) == 2
    var_names = [v["labels"][0]["text"] for v in vars]
    assert any("x" in name for name in var_names)
    assert any("y" in name for name in var_names)
    
    # Should have usage of x
    usages = [c for c in children if c.get("type") == "usage"]
    assert len(usages) == 1
    assert usages[0]["labels"][0]["text"] == "x"
    
    # Should have edge from x def to x usage
    edges = graph["edges"]
    assert len(edges) == 1
    
    # Find x def id
    x_def = next(v for v in vars if "x" in v["labels"][0]["text"])
    x_usage = usages[0]
    
    assert edges[0]["sources"][0] == x_def["id"]
    assert edges[0]["targets"][0] == x_usage["id"]

def test_function_scope(tmp_path):
    analyzer = DataFlowAnalyzer()
    
    code = """
    const globalVar = 1;
    
    function myFunc(param1) {
        const localVar = globalVar + param1;
    }
    """
    
    f = tmp_path / "test_scope.ts"
    f.write_text(code, encoding="utf-8")
    
    graph = analyzer.analyze_file(str(f))
    
    # Root children: globalVar, myFunc (def), and myFunc (scope/cluster)
    # Wait, myFunc scope is a child of global scope.
    
    root_children = graph["children"]
    
    # Global var
    global_vars = [c for c in root_children if c.get("type") == "variable"]
    assert any("globalVar" in v["labels"][0]["text"] for v in global_vars)
    
    # Function scope
    func_scopes = [c for c in root_children if "children" in c] # Scopes have children
    assert len(func_scopes) == 1
    my_func_scope = func_scopes[0]
    
    # Inside function scope: param1, localVar, usage of globalVar, usage of param1
    func_children = my_func_scope["children"]
    
    func_vars = [c for c in func_children if c.get("type") == "variable"]
    # param1 is in function scope
    assert len(func_vars) == 1 
    assert func_vars[0]["labels"][0]["text"] == "param1 (param)"

    # There should be a block scope for the function body
    block_scopes = [c for c in func_children if "children" in c]
    assert len(block_scopes) == 1
    body_scope = block_scopes[0]
    
    # localVar is in the body scope
    body_children = body_scope["children"]
    body_vars = [c for c in body_children if c.get("type") == "variable"]
    assert len(body_vars) == 1
    assert "localVar" in body_vars[0]["labels"][0]["text"]
    
    # Usages are also in the body scope
    body_usages = [c for c in body_children if c.get("type") == "usage"]
    assert len(body_usages) == 2 # globalVar, param1
    
    # Check edges
    # globalVar usage should link to globalVar def (in parent)
    global_def = next(v for v in global_vars if "globalVar" in v["labels"][0]["text"])
    global_usage = next(u for u in body_usages if u["labels"][0]["text"] == "globalVar")
    
    edges = graph["edges"]
    # Edges are at the root level in the current implementation?
    # Yes, _build_graph puts all edges in the root graph object.
    
    edge = next((e for e in edges if e["sources"][0] == global_def["id"] and e["targets"][0] == global_usage["id"]), None)
    assert edge is not None
