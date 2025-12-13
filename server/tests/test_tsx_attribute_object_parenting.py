import pytest

from app.services.typescript.typescript_analysis import TreeSitterAnalyzer


@pytest.fixture
def analyzer():
    return TreeSitterAnalyzer()


def _find_node_by_name(root, name: str):
    if root.name == name:
        return root
    for child in getattr(root, "children", []) or []:
        found = _find_node_by_name(child, name)
        if found is not None:
            return found
    return None


def test_tsx_attribute_object_literal_parent_is_owning_element(analyzer, tmp_path):
    """
    Regression test for TSX attribute expressions like:

      <TapestryNode class={classy(..., { wireframe: () => props.wireframe })} />

    The object literal scope ("object") should be associated with the owning
    TSX element (<TapestryNode />), not with an outer parent container (<div>).
    """
    content = """
    type Props = { mode: string; wireframe: boolean };

    function classy(..._args: any[]) { return ""; }
    function entityTypeClass() { return "x"; }
    function emphasized() { return false; }
    function arePropRelsVisible() { return false; }
    function isSelected() { return false; }
    function isHovered() { return false; }
    function entityType() { return "t"; }

    function App(props: Props) {
      const dimmed = false;
      return (
        <div onClick={() => console.log("x")}>
          <TapestryNode
            class={classy(
              entityTypeClass(),
              props.mode,
              dimmed,
              {
                wireframe: () => props.wireframe,
                emphasized: emphasized(),
                exploded: arePropRelsVisible(),
              },
            )}
            data-state={isSelected() ? "selected" : isHovered() ? "hovered" : undefined}
            data-type={entityType()}
          />
        </div>
      );
    }
    """

    test_file = tmp_path / "test_tsx_attribute_object_parenting.tsx"
    test_file.write_text(content, encoding="utf-8")

    metrics = analyzer.analyze_file(str(test_file))

    app_func = next(f for f in metrics.function_list if f.name == "App")

    # Virtual TSX root inserted for the function
    tsx_root = next(c for c in app_func.children if getattr(c, "origin_type", "") == "jsx_virtual_root")

    div_scope = _find_node_by_name(tsx_root, "<div>")
    assert div_scope is not None, "Expected <div> scope (has onClick handler)"

    tapestry_scope = _find_node_by_name(tsx_root, "<TapestryNode />")
    assert tapestry_scope is not None, "Expected <TapestryNode /> to be a scope due to nested arrow functions in class={...}"

    # The object literal created in the `class={...}` expression should be named
    # after the owning attribute and be under the TapestryNode scope.
    object_scope_under_tapestry = _find_node_by_name(tapestry_scope, "class (obj)")
    assert object_scope_under_tapestry is not None

    # And it should *not* be attributed directly to the outer <div> container scope
    # (it's fine for <div> to contain it transitively via <TapestryNode />).
    assert all(c.name != "class (obj)" for c in div_scope.children)

    # Sanity check: the arrow function for `wireframe: () => ...` should be parented under that object scope.
    wireframe_fn = _find_node_by_name(object_scope_under_tapestry, "wireframe")
    assert wireframe_fn is not None


