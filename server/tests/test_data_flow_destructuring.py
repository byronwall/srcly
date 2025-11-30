from app.services.data_flow_analysis import DataFlowAnalyzer


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
    # for the same identifiers on the left-hand side.
    root_children = graph["children"]
    vars_ = [c for c in root_children if c.get("type") == "variable"]
    var_labels = {v["labels"][0]["text"] for v in vars_}

    assert any("showColumnPicker" in label for label in var_labels)
    assert any("setShowColumnPicker" in label for label in var_labels)

    # There should be no usage nodes for the destructured binding identifiers
    # themselves; they only appear as definitions on the left-hand side.
    usages = [c for c in root_children if c.get("type") == "usage"]
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

    same_line_children = [
        c
        for c in root_children
        if c.get("startLine") == decl_line and c.get("type") in {"variable", "usage"}
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


