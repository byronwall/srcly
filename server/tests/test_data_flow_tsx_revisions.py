
from app.services.data_flow_analysis import DataFlowAnalyzer

def test_tsx_revisions(tmp_path):
    analyzer = DataFlowAnalyzer()

    code = """
    import { createSignal, onCleanup, Show } from 'solid-js';

    export default function Toast(props: ToastProps) {
      const [visible, setVisible] = createSignal(true);
      const duration = props.duration ?? 3000;
      const hide = () => setVisible(false);
      const timer = setTimeout(hide, duration);
      onCleanup(() => clearTimeout(timer));

      return (
        <Show when={visible()}>
          <div
            class={`fixed bottom-4 right-4 max-w-xs px-4 py-2 rounded shadow-lg text-white z-50 ${
              props.type === "error" ? "bg-red-600" : "bg-green-600"
            }`}
          >
            {props.message}
          </div>
        </Show>
      );
    }
    """

    f = tmp_path / "Toast.tsx"
    f.write_text(code, encoding="utf-8")

    graph = analyzer.analyze_file(str(f))

    # Helper to find nodes
    def find_scope(node, label):
        if node.get('labels', [{'text': ''}])[0]['text'] == label:
            return node
        for child in node.get('children', []):
            if child['type'] not in ('usage', 'variable'):
                found = find_scope(child, label)
                if found:
                    return found
        return None

    def find_usage(scope, label):
        for child in scope.get('children', []):
            if child['type'] == 'usage' and child['labels'][0]['text'] == label:
                return child
        return None

    # 1. Verify <Show> scope does NOT contain "Show" usage
    show_scope = find_scope(graph, "<Show>")
    assert show_scope is not None, "Could not find <Show> scope"
    
    show_usage = find_usage(show_scope, "Show")
    assert show_usage is None, "Found 'Show' usage inside <Show> scope"

    # 2. Verify <div> scope does NOT contain "div" usage
    div_scope = find_scope(graph, "<div>")
    assert div_scope is not None, "Could not find <div> scope"

    div_usage = find_usage(div_scope, "div")
    assert div_usage is None, "Found 'div' usage inside <div> scope"

    # 3. Verify 'visible' usage has 'when' attribute
    # It should be in the <Show> scope
    visible_usage = find_usage(show_scope, "when: visible")
    assert visible_usage is not None, "Could not find 'when: visible' usage"
