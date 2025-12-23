import {
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  For,
  Show,
  type Component,
} from "solid-js";

interface SymbolNode {
  id: string;
  name: string;
  kind: string;
  declLine: number;
  isCaptured: boolean;
  isDeclaredHere: boolean;
}

interface ScopeNode {
  id: string;
  kind: string;
  name: string | null;
  startLine: number;
  endLine: number;
  children: ScopeNode[];
  declared: SymbolNode[];
  captured: SymbolNode[];
}

interface ScopeGraph {
  root: ScopeNode;
}

const fetchScopeGraph = async (
  path: string,
  start: number,
  end: number
): Promise<ScopeGraph> => {
  const res = await fetch(
    "http://localhost:8000/api/analysis/focus/scope-graph",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, focusStartLine: start, focusEndLine: end }),
    }
  );
  if (!res.ok) throw new Error("Failed to fetch scope graph");
  return res.json();
};

const SymbolPill: Component<{
  symbol: SymbolNode;
  type: "declared" | "captured";
  isModifierPressed: () => boolean;
  onJumpToLine: (target: { scrollTarget: number }) => void;
}> = (props) => {
  return (
    <span
      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono leading-none border transition-all"
      classList={{
        "bg-blue-900/30 text-blue-200 border-blue-800/50 hover:bg-blue-900/50":
          props.type === "declared",
        "bg-purple-900/30 text-purple-200 border-purple-800/50 hover:bg-purple-900/50":
          props.type === "captured",
        "cursor-pointer underline": props.isModifierPressed(),
        "cursor-default": !props.isModifierPressed(),
      }}
      title={`${props.symbol.kind} (Line ${props.symbol.declLine})`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          e.stopPropagation();
          props.onJumpToLine({ scrollTarget: props.symbol.declLine });
        }
      }}
    >
      {props.symbol.name}
    </span>
  );
};

const ScopeBox: Component<{
  node: ScopeNode;
  depth: number;
  isModifierPressed: () => boolean;
  onJumpToLine: (target: { scrollTarget: number }) => void;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(props.depth < 1);

  const allChildCapturedIds = createMemo(() => {
    const ids = new Set<string>();
    const traverse = (n: ScopeNode) => {
      for (const child of n.children) {
        for (const s of child.captured) {
          ids.add(s.id);
        }
        traverse(child);
      }
    };
    traverse(props.node);
    return ids;
  });

  const capturedInChildren = () => {
    return props.node.captured.filter((s) => allChildCapturedIds().has(s.id));
  };

  const directCaptured = () => {
    return props.node.captured.filter((s) => !allChildCapturedIds().has(s.id));
  };

  const filteredDeclared = createMemo(() => {
    if (expanded()) {
      return props.node.declared;
    }

    if (props.depth === 0) {
      // For root scope when collapsed, only show declared if captured by a descendant
      const descendantCapturedPairs = new Set<string>();
      const traverse = (n: ScopeNode) => {
        for (const child of n.children) {
          for (const s of child.captured) {
            descendantCapturedPairs.add(`${s.name}:${s.declLine}`);
          }
          traverse(child);
        }
      };
      traverse(props.node);

      return props.node.declared.filter((s) =>
        descendantCapturedPairs.has(`${s.name}:${s.declLine}`)
      );
    }

    return [];
  });

  return (
    <div
      class="relative flex flex-col gap-2 rounded border border-gray-800 bg-[#1e1e1e]/50 p-2"
      classList={{
        "ml-2": props.depth > 0,
        "cursor-pointer hover:border-gray-700 transition-colors": true,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) {
          props.onJumpToLine({ scrollTarget: props.node.startLine });
          return;
        }
        if (props.node.children.length > 0) {
          setExpanded(!expanded());
        }
      }}
    >
      <div
        class="flex items-center justify-between text-[11px] text-gray-500 font-semibold uppercase tracking-wider"
        classList={{
          underline: props.isModifierPressed(),
        }}
      >
        <div class="flex items-center gap-1.5">
          <Show when={props.node.children.length > 0}>
            <span
              class="transition-transform duration-200"
              classList={{ "rotate-90": expanded() }}
            >
              ▶
            </span>
          </Show>
          <span>{props.node.name || props.node.kind}</span>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <Show when={filteredDeclared().length > 0}>
          <div class="flex flex-col gap-1 w-full">
            <span class="text-[9px] text-gray-600">Declared</span>
            <div class="flex flex-wrap gap-1.5">
              <For each={filteredDeclared()}>
                {(s) => (
                  <SymbolPill
                    symbol={s}
                    type="declared"
                    isModifierPressed={props.isModifierPressed}
                    onJumpToLine={props.onJumpToLine}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={directCaptured().length > 0}>
          <div class="flex flex-col gap-1 w-full border-t border-gray-800/50 pt-1">
            <span class="text-[9px] text-gray-600">Captured</span>
            <div class="flex flex-wrap gap-1.5">
              <For each={directCaptured()}>
                {(s) => (
                  <SymbolPill
                    symbol={s}
                    type="captured"
                    isModifierPressed={props.isModifierPressed}
                    onJumpToLine={props.onJumpToLine}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={!expanded() && capturedInChildren().length > 0}>
          <div class="flex flex-col gap-1 w-full border-t border-gray-800/50 pt-1">
            <span class="text-[9px] text-gray-600">
              Captured in child calls
            </span>
            <div class="flex flex-wrap gap-1.5">
              <For each={capturedInChildren()}>
                {(s) => (
                  <SymbolPill
                    symbol={s}
                    type="captured"
                    isModifierPressed={props.isModifierPressed}
                    onJumpToLine={props.onJumpToLine}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <Show when={expanded() && props.node.children.length > 0}>
        <div
          class="flex flex-col gap-2 border-l border-gray-800 pl-2 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <For each={props.node.children}>
            {(child) => (
              <ScopeBox
                node={child}
                depth={props.depth + 1}
                isModifierPressed={props.isModifierPressed}
                onJumpToLine={props.onJumpToLine}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export interface ScopeFlowPaneProps {
  filePath: string | null;
  targetStartLine: number | null;
  targetEndLine: number | null;
  onJumpToLine: (target: { scrollTarget: number }) => void;
}

export function ScopeFlowPane(props: ScopeFlowPaneProps) {
  const [isModifierPressed, setIsModifierPressed] = createSignal(false);

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsModifierPressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsModifierPressed(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });
  });

  const [data] = createResource(
    () => {
      const p = props.filePath;
      const s = props.targetStartLine;
      const e = props.targetEndLine;
      if (
        p &&
        typeof s === "number" &&
        typeof e === "number" &&
        s > 0 &&
        e >= s
      ) {
        return { p, s, e };
      }
      return null;
    },
    async ({ p, s, e }) => {
      return fetchScopeGraph(p, s, e);
    }
  );

  return (
    <div class="w-96 shrink-0 border-l border-gray-800 bg-gray-900/10 p-4 overflow-y-auto overflow-x-hidden flex flex-col gap-4">
      <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest sticky top-0 bg-[#1e1e1e] pb-2 z-10 border-b border-gray-800/50 mb-2">
        Scope Flow
      </h3>

      <Show when={data.loading}>
        <div class="text-[10px] text-gray-500 animate-pulse">
          Analyzing scopes...
        </div>
      </Show>

      <Show when={data.error}>
        <div class="text-[10px] text-red-400">Error loading scope graph</div>
      </Show>

      <Show when={data()} keyed>
        {(graph) => (
          <ScopeBox
            node={graph.root}
            depth={0}
            isModifierPressed={isModifierPressed}
            onJumpToLine={props.onJumpToLine}
          />
        )}
      </Show>

      <Show when={!data.loading && !data() && props.targetStartLine}>
        <div class="text-[10px] text-gray-600">
          No scope data available for this range.
        </div>
      </Show>
    </div>
  );
}
