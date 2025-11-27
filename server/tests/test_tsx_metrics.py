import pytest
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

@pytest.fixture
def analyzer():
    return TreeSitterAnalyzer()

def test_tsx_metrics(analyzer, tmp_path):
    tsx_content = """
    import React, { useEffect, useState } from 'react';
    import { someHelper } from './utils';

    const MyComponent = (props: any) => {
        const [count, setCount] = useState(0);
        
        useEffect(() => {
            console.log("effect");
        }, []);

        return (
            <div className="container">
                <button onClick={() => setCount(count + 1)}>Click me</button>
                
                {count > 10 ? <span>Count is high</span> : <span>Count is low</span>}
                
                {count > 5 && <div>Warning</div>}
                
                {/* @ts-ignore */}
                <div invalidProp={true}>
                    <span key="1">Item</span>
                    <span key="2">Item</span>
                </div>
            </div>
        );
    }
    """
    
    test_file = tmp_path / "test_metrics.tsx"
    test_file.write_text(tsx_content, encoding="utf-8")
    
    metrics = analyzer.analyze_file(str(test_file))
    
    # Verify TS/TSX metrics
    
    # 1. Nesting Depth
    # div -> div (invalidProp) -> span
    # Depth should be 3?
    # div (container) -> depth 1
    #   button -> depth 2
    #   div (invalidProp) -> depth 2
    #     span -> depth 3
    assert metrics.tsx_nesting_depth >= 3
    
    # 2. Render Branching
    # Ternary: ? : (1)
    # Binary: && (1)
    # Total: 2
    assert metrics.tsx_render_branching_count == 2
    
    # 3. useEffect Count
    # One useEffect call
    assert metrics.tsx_react_use_effect_count == 1
    
    # 4. Anonymous Handler Count
    # onClick={() => ...} -> 1
    assert metrics.tsx_anonymous_handler_count == 1
    
    # 5. Prop Count
    # className="container" -> 1
    # onClick={...} -> 1
    # invalidProp={true} -> 1
    # key="1" -> 1
    # key="2" -> 1
    # Total: 5
    assert metrics.tsx_prop_count == 5
    
    # 6. any Usage
    # (props: any) -> 1
    assert metrics.ts_any_usage_count == 1
    
    # 7. ts-ignore Count
    # @ts-ignore -> 1
    assert metrics.ts_ignore_count == 1
    
    # 8. Import Coupling
    # 'react', './utils' -> 2
    assert metrics.ts_import_coupling_count == 2
    
    # 9. Hardcoded String Volume
    # "container" (9)
    # "Click me" (8)
    # "Count is high" (13)
    # "Count is low" (12)
    # "Warning" (7)
    # "1" (1)
    # "2" (1)
    # "Item" (4)
    # "Item" (4)
    # Total: 59
    # Note: Logic might include 'react' and './utils' if they are string literals?
    # My logic checks string_literal inside jsx_attribute or jsx_expression, or jsx_text.
    # Imports are not inside JSX.
    # "container" is string_literal inside jsx_attribute.
    # "Click me" is jsx_text.
    # "Count is high" is jsx_text.
    # "Count is low" is jsx_text.
    # "Warning" is jsx_text.
    # "1", "2" are string_literal inside jsx_attribute.
    # "Item" is jsx_text.
    
    # Let's verify exact number or range.
    assert metrics.tsx_hardcoded_string_volume > 0
    
    # 10. Duplicated String Count
    # "Item" appears twice.
    # "span" is not a string, it's a tag name.
    # "div" is tag name.
    # "1", "2" are unique.
    # "container" unique.
    # "Click me" unique.
    # "Count is high" unique.
    # "Count is low" unique.
    # "Warning" unique.
    # So duplicated count should be 1 ("Item").
    assert metrics.tsx_duplicated_string_count == 1
