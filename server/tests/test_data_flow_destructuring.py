from app.services.data_flow_analysis import DataFlowAnalyzer


def _collect_nodes(node, type_name):
    found = []
    for child in node.get("children", []) or []:
        if child.get("type") == type_name:
            found.append(child)
        found.extend(_collect_nodes(child, type_name))
    return found


def test_destructured_signal_declaration(tmp_path):
    analyzer = DataFlowAnalyzer()

    code = """
    import { createSignal } from "solid-js";

    const [showColumnPicker, setShowColumnPicker] = createSignal(false);
    """

    f = tmp_path / "signal.tsx"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))

    # We should get variable nodes for both destructured bindings so they render
    # as blue "definition" boxes in the client, without spurious "usage" boxes
    # for the same identifiers on the left-hand side. Variables and usages may
    # be wrapped inside a "declaration" cluster, so traverse recursively.
    vars_ = _collect_nodes(graph, "variable")
    var_labels = {v["labels"][0]["text"] for v in vars_}

    assert any("showColumnPicker" in label for label in var_labels)
    assert any("setShowColumnPicker" in label for label in var_labels)

    # There should be no usage nodes for the destructured binding identifiers
    # themselves; they only appear as definitions on the left-hand side.
    usages = _collect_nodes(graph, "usage")
    usage_labels = {u["labels"][0]["text"] for u in usages}
    assert not any("showColumnPicker" in label for label in usage_labels)
    assert not any("setShowColumnPicker" in label for label in usage_labels)

    # On the declaration line, the variable definition nodes should appear
    # before the usage node for createSignal so that the visual ordering is
    # "declaration first, then dependent call".
    decl_line = None
    for v in vars_:
        if "showColumnPicker" in v["labels"][0]["text"]:
            decl_line = v.get("startLine")
            break

    assert isinstance(decl_line, int)

    # Find the synthetic declaration cluster for this line.
    def _find_declaration_cluster(node, line):
        for child in node.get("children", []) or []:
            if child.get("type") == "declaration" and child.get("startLine") == line:
                return child
            found = _find_declaration_cluster(child, line)
            if found is not None:
                return found
        return None

    decl_cluster = _find_declaration_cluster(graph, decl_line)
    assert decl_cluster is not None, "Expected a declaration cluster for the signal line"

    same_line_children = [
        c
        for c in decl_cluster.get("children", [])
        if c.get("type") in {"variable", "usage"}
    ]
    assert same_line_children, "Expected at least variable + usage on declaration line"

    # All variable nodes for that line should come before any usage nodes.
    seen_usage = False
    for child in same_line_children:
        if child.get("type") == "usage":
            seen_usage = True
        if child.get("type") == "variable":
            # Once we've seen a usage, we should not see another variable.
            assert not seen_usage


