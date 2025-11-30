from app.services.data_flow_analysis import DataFlowAnalyzer


def _find_scopes(node, type_name):
    found = []
    if node.get("type") == type_name:
        found.append(node)
    for child in node.get("children", []):
        found.extend(_find_scopes(child, type_name))
    return found


def test_try_catch_control_flow_grouping(tmp_path):
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

    # Check for 'try' scope
    try_scopes = _find_scopes(graph, "try")
    assert len(try_scopes) == 1

    # Check for 'catch' scope
    catch_scopes = _find_scopes(graph, "catch")
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


def test_if_else_control_flow_grouping(tmp_path):
    analyzer = DataFlowAnalyzer()

    code = """
    function demo(next: number) {
        if (Number.isNaN(next)) {
            setLineOffset(0);
        } else {
            setLineOffset(Math.max(0, Math.floor(next)));
        }
    }
    """

    f = tmp_path / "if_else_control_flow.ts"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))

    # Find a parent scope that has both an if-branch and an else-branch as children.
    def find_parent_with_if_else(node):
        children = node.get("children", []) or []
        types = [c.get("type") for c in children]
        if "if_branch" in types and "else_branch" in types:
            return node, children
        for child in children:
            found_parent, found_children = find_parent_with_if_else(child)
            if found_parent is not None:
                return found_parent, found_children
        return None, None

    parent, children = find_parent_with_if_else(graph)
    assert parent is not None, "Expected to find a parent with if/else branches"

    if_node = next(c for c in children if c.get("type") == "if_branch")
    else_node = next(c for c in children if c.get("type") == "else_branch")

    # They should be siblings (same parent) and distinct nodes.
    assert if_node["id"] != else_node["id"]

    # Verify a control-flow edge from if-branch to else-branch exists.
    edges = graph.get("edges", [])
    control_flow_edges = [
        e
        for e in edges
        if e.get("type") == "control-flow"
        and e.get("sources") == [if_node["id"]]
        and e.get("targets") == [else_node["id"]]
    ]
    assert (
        control_flow_edges
    ), "Expected a control-flow edge from if-branch to else-branch"
