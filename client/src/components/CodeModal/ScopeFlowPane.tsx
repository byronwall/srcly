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
  // Default behavior: root function scope expanded, everything else collapsed.
  // For TSX/JSX, even if a JSX element becomes the root scope for the selected range,
  // we want it to start collapsed so you can expand layer-by-layer.
  const [expanded, setExpanded] = createSignal(
    props.depth < 1 && props.node.kind !== "jsx"
  );

  // Make sure the overlay gets a measurement pass once this box mounts.
  onMount(() => {
    props.onLayoutChange();
  });

  // If a declaration also exists as a nested scope (e.g. a function with its own ScopeBox),
  // hide it from the "Declared" pills. We only want non-scope declarations (vars, objects, etc.).
  const descendantScopeNames = createMemo(() => {
    const names = new Set<string>();
    const walk = (n: ScopeNode) => {
      for (const child of n.children) {
        if (child.name) names.add(child.name);
        walk(child);
      }
    };
    walk(props.node);
    return names;
  });

  type CapturedEntry = { symbol: SymbolNode; consumerScopeId: string };
  const collectCapturedSubtree = (n: ScopeNode): CapturedEntry[] => {
    // Dedupe by symbol key so collapsed scopes don't explode with repeated symbols.
    // While collapsed, the parent is the visual "consumer boundary" (arrows/pills move down as you expand).
    const byKey = new Map<string, CapturedEntry>();
    const visit = (node: ScopeNode) => {
      for (const s of node.captured) {
        const key = symbolKeyFromSymbol(s);
        if (!byKey.has(key))
          byKey.set(key, { symbol: s, consumerScopeId: n.id });
      }
      for (const child of node.children) visit(child);
    };
    visit(n);
    return Array.from(byKey.values()).sort((a, b) =>
      a.symbol.name.localeCompare(b.symbol.name)
    );
  };

  // Collapsed nodes act as an aggregation boundary: show captures from the whole hidden subtree.
  // Expanded nodes show only the captures used directly in that scope; descendants render themselves.
  const displayedCaptured = createMemo<CapturedEntry[]>(() => {
    if (expanded()) {
      const byKey = new Map<string, CapturedEntry>();
      for (const s of props.node.captured) {
        const key = symbolKeyFromSymbol(s);
        if (!byKey.has(key))
          byKey.set(key, { symbol: s, consumerScopeId: props.node.id });
      }
      return Array.from(byKey.values()).sort((a, b) =>
        a.symbol.name.localeCompare(b.symbol.name)
      );
    }
    return collectCapturedSubtree(props.node);
  });

  const filteredDeclared = createMemo(() => {
    const scopeNames = descendantScopeNames();
    const isNonScopeDecl = (s: SymbolNode) => !scopeNames.has(s.name);

    if (expanded()) {
      return props.node.declared.filter(isNonScopeDecl);
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

      return props.node.declared.filter(
        (s) =>
          isNonScopeDecl(s) &&
          descendantCapturedPairs.has(`${s.name}:${s.declLine}`)
      );
    }

    return [];
  });

  return (
    <div
      data-scope-id={props.node.id}
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

        <Show when={displayedCaptured().length > 0}>
          <div class="flex flex-col gap-1 w-full border-t border-gray-800/50 pt-1">
            <span class="text-[9px] text-gray-600">Captured</span>
            <div class="flex flex-wrap gap-1.5">
              <Index each={displayedCaptured()}>
                {(entry) => (
                  <SymbolPill
                    symbol={entry().symbol}
                    type="captured"
                    isModifierPressed={props.isModifierPressed}
                    onJumpToLine={props.onJumpToLine}
                  />
                )}
              </Index>
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

const symbolKeyFromParts = (
  id: string,
  name: string | undefined,
  declLine: number | null
) => {
  return name && typeof declLine === "number" && Number.isFinite(declLine)
    ? `${name}:${declLine}`
    : id;
};

const symbolKeyFromSymbol = (s: {
  id: string;
  name: string;
  declLine: number;
}) => symbolKeyFromParts(s.id, s.name, s.declLine);

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
  // Inter-scopebox links: consuming scope -> declaring scope.
  const [scopeLinksEnabled, setScopeLinksEnabled] = createSignal(true);
  // Pill arrows connect "Declared" pills to matching "Captured" pills.
  // Kept behind a toggle because they can get visually dense on large scopes.
  const [pillArrowsEnabled, setPillArrowsEnabled] = createSignal(true);

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

    const anyArrowsEnabled = scopeLinksEnabled() || pillArrowsEnabled();
    if (!anyArrowsEnabled) {
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

    const scrollT = el.scrollTop;
    const scrollL = el.scrollLeft;

    // Size the overlay to cover the whole scrollable content.
    setOverlayHeight(el.scrollHeight);

    const scopeBoxes = Array.from(
      el.querySelectorAll<HTMLElement>("[data-scope-id][data-scope-depth]")
    );
    const scopeBoxById = new Map<
      string,
      OverlayRect & { scopeDepth: number }
    >();
    for (const box of scopeBoxes) {
      const scopeId = box.dataset.scopeId;
      const depthStr = box.dataset.scopeDepth;
      const depth =
        typeof depthStr === "string" && depthStr.trim()
          ? parseInt(depthStr, 10)
          : null;
      if (!scopeId || depth == null || !Number.isFinite(depth)) continue;
      const r = box.getBoundingClientRect();
      scopeBoxById.set(scopeId, {
        left: r.left - containerRect.left + scrollL,
        top: r.top - containerRect.top + scrollT,
        width: r.width,
        height: r.height,
        scopeDepth: depth,
      });
    }

    // Build declaration ownership from the graph, so we can draw arrows even if the declaring
    // scope is collapsed (and its declared pills aren't rendered).
    const declaringScopesByKey = new Map<string, string[]>();
    const scopeDepthById = new Map<string, number>();
    const visit = (n: ScopeNode, depth: number) => {
      scopeDepthById.set(n.id, depth);

      // If a declared symbol also exists as a direct child scope (same name+line),
      // don't treat it as a declaration owned by this scope. This prevents
      // "DataFlowViz declares fetchData" when there's a FETCHDATA ScopeBox.
      const directChildScopeNameLine = new Set<string>();
      for (const child of n.children) {
        if (child.name && Number.isFinite(child.startLine)) {
          directChildScopeNameLine.add(`${child.name}:${child.startLine}`);
        }
      }

      for (const s of n.declared) {
        if (directChildScopeNameLine.has(`${s.name}:${s.declLine}`)) continue;
        const key = symbolKeyFromSymbol(s);
        const arr = declaringScopesByKey.get(key) ?? [];
        arr.push(n.id);
        declaringScopesByKey.set(key, arr);
      }
      for (const child of n.children) {
        // Treat the child scope itself as a "declaration" so we can draw arrows from the
        // scope box (e.g. FETCHDATA) to captured usages in other scopes.
        if (
          child.name &&
          typeof child.startLine === "number" &&
          Number.isFinite(child.startLine)
        ) {
          const scopeDeclKey = symbolKeyFromParts(
            child.id,
            child.name,
            child.startLine
          );
          const arr = declaringScopesByKey.get(scopeDeclKey) ?? [];
          arr.push(child.id);
          declaringScopesByKey.set(scopeDeclKey, arr);
        }

        visit(child, depth + 1);
      }
    };
    visit(graph.root, 0);

    // Scope-to-scope edges derived from the graph itself.
    // This is what enables "clear arrows between child scopes" even when declared pills are hidden.
    const scopeEdges = new Map<
      string,
      { from: string; to: string; exampleKey: string }
    >();
    if (scopeLinksEnabled()) {
      const buildScopeEdges = (n: ScopeNode) => {
        for (const s of n.captured) {
          const key = symbolKeyFromSymbol(s);
          const declScopes = declaringScopesByKey.get(key) ?? [];
          // Choose a single "best" declaring scope to avoid duplicate/mirror edges.
          let bestDecl: string | null = null;
          let bestDepth = -1;
          for (const decl of declScopes) {
            if (decl === n.id) continue;
            // Never connect arrows to the root scope node (avoids the noisy "fan-in/fan-out"
            // that tends to point at the top-left/root box like DataFlowViz).
            if (decl === graph.root.id) continue;
            const d = scopeDepthById.get(decl) ?? 0;
            if (d > bestDepth) {
              bestDepth = d;
              bestDecl = decl;
            }
          }
          if (!bestDecl) continue;

          // Direction we want to visualize: consuming scope -> declaring scope.
          const edgeId = `${n.id}→${bestDecl}`;
          if (!scopeEdges.has(edgeId)) {
            scopeEdges.set(edgeId, {
              from: n.id,
              to: bestDecl,
              exampleKey: key,
            });
          }
        }
        for (const child of n.children) buildScopeEdges(child);
      };
      buildScopeEdges(graph.root);
    }

    const pills = Array.from(
      el.querySelectorAll<HTMLElement>("[data-symbol-id][data-symbol-type]")
    );

    // Connect declarations -> captures across scopes.
    // Primary match key is `${name}:${declLine}` (stable even if backend IDs differ);
    // fallback to the backend symbol id when line/name are unavailable.
    type PillRect = OverlayRect & {
      scopeId: string | null;
      scopeDepth: number;
    };
    const declaredByKey = new Map<string, PillRect[]>();
    const capturedByKey = new Map<string, PillRect[]>();
    const capturedByScopeAndKey = new Map<string, PillRect[]>();

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

      const consumerScopeId = pill.dataset.consumerScopeId ?? null;
      const closestScopeId =
        pill.closest<HTMLElement>("[data-scope-id]")?.dataset.scopeId ?? null;
      const scopeId =
        type === "captured" && consumerScopeId
          ? consumerScopeId
          : closestScopeId;

      const scopeDepth =
        type === "captured" && consumerScopeId
          ? scopeDepthById.get(consumerScopeId) ?? null
          : (() => {
              const scopeDepthStr =
                pill.closest<HTMLElement>("[data-scope-depth]")?.dataset
                  .scopeDepth ?? null;
              return scopeDepthStr != null ? parseInt(scopeDepthStr, 10) : null;
            })();
      if (scopeDepth == null || !Number.isFinite(scopeDepth)) continue;

      const r = pill.getBoundingClientRect();
      const rect: PillRect = {
        // Convert viewport coords -> scroll-content coords
        left: r.left - containerRect.left + scrollL,
        top: r.top - containerRect.top + scrollT,
        width: r.width,
        height: r.height,
        scopeId,
        scopeDepth,
      };

      const key = symbolKeyFromParts(id, name, declLine);

      if (type === "declared") {
        const group = declaredByKey.get(key) ?? [];
        group.push(rect);
        declaredByKey.set(key, group);
        continue;
      }

      if (type === "captured") {
        const group = capturedByKey.get(key) ?? [];
        group.push(rect);
        capturedByKey.set(key, group);

        const scopeKey = `${scopeId ?? "null"}|${key}`;
        const byScope = capturedByScopeAndKey.get(scopeKey) ?? [];
        byScope.push(rect);
        capturedByScopeAndKey.set(scopeKey, byScope);
      }
    }

    const newLines: OverlayLine[] = [];
    const seen = new Set<string>();
    let scopeEdgesDrawn = 0;
    let scopeEdgesMissingSource = 0;
    let scopeEdgesMissingTarget = 0;
    let overlapKeys = 0;
    if (pillArrowsEnabled()) {
      for (const [key, targets] of capturedByKey.entries()) {
        const sources = declaredByKey.get(key) ?? [];
        let keyHadAny = false;
        for (const tgt of targets) {
          // Prefer a declared pill source if available; otherwise fallback to the declaring scope box.
          let bestSrc: PillRect | null = null;
          let bestScore = Number.POSITIVE_INFINITY;
          for (const src of sources) {
            if (
              src.scopeId != null &&
              tgt.scopeId != null &&
              src.scopeId === tgt.scopeId
            )
              continue;
            const depthDiff = Math.abs(tgt.scopeDepth - src.scopeDepth);
            // Prefer sources that are the same depth or closer in the tree.
            // Slightly prefer sources that are at-or-above the target depth.
            const score =
              depthDiff + (src.scopeDepth <= tgt.scopeDepth ? 0 : 0.25);
            if (score < bestScore) {
              bestScore = score;
              bestSrc = src;
            }
          }

          let x1: number | null = null;
          let y1: number | null = null;
          if (bestSrc) {
            x1 = bestSrc.left + bestSrc.width;
            y1 = bestSrc.top + bestSrc.height / 2;
          } else {
            const declScopes = declaringScopesByKey.get(key) ?? [];
            let bestScope: (OverlayRect & { scopeDepth: number }) | null = null;
            let bestScopeScore = Number.POSITIVE_INFINITY;
            for (const scopeId of declScopes) {
              if (tgt.scopeId != null && scopeId === tgt.scopeId) continue;
              const scopeRect = scopeBoxById.get(scopeId);
              if (!scopeRect) continue;
              const depthDiff = Math.abs(tgt.scopeDepth - scopeRect.scopeDepth);
              const score =
                depthDiff + (scopeRect.scopeDepth <= tgt.scopeDepth ? 0 : 0.25);
              if (score < bestScopeScore) {
                bestScopeScore = score;
                bestScope = scopeRect;
              }
            }
            if (bestScope) {
              // Anchor near the scope header/left (not the far-right of full-width boxes).
              x1 = bestScope.left + 18;
              // aim near the header of the scope box so arrows read as "scope -> usage"
              y1 = bestScope.top + Math.min(18, bestScope.height / 2);
            }
          }

          if (x1 == null || y1 == null) continue;
          keyHadAny = true;
          const x2 = tgt.left;
          const y2 = tgt.top + tgt.height / 2;
          const dedupeKey = `${Math.round(x1)}:${Math.round(y1)}->${Math.round(
            x2
          )}:${Math.round(y2)}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          newLines.push({ x1, y1, x2, y2 });
        }
        if (keyHadAny) overlapKeys++;
      }
    }

    // Draw scope->scope arrows: from the consuming captured pill (when available) -> declaring scope box.
    if (scopeLinksEnabled()) {
      for (const edge of scopeEdges.values()) {
        // Extra safety: never render arrows to/from the root scope box.
        if (edge.from === graph.root.id || edge.to === graph.root.id) continue;
        const srcBox = scopeBoxById.get(edge.from) ?? null;
        const tgtBox = scopeBoxById.get(edge.to) ?? null;

        if (!srcBox) {
          scopeEdgesMissingSource++;
          continue;
        }
        if (!tgtBox) {
          scopeEdgesMissingTarget++;
          continue;
        }

        const scopeKey = `${edge.from}|${edge.exampleKey}`;
        const srcPill = (capturedByScopeAndKey.get(scopeKey) ?? [])[0] ?? null;

        // Anchor at the consuming pill (prevents everything starting from the pane's top-right).
        const x1 = srcPill ? srcPill.left : srcBox.left + 18;
        const y1 = srcPill
          ? srcPill.top + srcPill.height / 2
          : srcBox.top + Math.min(18, srcBox.height / 2);

        // Target the declaring scope box header area (left side).
        const x2 = tgtBox.left + 18;
        const y2 = tgtBox.top + Math.min(18, tgtBox.height / 2);
        const dedupeKey = `${Math.round(x1)}:${Math.round(y1)}->${Math.round(
          x2
        )}:${Math.round(y2)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        scopeEdgesDrawn++;
        newLines.push({ x1, y1, x2, y2 });
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
        declaredGroups: declaredByKey.size,
        capturedGroups: capturedByKey.size,
        scopeEdges: scopeEdges.size,
        scopeEdgesDrawn,
        scopeEdgesMissingSource,
        scopeEdgesMissingTarget,
        overlapKeys,
        lines: newLines.length,
        scopeLinksEnabled: scopeLinksEnabled(),
        pillArrowsEnabled: pillArrowsEnabled(),
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
      <Show when={scopeLinksEnabled() || pillArrowsEnabled()}>
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
                setScopeLinksEnabled(!scopeLinksEnabled());
                // eslint-disable-next-line no-console
                console.log(`${LOG_PREFIX} scope-links`, {
                  enabled: !scopeLinksEnabled(),
                });
                scheduleRecalculate();
              }}
              class="p-1 hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-gray-300"
              title={
                scopeLinksEnabled()
                  ? "Hide inter-scope links"
                  : "Show inter-scope links"
              }
            >
              <Show
                when={scopeLinksEnabled()}
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
              onClick={() => {
                setPillArrowsEnabled(!pillArrowsEnabled());
                // eslint-disable-next-line no-console
                console.log(`${LOG_PREFIX} pill-arrows`, {
                  enabled: !pillArrowsEnabled(),
                });
                scheduleRecalculate();
              }}
              class="p-1 hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-gray-300"
              title={
                pillArrowsEnabled()
                  ? "Hide declared→captured pill arrows"
                  : "Show declared→captured pill arrows"
              }
            >
              <Show
                when={pillArrowsEnabled()}
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
                    <path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07L11 5" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.38a5 5 0 0 0 7.07 7.07L13 19" />
                    <line x1="9" y1="15" x2="15" y2="9" />
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
                  <path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07L11 5" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.38a5 5 0 0 0 7.07 7.07L13 19" />
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
