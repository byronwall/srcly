"""React and Solid component metrics (fixtures: tests/fixtures/components)."""

import shutil
from pathlib import Path

import pytest

from app.models import Node
from app.services import analysis, reporting
from app.services.analysis_types import COMPONENT_METRICS

FIXTURE = Path(__file__).parent / "fixtures" / "components"


def _find(node: Node, *names: str) -> Node:
    for name in names:
        node = next((c for c in node.children if c.name == name), None) or pytest.fail(f"{name} missing")
    return node


def _scopes(node: Node):
    for child in node.children:
        yield child
        yield from _scopes(child)


def _component(file_node: Node, name: str) -> Node:
    return next(n for n in _scopes(file_node) if n.name == name and n.kind == "function")


@pytest.fixture(scope="module")
def tree(tmp_path_factory) -> Node:
    root = tmp_path_factory.mktemp("components")
    shutil.copytree(FIXTURE, root, dirs_exist_ok=True)
    (root / "util.ts").write_text("export const twice = (n: number) => n * 2;\n")
    (root / "plain.tsx").write_text("export function helper() { return 1; }\n")
    return analysis.scan_codebase(root, verbose=False)


def test_god_component_metrics(tree: Node) -> None:
    god = _component(_find(tree, "react", "OrderDashboard.tsx"), "OrderDashboard")
    m = god.metrics
    assert m.component_hook_count == 11
    assert m.component_effect_count == 3  # 2x useEffect, useLayoutEffect
    assert m.component_inline_handler_count == 7
    assert m.component_jsx_conditional_count == 6
    assert m.component_jsx_depth == 7  # section > table > tbody > tr > td > span > strong
    assert m.component_prop_count == 9  # 7 own + 2 from BaseProps
    assert m.component_loc == 67


def test_file_value_is_the_max_and_names_its_component(tree: Node) -> None:
    file_node = _find(tree, "react", "OrderDashboard.tsx")
    assert file_node.metrics.component_hook_count == 11
    for metric in COMPONENT_METRICS:
        witness = file_node.metrics.witnesses[metric]
        assert witness.name == "OrderDashboard"
        assert witness.start_line == 22
    # A file with no components is N/A, not 0, and says why.
    plain = _find(tree, "plain.tsx")
    assert plain.metrics.component_loc is None
    assert plain.metrics.na_reason == "Not measured for TSX files; No React/Solid components in this file"
    # Component metrics don't apply to .ts at all.
    assert _find(tree, "util.ts").metrics.component_hook_count is None


def test_folder_rolls_up_the_max_with_its_witness(tree: Node) -> None:
    assert tree.metrics.component_hook_count == 11
    assert tree.metrics.witnesses["component_hook_count"].name == "OrderDashboard"
    # Solid's Counter has the most JSX conditionals among Solid components.
    solid = _find(tree, "solid")
    assert solid.metrics.witnesses["component_jsx_conditional_count"].name == "Counter"


def test_non_components_carry_no_component_metrics(tree: Node) -> None:
    small = _find(tree, "react", "Small.tsx")
    fmt = _component(small, "formatLabel")
    assert fmt.metrics.component_loc is None
    assert "components only" in fmt.metrics.na_reason


def test_wrapped_and_untyped_components(tree: Node) -> None:
    small = _find(tree, "react", "Small.tsx")
    toggle = _component(small, "Toggle")  # memo(function Toggle(...))
    assert (toggle.metrics.component_hook_count, toggle.metrics.component_prop_count) == (1, 2)
    field = _component(small, "Field")  # forwardRef(...) renamed from "forwardRef(ƒ)"
    assert field.metrics.component_prop_count == 1  # reads props.name
    heading = _component(small, "Heading")  # untyped props: distinct reads
    assert heading.metrics.component_prop_count == 2
    button = _component(small, "Button")  # destructured, type resolved
    assert button.metrics.component_prop_count == 2


def test_solid_components(tree: Node) -> None:
    solid = _find(tree, "solid", "Counter.tsx")
    counter = _component(solid, "Counter").metrics
    assert counter.component_hook_count == 3  # createSignal, createMemo, createEffect
    assert counter.component_effect_count == 1
    assert counter.component_jsx_conditional_count == 3  # <Show>, 2x <Match>
    assert counter.component_prop_count == 3  # Component<CounterProps>
    assert counter.component_inline_handler_count == 1
    panel = _component(solid, "Panel").metrics
    assert panel.component_prop_count == 1  # ParentProps<{ title }>


@pytest.mark.parametrize("cohort", ["file", "function"])
def test_god_component_ranks_first_on_component_metrics(tree: Node, cohort: str) -> None:
    ranked = reporting.rank_nodes(tree, profile="frontend", cohort=cohort)
    expected = "OrderDashboard.tsx" if cohort == "file" else "OrderDashboard"
    assert ranked[0]["name"] == expected
    for metric in COMPONENT_METRICS:
        top = max((n for n in reporting.cohort_nodes(tree, cohort) if getattr(n.metrics, metric) is not None), key=lambda n: getattr(n.metrics, metric))
        assert expected == top.name, metric


def test_report_evidence_names_the_component(tree: Node) -> None:
    ranked = reporting.rank_nodes(tree, profile="frontend", cohort="file")
    findings = reporting.build_findings(ranked, limit=3)
    assert findings[0]["witnesses"]["component_hook_count"]["name"] == "OrderDashboard"
    assert "component_hook_count=11 in `OrderDashboard` (line 22)" in reporting._format_evidence(findings[0])
