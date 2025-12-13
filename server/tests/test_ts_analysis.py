from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

# Create a simple TypeScript code snippet
TYPESCRIPT_CODE = """
function add(a: number, b: number): number {
    if (a > 0) {
        return a + b;
    }
    return b;
}

function complex(x: number) {
    if (x > 10) {
        for (let i = 0; i < x; i++) {
            console.log(i);
        }
    } else if (x < 0) {
        return 0;
    }
    return x;
}
"""

TSX_CODE = """
import React from 'react';

function App() {
    const handleClick = () => {
        if (true) {
            console.log("clicked");
        }
    };

    return (
        <div className="App">
            <header className="App-header">
                <p>
                    Hello, world!
                </p>
            </header>
        </div>
    );
}

export default App;
"""

def test_typescript_analysis(tmp_path):
    f = tmp_path / "test.ts"
    f.write_text(TYPESCRIPT_CODE, encoding="utf-8")
    
    analyzer = TreeSitterAnalyzer()
    metrics = analyzer.analyze_file(str(f))
    
    assert metrics.nloc > 0
    # Import scopes are represented as a synthetic "(imports)" node.
    function_scopes = [fn for fn in metrics.function_list if fn.name != "(imports)"]
    assert len(function_scopes) == 2
    
    add_func = next(func for func in function_scopes if func.name == "add")
    assert add_func.cyclomatic_complexity == 2 # 1 (base) + 1 (if)
    
    complex_func = next(func for func in function_scopes if func.name == "complex")
    # 1 (base) + 1 (if) + 1 (for) + 1 (else if) = 4
    assert complex_func.cyclomatic_complexity == 4

def test_tsx_analysis(tmp_path):
    f = tmp_path / "test.tsx"
    f.write_text(TSX_CODE, encoding="utf-8")
    
    analyzer = TreeSitterAnalyzer()
    metrics = analyzer.analyze_file(str(f))
    
    assert metrics.nloc > 0
    
    # We expect a single top-level function: App
    function_scopes = [fn for fn in metrics.function_list if fn.name != "(imports)"]
    assert len(function_scopes) == 1
    
    app_func = next(func for func in function_scopes if func.name == "App")
    # App has handleClick defined inside it, which should appear as a child function.
    # App itself has no control flow (complexity 1).
    assert app_func.cyclomatic_complexity == 1
    
    handle_click = next(func for func in app_func.children if func.name == "handleClick")
    # 1 (base) + 1 (if) = 2
    assert handle_click.cyclomatic_complexity == 2

def test_nested_functions(tmp_path):
    code = """
    function outer() {
        if (true) {}
        function inner() {
            if (false) {}
        }
    }
    """
    f = tmp_path / "nested.ts"
    f.write_text(code, encoding="utf-8")
    
    analyzer = TreeSitterAnalyzer()
    metrics = analyzer.analyze_file(str(f))
    
    function_scopes = [fn for fn in metrics.function_list if fn.name != "(imports)"]
    outer = next(func for func in function_scopes if func.name == "outer")
    inner = next(func for func in outer.children if func.name == "inner")
    
    # Outer: 1 (base) + 1 (if) = 2. Should NOT count inner's if.
    assert outer.cyclomatic_complexity == 2
    
    # Inner: 1 (base) + 1 (if) = 2.
    assert inner.cyclomatic_complexity == 2


def test_import_scope_loc_and_largest_block_ts_tsx(tmp_path):
    """
    We create imports in two separate blocks. The analyzer should:
    - sum LOC across all import statements into (imports).nloc
    - set (imports).start/end_line to the largest contiguous import block
    """
    code = """import A from 'a';
const z = 1;
import { B } from 'b';
import { C } from 'c';
import { D } from 'd';
export function run() { return z; }
"""

    analyzer = TreeSitterAnalyzer()
    for ext in ("ts", "tsx"):
        f = tmp_path / f"imports.{ext}"
        f.write_text(code, encoding="utf-8")
        metrics = analyzer.analyze_file(str(f))

        imp = next((fn for fn in metrics.function_list if fn.name == "(imports)"), None)
        assert imp is not None
        assert imp.nloc == 4  # 1 import at top + 3 in the contiguous block
        assert imp.start_line == 3
        assert imp.end_line == 5


def test_import_scope_allows_blank_lines_in_block_ts(tmp_path):
    code = """import A from 'a';

import { B } from 'b';
const x = 1;
"""
    f = tmp_path / "blank_imports.ts"
    f.write_text(code, encoding="utf-8")

    analyzer = TreeSitterAnalyzer()
    metrics = analyzer.analyze_file(str(f))

    imp = next((fn for fn in metrics.function_list if fn.name == "(imports)"), None)
    assert imp is not None
    # Total import LOC counts only import statements (not the blank line).
    assert imp.nloc == 2
    # The "largest contiguous import block" should span across the blank line.
    assert imp.start_line == 1
    assert imp.end_line == 3
