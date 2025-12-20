
from app.services.focus_overlay import compute_focus_overlay
from pathlib import Path

def test_captured_variable_info(tmp_path):
    code = """
    function outerFunction(a) {
        const capturedVar = 10;
        function innerFunction() {
            console.log(capturedVar);
            console.log(a);
        }
        return innerFunction;
    }
    """
    f = tmp_path / "test_capture.ts"
    f.write_text(code, encoding="utf-8")
    
    # Focus on the 'console.log(capturedVar)' line (line 5)
    result = compute_focus_overlay(
        file_path=str(f),
        slice_start_line=1,
        slice_end_line=10,
        focus_start_line=4,
        focus_end_line=7,
    )
    
    tokens = result.tokens
    for t in tokens:
        if t.fileLine == 5 and "capturedVar" in t.symbolId:
            print(f"\nToken for 'capturedVar' on line {t.fileLine}:")
            print(f"  Category: {t.category}")
            print(f"  Tooltip: {t.tooltip}")
            print(f"  DefSnippet: {t.definitionSnippet}")
            print(f"  DefLine: {t.definitionLine}")
            print(f"  ScopeSnippet: {t.scopeSnippet}")
            print(f"  ScopeLine: {t.scopeLine}")

    for t in tokens:
        if t.fileLine == 6 and "a" in t.symbolId:
            print(f"\nToken for 'a' on line {t.fileLine}:")
            print(f"  Category: {t.category}")
            print(f"  Tooltip: {t.tooltip}")
            print(f"  DefSnippet: {t.definitionSnippet}")
            print(f"  DefLine: {t.definitionLine}")

if __name__ == "__main__":
    import sys
    from pathlib import Path
    
    # Add server/app to path if needed (usually handled by pytest)
    sys.path.append(str(Path(__file__).parent.parent))
    
    # Simple manual run if called directly
    class MockTmp:
        def __init__(self): self.p = Path("/tmp/repro_capture")
        def __truediv__(self, other): return self.p / other
    
    p = Path("/tmp/repro_capture")
    p.mkdir(exist_ok=True)
    test_captured_variable_info(MockTmp())
