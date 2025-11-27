import pytest
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

@pytest.fixture
def analyzer():
    return TreeSitterAnalyzer()

def test_anonymous_function_naming(analyzer, tmp_path):
    content = """
    function main() {
        // Case 1: Anonymous function in sort
        [1, 2].sort((a, b) => a - b);

        // Case 2: Anonymous function in map
        items.map(function(item) { return item.id; });

        // Case 3: Assigned to variable (should be named 'myFunc')
        const myFunc = () => {};

        // Case 4: Object property (should be named 'myMethod')
        const obj = {
            myMethod: () => {}
        };
        
        // Case 5: Deeply nested call
        foo.bar.baz(() => {});
        
        // Case 6: IIFE
        const value = (() => {
            return 42;
        })();
    }
    """
    
    test_file = tmp_path / "test_naming.ts"
    test_file.write_text(content, encoding="utf-8")
    
    metrics = analyzer.analyze_file(str(test_file))
    
    main_func = metrics.function_list[0]
    children = main_func.children
    
    # We expect 6 children corresponding to the 6 functions above
    assert len(children) == 6
    
    names = [c.name for c in children]
    
    # Current behavior (expected to fail after changes, but for now let's see what we get)
    # I'll write assertions for the DESIRED behavior
    
    # Case 1: sort((a, b) => a - b) -> sort(ƒ)
    assert "sort(ƒ)" in names
    
    # Case 2: map(function(item) ...) -> map(ƒ)
    assert "map(ƒ)" in names
    
    # Case 3: const myFunc = ... -> myFunc
    assert "myFunc" in names
    
    # Case 4: myMethod: ... -> myMethod
    assert "myMethod" in names
    
    # Case 5: foo.bar.baz(() => {}) -> baz(ƒ)
    assert "baz(ƒ)" in names
    
    # Case 6: (() => { ... })() -> IIFE(ƒ)
    assert "IIFE(ƒ)" in names


def test_tsx_attribute_function_naming(analyzer, tmp_path):
    content = """
    import React from 'react';

    function App() {
        return (
            <input
                onFocus={(e) => {
                    if (window.innerWidth > 1024) {
                        e.target.select();
                    }
                }}
            />
        );
    }
    """

    test_file = tmp_path / "test_naming_tsx.tsx"
    test_file.write_text(content, encoding="utf-8")

    metrics = analyzer.analyze_file(str(test_file))

    # In this simple example, we expect one top-level function: App
    assert len(metrics.function_list) == 1

    app_func = metrics.function_list[0]
    children = app_func.children

    # We expect a single child function for the onFocus handler
    assert len(children) == 1
    assert children[0].name == "onFocus"


def test_tsx_nested_attribute_handler_naming(analyzer, tmp_path):
    content = """
    import { createSignal } from 'solid-js';

    function App() {
        const [value, setValue] = createSignal('');

        return (
            <input
                value={value()}
                onChange={() =>
                    run((ch) => {
                        // TODO:AS_ANY, table chain commands come from table extension
                        (ch as unknown as any).addColumnAfter();
                        return ch;
                    })
                }
            />
        );
    }
    """

    test_file = tmp_path / "test_nested_handler.tsx"
    test_file.write_text(content, encoding="utf-8")

    metrics = analyzer.analyze_file(str(test_file))

    # One top-level component function: App
    assert len(metrics.function_list) == 1
    app_func = metrics.function_list[0]
    assert app_func.name == "App"

    # The first child should be the onChange handler
    assert len(app_func.children) == 1
    on_change = app_func.children[0]
    assert on_change.name == "onChange"

    # And its child should be the inner callback passed to run
    assert len(on_change.children) == 1
    inner = on_change.children[0]
    # Currently this incorrectly comes back as "onChange"
    # We want it to be named after the called function.
    assert inner.name == "run(ƒ)"

def test_tsx_component_child_naming(analyzer, tmp_path):
    content = """
    import { Show, For } from 'solid-js';

    function Chat(props) {
        return (
            <Show when={props.thread()}>
                {(th) => (
                    <For each={th().messages}>
                        {(m) => (
                            <div class="border rounded p-3">
                                {m.role}
                            </div>
                        )}
                    </For>
                )}
            </Show>
        );
    }
    """

    test_file = tmp_path / "test_naming_solid.tsx"
    test_file.write_text(content, encoding="utf-8")

    metrics = analyzer.analyze_file(str(test_file))
    
    # Top level function Chat
    assert len(metrics.function_list) == 1
    chat_func = metrics.function_list[0]
    assert chat_func.name == "Chat"
    
    children = chat_func.children
    # We expect 2 nested functions:
    # 1. The one inside <Show>
    # 2. The one inside <For> (which is nested inside the first one)
    
    # However, my current logic flattens the list of children in the metrics object returned by analyze_file?
    # No, analyze_file returns FileMetrics which has function_list (top level).
    # Each FunctionMetrics has children.
    
    # The structure should be:
    # Chat -> [ Show_func -> [ For_func ] ]
    
    assert len(children) == 1
    show_func = children[0]
    
    # This is what we want to fix. Currently it probably returns "(anonymous)"
    # We want "Show(ƒ)"
    assert show_func.name == "<Show>(ƒ)"
    
    assert len(show_func.children) == 1
    for_func = show_func.children[0]
    
    # We want "For(ƒ)"
    assert for_func.name == "<For>(ƒ)"

