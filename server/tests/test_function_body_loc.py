from app.services.typescript.typescript_analysis import TreeSitterAnalyzer
from app.services.analysis import attach_file_metrics, create_node
from pathlib import Path


def test_function_body_loc_does_not_double_count(tmp_path):
    """
    Ensure that the synthetic "(body)" node only accounts for lines that are
    not already attributed to child scopes. In particular, the parent
    function's LOC should equal the sum of its children's LOC plus the body
    LOC, so there is no double counting.
    """

    code = """
    export const SORT_FIELD_ACCESSORS: Record<
      SortField,
      (node: Node) => string | number
    > = {
      name: (node) => node.name.toLowerCase(),
      loc: (node) => getMetricValue(node, "loc"),
      complexity: (node) => getMetricValue(node, "complexity"),
      file_size: (node) => getMetricValue(node, "file_size"),
      file_count: (node) => getMetricValue(node, "file_count"),
      gitignored: (node) => node.metrics?.gitignored_count ?? 0,
    };
    """

    ts_file = tmp_path / "sort_field_accessors.ts"
    ts_file.write_text(code, encoding="utf-8")

    analyzer = TreeSitterAnalyzer()
    file_metrics = analyzer.analyze_file(str(ts_file))

    # Attach metrics to a file node as the server would.
    file_node = create_node(ts_file.name, "file", str(ts_file))
    attach_file_metrics(file_node, file_metrics)

    # Find the function node that represents the SORT_FIELD_ACCESSORS object.
    target_func = None
    for child in file_node.children:
        if child.type == "function" and "SORT_FIELD_ACCESSORS" in child.name:
            target_func = child
            break

    assert target_func is not None, "Expected a function node for SORT_FIELD_ACCESSORS"

    # There should be a synthetic "(body)" child created by the server.
    body_node = next(
        (c for c in target_func.children if c.name == "(body)"), None
    )
    assert body_node is not None, "Expected a synthetic (body) child node"

    # The parent's LOC should equal the sum of all child LOCs, including body.
    children_loc_sum = sum(c.metrics.loc for c in target_func.children)
    assert (
        children_loc_sum == target_func.metrics.loc
    ), "Parent LOC should equal sum of child LOCs (body + nested scopes)"


