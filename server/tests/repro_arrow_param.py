from app.services.focus_overlay import compute_focus_overlay

def _token_text(code: str, token) -> str:
    lines = code.splitlines()
    line = lines[token.fileLine - 1]
    return line[token.startCol : token.endCol]

def test_repro_arrow_function_parameter(tmp_path):
    code = """\
const vizSubs = tileLineageSummaries.map(tile => ({
  title: tile.title,
}));
"""
    f = tmp_path / "repro.ts"
    f.write_text(code, encoding="utf-8")

    overlay = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=10,
        focus_start_line=2,
        focus_end_line=2,
    )

    tile_tokens = [t for t in overlay.tokens if _token_text(code, t) == "tile"]
    # We expect 3 tokens for 'tile':
    # 1. definition (binding) - though binding tokens are currently filtered out in phase2_traverse if they are definitions
    # 2. usage in `tile.title`
    # Wait, phase2_traverse skips definitions.
    
    # In the code:
    # const vizSubs = tileLineageSummaries.map(tile => ({
    #   title: tile.title,
    # }));
    #
    # `tile` (binding) is at line 1.
    # `tile` (usage) is at line 2.
    
    # Let's see if the usage at line 2 is resolved.
    usages = [t for t in overlay.tokens if t.fileLine == 2 and _token_text(code, t) == "tile"]
    assert usages, "Should find at least one 'tile' token on line 2"
    for u in usages:
        assert u.category == "param", f"Expected 'param' category, but got {u.category} for symbol {u.symbolId}"

if __name__ == "__main__":
    import pytest
    pytest.main([__file__])
