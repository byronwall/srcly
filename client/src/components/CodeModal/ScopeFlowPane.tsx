import {
  createMemo,
  createResource,
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  For,
  Index,
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

const LOG_PREFIX = "[ScopeFlow]";

const fetchScopeGraph = async (
  path: string,
  start: number,
  end: number
): Promise<ScopeGraph> => {
  // Match the rest of the app's API calls (same-origin `/api/...`).
  // Hardcoding localhost breaks when the client is served elsewhere.
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} fetch scope-graph`, { path, start, end });
  const res = await fetch("/api/analysis/focus/scope-graph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, focusStartLine: start, focusEndLine: end }),
  });
  if (!res.ok) throw new Error("Failed to fetch scope graph");
  const json = (await res.json()) as ScopeGraph;
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} scope-graph ok`, {
    rootKind: json?.root?.kind ?? null,
    rootChildren: json?.root?.children?.length ?? 0,
    rootDeclared: json?.root?.declared?.length ?? 0,
    rootCaptured: json?.root?.captured?.length ?? 0,
  });
  return json;
};

const SymbolPill: Component<{
  symbol: SymbolNode;
  type: "declared" | "captured";
  isModifierPressed: () => boolean;
  onJumpToLine: (target: { scrollTarget: number }) => void;
}> = (props) => {
  return (
    <span
      data-symbol-id={props.symbol.id}
      data-symbol-name={props.symbol.name}
      data-symbol-line={props.symbol.declLine}
      data-symbol-type={props.type}
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
  onLayoutChange: () => void;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(props.depth < 1);

  // Make sure the overlay gets a measurement pass once this box mounts.
  onMount(() => {
    props.onLayoutChange();
  });

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
      data-scope-depth={props.depth}
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
          props.onLayoutChange();
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
                onLayoutChange={props.onLayoutChange}
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
  isMaximized: () => boolean;
  onToggleMaximize: () => void;
}

type OverlayLine = { x1: number; y1: number; x2: number; y2: number };
type OverlayRect = { left: number; top: number; width: number; height: number };

const LineOverlay: Component<{
  lines: OverlayLine[];
  height: number;
}> = (props) => {
  return (
    <div
      class="absolute top-0 left-0 w-full pointer-events-none z-20 overflow-visible"
      style={{ height: `${Math.max(1, props.height)}px` }}
    >
      <svg class="w-full h-full overflow-visible">
        <defs>
          <marker
            id="scopeflow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(96, 165, 250, 0.9)" />
          </marker>
        </defs>
        <Index each={props.lines}>
          {(line) => (
            <path
              d={`M ${line().x1} ${line().y1} C ${line().x1 + 40} ${
                line().y1
              }, ${line().x2 - 40} ${line().y2}, ${line().x2} ${line().y2}`}
              stroke="rgba(96, 165, 250, 0.9)"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
              marker-end="url(#scopeflow-arrow)"
            />
          )}
        </Index>
      </svg>
    </div>
  );
};

export function ScopeFlowPane(props: ScopeFlowPaneProps) {
  const [isModifierPressed, setIsModifierPressed] = createSignal(false);
  const [arrowsEnabled, setArrowsEnabled] = createSignal(true);

  onMount(() => {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} mount`, {
      filePath: props.filePath,
      targetStartLine: props.targetStartLine,
      targetEndLine: props.targetEndLine,
    });
  });

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

  const [lines, setLines] = createSignal<OverlayLine[]>([]);
  const [overlayHeight, setOverlayHeight] = createSignal(1);
  let containerRef: HTMLDivElement | undefined;
  let lastDebugLogAt = 0;

  const recalculateLines = () => {
    const el = containerRef;
    const graph = data();

    if (!arrowsEnabled()) {
      setLines([]);
      return;
    }

    if (!el || data.loading || !graph) {
      setLines([]);
      return;
    }

    const containerRect = el.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
      setLines([]);
      return;
    }

    // Size the overlay to cover the whole scrollable content.
    setOverlayHeight(el.scrollHeight);

    const pills = Array.from(
      el.querySelectorAll<HTMLElement>("[data-symbol-id][data-symbol-type]")
    );
    if (pills.length === 0) {
      setLines([]);
      return;
    }

    // We only connect: root declared pills (depth=0) -> captured pills rendered in descendant scopes (depth>0).
    // Note: captured symbol IDs may not match declared symbol IDs (depending on backend),
    // so we also fallback-match by `${name}:${declLine}`.
    const rootDeclaredByKey = new Map<string, OverlayRect>();
    const capturedByKey = new Map<string, OverlayRect[]>();
    const scrollT = el.scrollTop;
    const scrollL = el.scrollLeft;

    for (const pill of pills) {
      const id = pill.dataset.symbolId;
      const name = pill.dataset.symbolName;
      const lineStr = pill.dataset.symbolLine;
      const declLine =
        typeof lineStr === "string" && lineStr.trim()
          ? parseInt(lineStr, 10)
          : null;
      const type = pill.dataset.symbolType;
      if (!id || !type) continue;

      const scopeDepthStr =
        pill.closest<HTMLElement>("[data-scope-depth]")?.dataset.scopeDepth ??
        null;
      const scopeDepth =
        scopeDepthStr != null ? parseInt(scopeDepthStr, 10) : null;

      const r = pill.getBoundingClientRect();
      const rect: OverlayRect = {
        // Convert viewport coords -> scroll-content coords
        left: r.left - containerRect.left + scrollL,
        top: r.top - containerRect.top + scrollT,
        width: r.width,
        height: r.height,
      };

      if (type === "declared" && scopeDepth === 0) {
        rootDeclaredByKey.set(id, rect);
        if (name && typeof declLine === "number" && Number.isFinite(declLine)) {
          rootDeclaredByKey.set(`${name}:${declLine}`, rect);
        }
        continue;
      }

      if (type === "captured" && scopeDepth != null && scopeDepth > 0) {
        const keys: string[] = [id];
        if (name && typeof declLine === "number" && Number.isFinite(declLine)) {
          keys.push(`${name}:${declLine}`);
        }

        for (const k of keys) {
          const group = capturedByKey.get(k) ?? [];
          group.push(rect);
          capturedByKey.set(k, group);
        }
      }
    }

    const newLines: OverlayLine[] = [];
    let overlapKeys = 0;
    for (const [key, targets] of capturedByKey.entries()) {
      const src = rootDeclaredByKey.get(key);
      if (!src) continue;
      overlapKeys++;

      for (const tgt of targets) {
        newLines.push({
          x1: src.left + src.width,
          y1: src.top + src.height / 2,
          x2: tgt.left,
          y2: tgt.top + tgt.height / 2,
        });
      }
    }

    setLines(newLines);

    // Throttled debug logs so you can verify it's running without spamming.
    const now = Date.now();
    if (now - lastDebugLogAt > 750) {
      lastDebugLogAt = now;
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} overlay`, {
        pills: pills.length,
        rootDeclared: rootDeclaredByKey.size,
        capturedGroups: capturedByKey.size,
        overlapKeys,
        lines: newLines.length,
        scrollTop: scrollT,
        overlayHeight: el.scrollHeight,
      });
    }
  };

  let rafId: number | null = null;
  const scheduleRecalculate = () => {
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      recalculateLines();
    });
  };

  onMount(() => {
    scheduleRecalculate();

    const onResize = () => scheduleRecalculate();
    window.addEventListener("resize", onResize);

    if (containerRef && "ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(() => scheduleRecalculate());
      resizeObserver.observe(containerRef);
      onCleanup(() => resizeObserver.disconnect());
    }

    onCleanup(() => {
      window.removeEventListener("resize", onResize);
      if (rafId != null) cancelAnimationFrame(rafId);
    });
  });

  createEffect(() => {
    const graph = data();
    if (!graph) {
      setLines([]);
      return;
    }
    scheduleRecalculate();
  });

  return (
    <div
      ref={(el) => (containerRef = el)}
      onScroll={scheduleRecalculate}
      class="relative shrink-0 border-l border-gray-800 bg-gray-900/10 p-4 overflow-y-auto overflow-x-hidden flex flex-col gap-4"
      classList={{
        "w-96": !props.isMaximized(),
        "flex-1": props.isMaximized(),
      }}
    >
      <Show when={arrowsEnabled()}>
        <LineOverlay lines={lines()} height={overlayHeight()} />
      </Show>

      <div class="relative z-10 flex flex-col gap-4">
        <div class="flex items-center justify-between sticky top-0 bg-[#1e1e1e] pb-2 z-10 border-b border-gray-800/50 mb-2">
          <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Scope Flow
          </h3>
          <div class="flex items-center gap-1">
            <button
              onClick={() => {
                setArrowsEnabled(!arrowsEnabled());
                // eslint-disable-next-line no-console
                console.log(`${LOG_PREFIX} arrows`, {
                  enabled: !arrowsEnabled(),
                });
                scheduleRecalculate();
              }}
              class="p-1 hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-gray-300"
              title={arrowsEnabled() ? "Hide arrows" : "Show arrows"}
            >
              <Show
                when={arrowsEnabled()}
                fallback={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M4 20L20 4" />
                  <path d="M14 4h6v6" />
                </svg>
              </Show>
            </button>

            <button
              onClick={() => props.onToggleMaximize()}
              class="p-1 hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-gray-300"
              title={props.isMaximized() ? "Restore" : "Maximize"}
            >
              <Show
                when={props.isMaximized()}
                fallback={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <polyline points="9 21 3 21 3 15"></polyline>
                    <line x1="21" y1="3" x2="14" y2="10"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                  </svg>
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="4 14 10 14 10 20"></polyline>
                  <polyline points="20 10 14 10 14 4"></polyline>
                  <line x1="14" y1="10" x2="21" y2="3"></line>
                  <line x1="10" y1="14" x2="3" y2="21"></line>
                </svg>
              </Show>
            </button>
          </div>
        </div>

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
              onLayoutChange={scheduleRecalculate}
            />
          )}
        </Show>

        <Show when={!data.loading && !data() && props.targetStartLine}>
          <div class="text-[10px] text-gray-600">
            No scope data available for this range.
          </div>
        </Show>
      </div>
    </div>
  );
}
