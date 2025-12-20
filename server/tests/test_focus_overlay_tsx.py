
from app.services.focus_overlay import compute_focus_overlay

def test_tsx_refined_overlay(tmp_path):
    code = """
    function DependencyGraph() { return <div />; }
    function Show(props) { return props.children; }

    function MyComponent() {
        const localVal = 1;
        return (
            <div ref={localVal} className="flex">
                <Show when={true}>
                  <DependencyGraph />
                </Show>
            </div>
        );
    }
    """
    f = tmp_path / "RefinedComponent.tsx"
    f.write_text(code, encoding="utf-8")
    
    result = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=20,
        focus_start_line=1,
        focus_end_line=20,
    )
    
    tokens = result.tokens
    symbols = [t.symbolId for t in tokens]
    token_map = {t.symbolId.split(":")[-1]: t for t in tokens} # heuristic name key

    print("\nTokens:")
    for t in tokens:
        print(f"  {t.fileLine}:{t.startCol}-{t.endCol} {t.category} {t.symbolId}")

    # 1. DependencyGraph should be present and RESOLVED (local)
    assert any("DependencyGraph" in s for s in symbols), "DependencyGraph missing"
    # It should be local because it is defined in the file
    dg = [t for t in tokens if "DependencyGraph" in t.symbolId and t.fileLine >= 10][0] # usage
    assert dg.category in ("local", "module"), f"Expected local/module resolution, got {dg.category}"

    # 2. Show should be present
    assert any("Show" in s for s in symbols), "Show missing"

    # 3. 'div' should NOT be present (lowercase intrinsic)
    assert not any(":div" in s for s in symbols), "Intrinsic 'div' should be skipped"

    # 4. 'ref', 'className', 'when' should NOT be present (attributes)
    # Note: 'ref' might match 'localVal' usage inside it, but the ATTRIBUTE name 'ref' should not be a token.
    # The usage of `localVal` inside `ref={localVal}` SHOULD be a token.
    
    # We check that we don't have tokens that are EXACTLY 'ref' or 'className' and unresolved
    # (Attributes won't resolve to variables, so they would be unresolved if processed)
    assert not any("unresolved:ref" in s for s in symbols), "Attribute 'ref' should be skipped"
    assert not any("unresolved:className" in s for s in symbols), "Attribute 'className' should be skipped"
    assert not any("unresolved:when" in s for s in symbols), "Attribute 'when' should be skipped"

