import pytest
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

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
    
    # The file-level TS counts.
    assert metrics.ts_any_usage_count == 1  # (props: any)
    assert metrics.ts_ignore_count == 1
    assert metrics.ts_import_coupling_count == 2  # 'react', './utils'

    # MyComponent is a component; its metrics live on its scope.
    component = next(f for f in metrics.function_list if f.name == "MyComponent")
    assert component.component_hook_count == 2  # useState, useEffect
    assert component.component_effect_count == 1
    assert component.component_inline_handler_count == 1  # onClick={() => ...}
    # `?:` choosing between two <span>s and `count > 5 && <div>`.
    assert component.component_jsx_conditional_count == 2
    # div > div > span
    assert component.component_jsx_depth == 3
    # `props: any` declares nothing; `props` is never read.
    assert component.component_prop_count == 0
