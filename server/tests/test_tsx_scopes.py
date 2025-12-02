
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

def test_tsx_scopes_complex(tmp_path):
    analyzer = TreeSitterAnalyzer()

    code = """
    function MyComp() {
        return (
            <div className="container">
                <span>Simple Text</span>
                <button onClick={() => console.log('clicked')}>
                    Click Me
                </button>
                <List>
                    <Item onSelect={function(id) { handle(id) }} />
                </List>
            </div>
        );
    }
    """

    f = tmp_path / "test_tsx.tsx"
    f.write_text(code, encoding="utf-8")

    metrics = analyzer.analyze_file(str(f))
    
    # Find MyComp
    my_comp = next((fn for fn in metrics.function_list if fn.name == "MyComp"), None)
    assert my_comp is not None

    # There should now be a single virtual TSX root node that groups all JSX scopes.
    # Its name should reflect the actual top-level TSX element (<div> in this case),
    # not a generic "fragment" label.
    fragment_scope = next((c for c in my_comp.children if c.name == "<div>"), None)
    assert fragment_scope is not None, "Expected a top-level <div> node for TSX content"

    # The TSX fragment should span the entire TSX region, not just the nested
    # JSX scopes that define handlers. In this fixture, the opening <div> is
    # on the 4th non-empty line (see RAW CODE in debugging output), and the
    # corresponding closing tag is on line 12.
    assert fragment_scope.start_line == 4
    assert fragment_scope.end_line == 12

    # The <button> has an onClick function, so it SHOULD be a scope under the fragment
    button_scope = next((c for c in fragment_scope.children if "button" in c.name), None)
    assert button_scope is not None, "Button with onClick should be a scope"
    
    # The onClick arrow function should be a child of the button scope
    onclick_scope = next((c for c in button_scope.children if "onClick" in c.name or "anonymous" in c.name), None)
    assert onclick_scope is not None, "onClick function should be a child of button"
    
    # <Item> has onSelect, so it should be a scope under the fragment.
    item_scope = next((c for c in fragment_scope.children if "Item" in c.name), None)
    assert item_scope is not None, "Item should be a scope"
    
    # onSelect function should be a child of the <Item> scope
    onselect_scope = next((c for c in item_scope.children if "onSelect" in c.name or "function" in c.name), None)
    assert onselect_scope is not None, "onSelect function should be a child of Item"

def test_tsx_scopes_simple(tmp_path):
    analyzer = TreeSitterAnalyzer()
    
    code = """
    const Simple = () => (
        <div>
            <span>Hello</span>
            <p>World</p>
        </div>
    );
    """
    
    f = tmp_path / "simple.tsx"
    f.write_text(code, encoding="utf-8")
    
    metrics = analyzer.analyze_file(str(f))
    
    simple = next((fn for fn in metrics.function_list if "Simple" in fn.name), None)
    assert simple is not None
    
    # Even for a simple TSX component, we should expose a single virtual TSX root
    # so that all TSX content is grouped together, even if there are no nested scopes.
    # The virtual root should be named after the real top-level element (<div> here),
    # and only show "fragment" when the TSX root is actually a `<>` fragment.
    assert len(simple.children) == 1, "Simple component should expose a single TSX root child"
    fragment = simple.children[0]
    assert fragment.name == "<div>"
    # For the simple TSX component, the virtual root should span exactly the
    # TSX region (the <div> block), which in this fixture lives on lines 3–6.
    assert fragment.start_line == 3
    assert fragment.end_line == 6
    assert len(fragment.children) == 0, "Simple TSX root should have no nested scopes"


def test_tsx_scopes_nested_show_does_not_rename_root(tmp_path):
    """
    When a component defines an inner helper that returns <Show> before the main
    TSX return block, the virtual TSX root for the outer component should still
    be named after the true top-level element (<ExplorerContext.Provider>), not
    the inner <Show>.
    """
    analyzer = TreeSitterAnalyzer()

    code = """
    function Explorer() {
        const SortIcon = (p) => (
            <Show when={true}>
                <span>Icon</span>
            </Show>
        );

        return (
            <ExplorerContext.Provider value={{}}>
                <div>
                    <Show when={true}>
                        <span>Body</span>
                    </Show>
                </div>
            </ExplorerContext.Provider>
        );
    }
    """

    f = tmp_path / "explorer_like.tsx"
    f.write_text(code, encoding="utf-8")

    metrics = analyzer.analyze_file(str(f))

    explorer = next((fn for fn in metrics.function_list if fn.name == "Explorer"), None)
    assert explorer is not None

    # The Explorer component should expose a single virtual TSX root child named
    # after the real top-level element (<ExplorerContext.Provider>), even though
    # there is an inner helper that returns <Show>.
    tsx_root = next((c for c in explorer.children if c.origin_type == "jsx_virtual_root"), None)
    assert tsx_root is not None, "Expected a virtual TSX root for Explorer"
    assert tsx_root.name == "<ExplorerContext.Provider>"

    # The inner helper SortIcon should still have its own TSX root named <Show>.
    sort_icon = next((c for c in explorer.children if c.name == "SortIcon"), None)
    assert sort_icon is not None, "Expected SortIcon helper function"
    sort_icon_tsx = next((c for c in sort_icon.children if c.origin_type == "jsx_virtual_root"), None)
    assert sort_icon_tsx is not None, "Expected a virtual TSX root for SortIcon"
    assert sort_icon_tsx.name == "<Show>"

