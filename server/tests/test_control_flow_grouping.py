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

    # Currently, we expect these to NOT be found or be generic blocks
    # But we want to assert that we CAN find them after our changes.
    
    # Check for 'if' scope
    if_scopes = find_scopes(graph, "if")
    assert len(if_scopes) >= 1 # This will fail currently
    
    # Check for 'try' scope
    try_scopes = find_scopes(graph, "try")
    assert len(try_scopes) == 1 # This will fail currently
    
    # Check for 'catch' scope
    catch_scopes = find_scopes(graph, "catch")
    assert len(catch_scopes) == 1 # This will fail currently

    print(f"Found if scopes: {len(if_scopes)}")
    print(f"Found try scopes: {len(try_scopes)}")
    print(f"Found catch scopes: {len(catch_scopes)}")
