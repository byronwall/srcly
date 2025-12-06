import pytest
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

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
    
    # We expect 6 children corresponding to the 6 function sites above
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
    
    # Case 4: myMethod: ... -> myMethod (nested under the object scope)
    assert "obj (object)" in names
    obj_scope = next(c for c in children if c.name == "obj (object)")
    obj_child_names = [c.name for c in obj_scope.children]
    assert "myMethod" in obj_child_names
    
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

    # We expect a single TSX root child representing the <input /> element.
    assert len(children) == 1
    tsx_root = children[0]
    assert tsx_root.name == "<input />"

    # Under that root we expect the real <input /> scope with the onFocus handler.
    assert len(tsx_root.children) == 1
    input_scope = tsx_root.children[0]
    assert input_scope.name == "<input />"

    handler_names = [c.name for c in input_scope.children]
    assert "onFocus" in handler_names


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

    # The first child should be the TSX root for the <input /> element.
    assert len(app_func.children) == 1
    tsx_root = app_func.children[0]
    assert tsx_root.name == "<input />"

    # Within that root, we expect the real <input /> scope, which in turn has
    # an onChange handler child.
    assert len(tsx_root.children) == 1
    input_scope = tsx_root.children[0]
    assert input_scope.name == "<input />"

    assert len(input_scope.children) == 1
    on_change = input_scope.children[0]
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

    # With TSX grouping, the top-level child of Chat is a virtual TSX root
    # representing the <Show> block.
    assert len(children) == 1
    tsx_root = children[0]
    assert tsx_root.name == "<Show>"

    # Under that root we expect the real <Show> container scope.
    assert any(c.name == "<Show>" for c in tsx_root.children)
    show_scope = next(c for c in tsx_root.children if c.name == "<Show>")

    # Inside the <Show> scope we expect the callback function named "<Show>(ƒ)".
    assert len(show_scope.children) == 1
    show_func = show_scope.children[0]
    assert show_func.name == "<Show>(ƒ)"

    # Inside that function we expect a single TSX root for the <For> block.
    assert len(show_func.children) == 1
    for_tsx_root = show_func.children[0]
    assert for_tsx_root.name == "<For>"

    # Under that root, we expect the real <For> container scope.
    assert any(c.name == "<For>" for c in for_tsx_root.children)
    for_scope = next(c for c in for_tsx_root.children if c.name == "<For>")

    # And under <For>, we expect the callback named "<For>(ƒ)".
    assert len(for_scope.children) == 1
    for_func = for_scope.children[0]
    assert for_func.name == "<For>(ƒ)"

