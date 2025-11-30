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


def test_if_condition_grouping(tmp_path):
    """
    Variables that participate in an `if` condition should still be represented
    as usage nodes within the surrounding `if` scope so the client can show
    them alongside the branches.
    """
    analyzer = DataFlowAnalyzer()

    code = """
    let containerRef: HTMLDivElement | null = null;

    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!containerRef || !target) return;
        if (!containerRef.contains(target)) {
            setShowSuggestions(false);
            setShowRecent(false);
        }
    };
    """

    f = tmp_path / "if_condition_grouping.tsx"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))

    # We should not render any dedicated `if_condition` scopes now that
    # condition expressions are attached directly to the surrounding `if`.
    assert not _find_scopes(graph, "if_condition")

    # Collect all usage labels that live under any `if` scope. The exact
    # nesting (direct child vs. nested block) is an implementation detail; we
    # just care that the condition variables are present somewhere within the
    # relevant `if` cluster.
    def _collect_usage_labels(node):
        labels = set()
        for child in node.get("children", []) or []:
            if child.get("type") == "usage":
                text = (child.get("labels") or [{}])[0].get("text")
                labels.add(text)
            labels |= _collect_usage_labels(child)
        return labels

    if_scopes = _find_scopes(graph, "if")
    assert if_scopes, "Expected to find at least one `if` scope in the graph"

    all_usage_labels = set()
    for if_scope in if_scopes:
        all_usage_labels |= _collect_usage_labels(if_scope)

    # Usage node labels are either just the identifier name or "attr: name" for JSX.
    assert any("containerRef" in (label or "") for label in all_usage_labels)
    assert any("target" in (label or "") for label in all_usage_labels)


def test_if_condition_has_single_if_label(tmp_path):
    """
    For a single `if` statement we should only render one scope labelled \"if\".
    The primary body of the `if` is represented as a \"then\" branch so users
    don't see two nested \"if\" blocks for the same statement.
    """
    analyzer = DataFlowAnalyzer()

    code = """
    function demo(parsed: unknown) {
        if (Array.isArray(parsed)) {
            const onlyStrings = parsed.filter(
                (item: unknown): item is string => typeof item === "string"
            );
            setRecentPaths(onlyStrings);
        }
    }
    """

    f = tmp_path / "if_single_label.ts"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))

    # There should be exactly one scope in the graph labelled \"if\" for this
    # single `if` statement.
    def _collect_if_labels(node):
        labels = []
        if node.get("type") == "if":
            labels.append((node.get("labels") or [{}])[0].get("text"))
        for child in node.get("children", []) or []:
            labels.extend(_collect_if_labels(child))
        return labels

    if_labels = _collect_if_labels(graph)
    assert if_labels.count("if") == 1

    # We still expect the primary body of the `if` to be represented as a
    # \"then\" branch under that scope so users see a single \"if\" box with a
    # clearly named body.
    def find_if_with_branch(node):
        children = node.get("children", []) or []
        types = [c.get("type") for c in children]
        if "if_branch" in types:
            return node, children
        for child in children:
            found_parent, found_children = find_if_with_branch(child)
            if found_parent is not None:
                return found_parent, found_children
        return None, None

    if_scope, children = find_if_with_branch(graph)
    assert if_scope is not None, "Expected to find an `if` scope with a then-branch"
    assert (if_scope.get("labels") or [{}])[0].get("text") == "if"
    child_labels = [
        (c.get("labels") or [{}])[0].get("text") for c in children if c.get("labels")
    ]
    assert "then" in child_labels
