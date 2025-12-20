from app.services.focus_overlay import compute_focus_overlay

def _token_text(code: str, token) -> str:
    lines = code.splitlines()
    line = lines[token.fileLine - 1]
    return line[token.startCol : token.endCol]

def test_unresolved_literals(tmp_path):
    code = """
    const [showExportedMembers, setShowExportedMembers] = createSignal(false);
    const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);
    const [activeNodeId, setActiveNodeId] = createSignal<string | null>(true);
    """
    f = tmp_path / "test.tsx"
    f.write_text(code, encoding="utf-8")

    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=10,
        focus_start_line=1,
        focus_end_line=10,
    )

    unresolved = [t for t in overlay.tokens if t.category == "unresolved"]
    unresolved_texts = [_token_text(code, t) for t in unresolved]
    
    # We expect true, false, null, and undefined to NOT be in unresolved.
    assert "false" not in unresolved_texts
    assert "null" not in unresolved_texts
    assert "true" not in unresolved_texts
    assert "undefined" not in unresolved_texts
    
    # Verify they aren't in ANY category
    all_texts = [_token_text(code, t) for t in overlay.tokens]
    assert "false" not in all_texts
    assert "null" not in all_texts
    assert "true" not in all_texts
    assert "undefined" not in all_texts

if __name__ == "__main__":
    import pytest
    pytest.main([__file__])
