
from app.services.focus_overlay import compute_focus_overlay

def test_closure_scope_loose_selection(tmp_path):
    code = """
    function MyComponent() {
        const [highlightedHtml, setHighlightedHtml] = createSignal("");
        
        createEffect(() => {
            setHighlightedHtml("foo");
        });
    }
    """
    f = tmp_path / "LooseSelection.tsx"
    f.write_text(code, encoding="utf-8")
    
    # createEffect is lines 5-7.
    # Line 5: createEffect(() => {
    # Line 6:     setHighlightedHtml("foo");
    # Line 7: });
    
    # Test 1: Exact selection (Should be CAPTURE)
    result_exact = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=10,
        focus_start_line=5,
        focus_end_line=7,
    )
    token_exact = next((t for t in result_exact.tokens if "setHighlightedHtml" in t.symbolId and t.fileLine == 6), None)
    assert token_exact and token_exact.category == "capture", f"Exact selection should be capture. Got {token_exact.category}"

    # Test 2: Loose selection (include line 8, which is empty/closing brace of parent?)
    # Line 8 is "    }" (closing MyComponent)
    # Selecting 5-8 includes the closing brace of Outer function.
    # Expected: Local (because we are looking at Outer function scope now)
    # BUT, if the user finds this annoying, we might want to still prioritize Inner if possible?
    
    # Let's try selecting 5-7 + slightly more?
    # Say focus_end_line = 8.
    
    result_loose = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=10,
        focus_start_line=5,
        focus_end_line=8,
    )
    token_loose = next((t for t in result_loose.tokens if "setHighlightedHtml" in t.symbolId and t.fileLine == 6), None)
    
    # I suspect this will be 'local' currently.
    # If the user considers this a bug, we should change it to 'capture'.
    print(f"Loose selection (5-8) category: {token_loose.category}")
    
    # If I want to "fix" this, I should make it capture.
    # Uncomment assertion if I decide this is the failure mode.
    assert token_loose.category == "capture"
