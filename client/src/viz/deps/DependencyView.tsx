import { createEffect, createMemo, createResource, createSignal, Show } from "solid-js";
import { EmptyState, ErrorState, LoadingState } from "../../components/feedback/States";
import { Button } from "../../components/ui/Button";
import { CheckboxRow } from "../../components/ui/CheckboxRow";
import type { DependencyGraphContract } from "./contract";
import { DependencyCanvas, type CanvasApi } from "./DependencyCanvas";
import { DependencyLegend } from "./DependencyLegend";
import {
  applyFilters,
  buildIndex,
  collapseChain,
  displayName,
  type FilterOptions,
} from "./hierarchy";
import { layoutWithHubs } from "./hubs";
import type { ViewLayout } from "./layout";
import { viewMetrics, type MetricsIndex } from "./metrics";
import { buildViewModel, DEFAULT_BUDGET, type ViewNode } from "./viewModel";
import { folderOf, graphIdFor } from "../../navigation/location";
import NodeActionsMenu, { type NodeMenuTarget } from "../../navigation/NodeActionsMenu";
import { go, graphFilters as filters, location, setGraphFilters as setFilters } from "../../navigation/store";

async function fetchGraph(path: string | undefined): Promise<DependencyGraphContract> {
  const url = new URL("/api/analysis/dependency-graph", window.location.origin);
  if (path) url.searchParams.set("path", path);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to load dependencies (${res.status})`);
  return (await res.json()) as DependencyGraphContract;
}

export default function DependencyView(props: {
  /**
   * Absolute path of the scan root. The whole-repo graph is fetched once
   * (the server caches it by mtime); focus selects within it, so drills never
   * refetch and dependents outside the focused folder stay visible.
   */
  rootPath: string;
  /**
   * Open a file or symbol (by location) in the app's code viewer. Symbols
   * also pass their line, so the viewer can land on them by position.
   */
  onOpen: (at: string, line?: number) => void;
  /** Treemap nodes by absolute path, built once per scan: LOC and colors for the boxes. */
  metricsIndex?: MetricsIndex;
  /** The treemap's color metric, so the graph uses the same colors. */
  colorMetric?: string;
}) {
  const [graph] = createResource(() => props.rootPath, (p) => fetchGraph(p || undefined));
  const [layout, setLayout] = createSignal<ViewLayout | null>(null);
  const [menu, setMenu] = createSignal<(NodeMenuTarget & { node: ViewNode }) | null>(null);
  let canvas: CanvasApi | undefined;
  let host!: HTMLDivElement;

  const index = createMemo(() => {
    const g = graph();
    return g ? buildIndex(applyFilters(g, filters())) : null;
  });

  const effectiveFocus = createMemo(() => {
    const idx = index();
    if (!idx) return null;
    const id = graphIdFor(location().at, (candidate) => idx.byId.has(candidate));
    return collapseChain(idx, id || idx.graph.root);
  });

  const viewModel = createMemo(() => {
    const idx = index();
    const f = effectiveFocus();
    if (!idx || f === null) return null;
    return buildViewModel(idx, { focusId: f, budget: DEFAULT_BUDGET });
  });

  let layoutToken = 0;
  createEffect(() => {
    const vm = viewModel();
    if (!vm) return;
    const token = ++layoutToken;
    const rect = host?.getBoundingClientRect();
    const aspectRatio = rect && rect.height > 0 ? rect.width / rect.height : 1.6;
    const viewport = rect && rect.height > 0 ? { width: rect.width, height: rect.height } : undefined;
    void Promise.resolve().then(() => {
      if (token === layoutToken) setLayout(layoutWithHubs(vm, { aspectRatio, viewport }));
    });
  });

  // Metrics per box: follows the layout and the scan, never the color
  // metric, so recoloring repaints without a relayout.
  const boxMetrics = createMemo(() => {
    const l = layout();
    const idx = index();
    return l && idx ? viewMetrics(idx, l.nodes.map((n) => n.node), props.metricsIndex) : undefined;
  });

  const onFocusNode = (n: ViewNode) => {
    const idx = index();
    // A focused file's symbols are drawn as focus too, but clicking one
    // isolates it: only the box that is the focus itself stays put.
    if (!idx || n.graphId === effectiveFocus()) return;
    // Store the folder the graph will actually show, so the breadcrumb matches.
    go({ at: collapseChain(idx, n.graphId) });
  };

  // Files and symbols open in the app's code viewer, scoped like the treemap.
  const onOpenNode = (n: ViewNode) => {
    if (n.kind === "file") props.onOpen(n.graphId);
    else if (n.kind === "symbol") props.onOpen(n.graphId, index()?.byId.get(n.graphId)?.line);
  };

  const openMenu = (n: ViewNode, point: { x: number; y: number }) =>
    setMenu({ ...point, node: n, at: n.graphId, kind: n.kind, title: n.title || n.label, currentAt: effectiveFocus() ?? location().at });

  /**
   * The titled frame around the focus: a focused file frames its symbols; an
   * isolated symbol keeps its file as the title, which un-isolates on click.
   */
  const focusFrame = createMemo(() => {
    const vm = viewModel();
    const idx = index();
    if (!vm || !idx) return undefined;
    if (vm.focusKind === "file") {
      const framed = vm.nodes.some((n) => n.kind === "symbol" && n.region === "center");
      return framed ? { title: vm.focusLabel } : undefined;
    }
    if (vm.focusKind !== "symbol") return undefined;
    const file = idx.byId.get(vm.focusId)?.parent;
    if (!file) return undefined;
    const symbols = (idx.children.get(file) ?? []).filter((c) => idx.byId.get(c)?.kind === "symbol").length;
    return {
      title: displayName(idx, file),
      note: symbols > 1 ? `1 of ${symbols} symbols` : undefined,
      onTitle: () => go({ at: file }),
    };
  });

  const toggle = (key: keyof FilterOptions) => (v: boolean) =>
    setFilters((f) => ({ ...f, [key]: v }));

  const stats = createMemo(() => {
    const vm = viewModel();
    if (!vm) return "";
    const links = vm.edges.reduce((a, e) => a + e.weight, 0);
    const base = `${vm.nodes.length} boxes · ${vm.edges.length} edges (${links} links)`;
    const l = layout();
    const hidden = l?.hiddenEdges?.length ?? 0;
    const hubs = l?.hubs?.length ?? 0;
    return hidden ? `${base} · ${hidden} behind ${hubs} hub${hubs === 1 ? "" : "s"}` : base;
  });

  return (
    <div class="flex h-full flex-col bg-[var(--plc-surface)]">
      <div class="flex items-center gap-3 border-b border-[var(--plc-border)] px-3 py-1.5">
        <span class="min-w-0 flex-1 truncate tabular-nums text-[11px] text-[var(--plc-on-subtle)]">{stats()}</span>
        <div class="flex shrink-0 items-center gap-3">
          <CheckboxRow checked={filters().showExternal} onChange={toggle("showExternal")} label="External" />
          <CheckboxRow checked={filters().showTests} onChange={toggle("showTests")} label="Tests" />
          <CheckboxRow checked={filters().showTypeOnly} onChange={toggle("showTypeOnly")} label="Type-only" />
          <div class="h-4 w-px bg-[var(--plc-border)]" />
          <Button size="xs" onClick={() => canvas?.fit()}>
            Fit
          </Button>
        </div>
      </div>

      <div ref={host} class="relative min-h-0 flex-1">
        <Show when={graph.loading}>
          <LoadingState label="Loading dependencies…" class="absolute inset-0" />
        </Show>
        <Show when={graph.error}>
          <ErrorState message={String(graph.error?.message ?? graph.error)} class="absolute inset-0" />
        </Show>
        <Show when={!graph.loading && !graph.error && viewModel()?.nodes.length === 0}>
          <EmptyState
            class="absolute inset-0"
            title="No dependencies here"
            description="No source files with resolvable imports were found in this folder. Try including tests or external packages."
          />
        </Show>
        <Show when={layout() && (viewModel()?.nodes.length ?? 0) > 0 ? layout() : null}>
          {(l) => (
            <>
              <DependencyCanvas
                layout={l()}
                focusId={effectiveFocus() ?? undefined}
                focusFrame={focusFrame()}
                onFocus={onFocusNode}
                onOpen={onOpenNode}
                onMenu={openMenu}
                ref={(api) => (canvas = api)}
                metrics={boxMetrics()}
                colorMetric={props.colorMetric}
              />
              <DependencyLegend />
            </>
          )}
        </Show>
      </div>

      <Show when={menu()}>
        {(m) => (
          <NodeActionsMenu
            target={m()}
            onClose={() => setMenu(null)}
            onAction={(id) => {
              const n = m().node;
              if (id === "focus") onFocusNode(n);
              else if (id === "open") onOpenNode(n);
              else go({ at: folderOf(n.graphId) });
            }}
          />
        )}
      </Show>
    </div>
  );
}
