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

    # Variables and usages may now be wrapped inside "declaration" clusters,
    # so we traverse the whole subtree instead of only looking at root children.
    vars_ = _collect_nodes(graph, "variable")
    assert len(vars_) == 2
    var_names = [v["labels"][0]["text"] for v in vars_]
    assert any("x" in name for name in var_names)
    assert any("y" in name for name in var_names)

    usages = _collect_nodes(graph, "usage")
    assert len(usages) == 1
    assert usages[0]["labels"][0]["text"] == "x"

    # Line number metadata should be present on both definitions and usages.
    for v in vars_:
        assert "startLine" in v and "endLine" in v
        assert isinstance(v["startLine"], int) and isinstance(v["endLine"], int)
        assert v["startLine"] >= 1 and v["endLine"] >= v["startLine"]

    for u in usages:
        assert "startLine" in u and "endLine" in u
        assert isinstance(u["startLine"], int) and isinstance(u["endLine"], int)
        assert u["startLine"] >= 1 and u["endLine"] >= u["startLine"]

    # Should have edge from x def to x usage
    edges = graph["edges"]
    assert len(edges) == 1

    x_def = next(v for v in vars_ if "x" in v["labels"][0]["text"])
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

    root_children = graph["children"]

    # Global var should still appear as a top-level variable definition.
    global_vars = [c for c in root_children if c.get("type") == "variable"]
    assert any("globalVar" in v["labels"][0]["text"] for v in global_vars)

    # Function scope is the only child scope under the global root.
    func_scopes = [c for c in root_children if c.get("type") == "function"]
    assert len(func_scopes) == 1
    my_func_scope = func_scopes[0]

    # The function body should not introduce an extra "block" scope; locals and
    # usages live directly under the function cluster (possibly wrapped in
    # "declaration" groupings).
    assert all(c.get("type") != "block" for c in my_func_scope.get("children", []))

    func_vars = _collect_nodes(my_func_scope, "variable")
    labels = {v["labels"][0]["text"] for v in func_vars}
    assert "param1 (param)" in labels
    assert any("localVar" in label for label in labels)

    func_usages = _collect_nodes(my_func_scope, "usage")
    usage_labels = {u["labels"][0]["text"] for u in func_usages}
    assert "globalVar" in usage_labels
    assert "param1" in usage_labels

    # Check edges: globalVar usage inside the function should link back to the
    # globalVar definition in the parent scope.
    global_def = next(v for v in global_vars if "globalVar" in v["labels"][0]["text"])
    global_usage = next(u for u in func_usages if u["labels"][0]["text"] == "globalVar")

    edges = graph["edges"]
    edge = next(
        (
            e
            for e in edges
            if e["sources"][0] == global_def["id"] and e["targets"][0] == global_usage["id"]
        ),
        None,
    )
    assert edge is not None

    # Edge should carry line metadata for both definition and usage.
    assert "defStartLine" in edge and "defEndLine" in edge
    assert "usageStartLine" in edge and "usageEndLine" in edge
    assert isinstance(edge["defStartLine"], int) and isinstance(edge["defEndLine"], int)
    assert isinstance(edge["usageStartLine"], int) and isinstance(edge["usageEndLine"], int)
    assert edge["defStartLine"] >= 1 and edge["defEndLine"] >= edge["defStartLine"]
    assert edge["usageStartLine"] >= 1 and edge["usageEndLine"] >= edge["usageStartLine"]


def test_tsx_jsx_scopes_and_labels(tmp_path):
    analyzer = DataFlowAnalyzer()

    code = """
    import { Show, createSignal, onCleanup } from "solid-js";

    export default function Toast(props) {
      const [visible, setVisible] = createSignal(true);
      const duration = props.duration ?? 3000;

      const hide = () => setVisible(false);
      const timer = setTimeout(hide, duration);
      onCleanup(() => clearTimeout(timer));

      return (
        <Show when={visible()}>
          <div>{props.message}</div>
        </Show>
      );
    }
    """

    f = tmp_path / "Toast.tsx"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))

    # Root should be the global scope.
    assert graph["type"] == "global"
    assert graph["labels"][0]["text"] == "global"

    # Find the Toast function scope.
    root_children = graph["children"]
    func_scopes = [c for c in root_children if c.get("type") == "function"]
    assert func_scopes
    toast_scope = func_scopes[0]

    # Function scope label should use the richer naming helper.
    toast_label = toast_scope["labels"][0]["text"]
    assert "Toast" in toast_label
    assert "(function)" in toast_label

    # The function body should not add an extra "block" wrapper – JSX scopes
    # live directly under the function cluster.
    assert all(c.get("type") != "block" for c in toast_scope.get("children", []))

    # Within the function we should see a JSX scope for <Show>.
    jsx_scopes = _collect_nodes(toast_scope, "jsx")
    assert jsx_scopes
    show_scope = next(s for s in jsx_scopes if "<Show>" in s["labels"][0]["text"])
    show_label = show_scope["labels"][0]["text"]
    assert "<Show>" in show_label

    # And inside <Show> we should see another JSX scope for the <div>.
    inner_jsx_scopes = _collect_nodes(show_scope, "jsx")
    assert inner_jsx_scopes
    div_scope = next(s for s in inner_jsx_scopes if "<div>" in s["labels"][0]["text"])
    div_label = div_scope["labels"][0]["text"]
    assert "<div>" in div_label

    # Verify that usages inside JSX (e.g. props.message, visible) are attached
    # somewhere beneath the JSX scopes, giving us the extra nesting depth.
    jsx_usages = _collect_nodes(show_scope, "usage")
    usage_names = {u["labels"][0]["text"] for u in jsx_usages}
    assert "visible" in usage_names or "props" in usage_names
