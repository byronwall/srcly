from app.services.tree_sitter_analysis import TreeSitterAnalyzer

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
    assert len(metrics.function_list) == 2
    
    add_func = next(func for func in metrics.function_list if func.name == "add")
    assert add_func.cyclomatic_complexity == 2 # 1 (base) + 1 (if)
    
    complex_func = next(func for func in metrics.function_list if func.name == "complex")
    # 1 (base) + 1 (if) + 1 (for) + 1 (else if) = 4
    assert complex_func.cyclomatic_complexity == 4

def test_tsx_analysis(tmp_path):
    f = tmp_path / "test.tsx"
    f.write_text(TSX_CODE, encoding="utf-8")
    
    analyzer = TreeSitterAnalyzer()
    metrics = analyzer.analyze_file(str(f))
    
    assert metrics.nloc > 0
    
    # We expect a single top-level function: App
    assert len(metrics.function_list) == 1
    
    app_func = next(func for func in metrics.function_list if func.name == "App")
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
    
    outer = next(func for func in metrics.function_list if func.name == "outer")
    inner = next(func for func in outer.children if func.name == "inner")
    
    # Outer: 1 (base) + 1 (if) = 2. Should NOT count inner's if.
    assert outer.cyclomatic_complexity == 2
    
    # Inner: 1 (base) + 1 (if) = 2.
    assert inner.cyclomatic_complexity == 2
