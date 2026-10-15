import { createEffect, createMemo, createResource, createSignal, Show } from "solid-js";
import CodeModal from "../../components/CodeModal/CodeModal.tsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/feedback/States";
import { Button } from "../../components/ui/Button";
import { CheckboxRow } from "../../components/ui/CheckboxRow";
import type { DependencyGraphContract } from "./contract";
import { DependencyCanvas, type CanvasApi } from "./DependencyCanvas";
import {
  applyFilters,
  buildIndex,
  collapseChain,
  DEFAULT_FILTERS,
  type FilterOptions,
} from "./hierarchy";
import { layoutView, type ViewLayout } from "./layout";
import { buildViewModel, DEFAULT_BUDGET, type ViewNode } from "./viewModel";
import { graphIdFor } from "../../navigation/location";
import { go, location } from "../../navigation/store";

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
}) {
  const [graph] = createResource(() => props.rootPath, (p) => fetchGraph(p || undefined));
  const [filters, setFilters] = createSignal<FilterOptions>(DEFAULT_FILTERS);
  const [layout, setLayout] = createSignal<ViewLayout | null>(null);
  const [openFile, setOpenFile] = createSignal<string | null>(null);
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
    void layoutView(vm, { aspectRatio, viewport }).then((l) => {
      if (token === layoutToken) setLayout(l);
    });
  });

  const onFocusNode = (n: ViewNode) => {
    const idx = index();
    if (n.isFocus || !idx) return;
    // Store the folder the graph will actually show, so the breadcrumb matches.
    go({ at: collapseChain(idx, n.graphId) });
  };

  const onOpenNode = (n: ViewNode) => {
    const idx = index();
    const g = idx?.byId.get(n.graphId);
    const file = g?.kind === "symbol" && g.parent ? idx?.byId.get(g.parent) : g;
    if (file?.absPath) setOpenFile(file.absPath);
  };

  const toggle = (key: keyof FilterOptions) => (v: boolean) =>
    setFilters((f) => ({ ...f, [key]: v }));

  const stats = createMemo(() => {
    const vm = viewModel();
    if (!vm) return "";
    const links = vm.edges.reduce((a, e) => a + e.weight, 0);
    return `${vm.nodes.length} boxes · ${vm.edges.length} edges (${links} links)`;
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
          <Button
            size="xs"
            variant="ghost"
            onClick={() => go({ view: "treemap" })}
          >
            Close
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
            <DependencyCanvas
              layout={l()}
              focusLabel={viewModel()?.focusLabel}
              focusIsGroup={viewModel()?.focusKind === "file" && (viewModel()?.nodes.some((n) => n.kind === "symbol" && n.region === "center") ?? false)}
              onFocus={onFocusNode}
              onOpen={onOpenNode}
              ref={(api) => (canvas = api)}
            />
          )}
        </Show>
      </div>

      <Show when={openFile()}>
        <CodeModal isOpen={true} filePath={openFile()} onClose={() => setOpenFile(null)} />
      </Show>
    </div>
  );
}
