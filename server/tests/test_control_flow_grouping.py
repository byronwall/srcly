from app.services.data_flow_analysis import DataFlowAnalyzer

def test_control_flow_grouping(tmp_path):
    analyzer = DataFlowAnalyzer()
    
    code = """
    const loadRecentPaths = () => {
        if (typeof window === "undefined") return;

        try {
            const stored = window.localStorage.getItem(RECENT_PATHS_KEY);

            if (!stored) return;

            const parsed = JSON.parse(stored);

            if (Array.isArray(parsed)) {
                const onlyStrings = parsed.filter(
                    (item: unknown): item is string => typeof item === "string"
                );
                setRecentPaths(onlyStrings);
            }
        } catch (err) {
            console.error("Failed to load recent paths", err);
        }
    };
    """
    
    f = tmp_path / "control_flow.ts"
    f.write_text(code, encoding="utf-8")
    
    graph = analyzer.analyze_file(str(f))

    # Helper to find scopes by type
    def find_scopes(node, type_name):
        found = []
        if node.get("type") == type_name:
            found.append(node)
        for child in node.get("children", []):
            found.extend(find_scopes(child, type_name))
        return found

    # Check for 'if' scope
    if_scopes = find_scopes(graph, "if")
    assert len(if_scopes) >= 1
    
    # Check for 'try' scope
    try_scopes = find_scopes(graph, "try")
    assert len(try_scopes) == 1
    
    # Check for 'catch' scope
    catch_scopes = find_scopes(graph, "catch")
    assert len(catch_scopes) == 1

    # Verify there is a control-flow edge linking the try and catch scopes.
    try_node = try_scopes[0]
    catch_node = catch_scopes[0]

    edges = graph.get("edges", [])
    control_flow_edges = [
        e
        for e in edges
        if e.get("type") == "control-flow"
        and e.get("sources") == [try_node["id"]]
        and e.get("targets") == [catch_node["id"]]
    ]
    assert control_flow_edges, "Expected a control-flow edge from try to catch"

    print(f"Found if scopes: {len(if_scopes)}")
    print(f"Found try scopes: {len(try_scopes)}")
    print(f"Found catch scopes: {len(catch_scopes)}")
