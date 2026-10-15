import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
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
import { legacyToContract, type LegacyGraph } from "./legacyAdapter";
import { buildViewModel, DEFAULT_BUDGET, type ViewNode } from "./viewModel";

const FOCUS_PARAM = "depFocus";

function readFocusParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(FOCUS_PARAM);
  } catch {
    return null;
  }
}

function writeFocusParam(focus: string | null) {
  try {
    const url = new URL(window.location.href);
    if (focus) url.searchParams.set(FOCUS_PARAM, focus);
    else url.searchParams.delete(FOCUS_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // URL persistence is a convenience only.
  }
}

async function fetchGraph(path: string | undefined): Promise<DependencyGraphContract> {
  const url = new URL("/api/analysis/dependencies", window.location.origin);
  if (path) url.searchParams.set("path", path);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to load dependencies (${res.status})`);
  const legacy = (await res.json()) as LegacyGraph;
  return legacyToContract(legacy, path);
}

export default function DependencyView(props: {
  path?: string;
  onClose: () => void;
  onLegacy?: () => void;
}) {
  const [graph] = createResource(() => props.path ?? "", (p) => fetchGraph(p || undefined));
  const [filters, setFilters] = createSignal<FilterOptions>(DEFAULT_FILTERS);
  const [focusId, setFocusId] = createSignal<string | null>(readFocusParam());
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
    const f = focusId();
    const id = f !== null && f !== "/" && idx.byId.has(f) ? f : idx.graph.root;
    return collapseChain(idx, id);
  });

  createEffect(() => {
    const f = effectiveFocus();
    if (f !== null) writeFocusParam(f || "/");
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

  const focus = (id: string) => {
    setFocusId(id);
    writeFocusParam(id || "/");
  };

  const onFocusNode = (n: ViewNode) => {
    if (n.isFocus) return;
    focus(n.graphId);
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
        <nav class="flex min-w-0 flex-1 items-center gap-0.5 text-xs" aria-label="Focus path">
          <For each={viewModel()?.breadcrumbs ?? []}>
            {(crumb, i) => {
              const last = () => i() === (viewModel()?.breadcrumbs.length ?? 0) - 1;
              return (
                <>
                  <Show when={i() > 0}>
                    <span class="px-0.5 text-[var(--plc-on-disabled)]">/</span>
                  </Show>
                  <button
                    type="button"
                    class={`truncate rounded px-1 py-0.5 transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] ${
                      last() ? "font-semibold text-[var(--plc-on-surface)]" : "text-[var(--plc-accent)]"
                    }`}
                    onClick={() => focus(crumb.id)}
                  >
                    {crumb.label}
                  </button>
                </>
              );
            }}
          </For>
          <span class="ml-2 shrink-0 tabular-nums text-[11px] text-[var(--plc-on-subtle)]">{stats()}</span>
        </nav>
        <div class="flex shrink-0 items-center gap-3">
          <CheckboxRow checked={filters().showExternal} onChange={toggle("showExternal")} label="External" />
          <CheckboxRow checked={filters().showTests} onChange={toggle("showTests")} label="Tests" />
          <CheckboxRow checked={filters().showTypeOnly} onChange={toggle("showTypeOnly")} label="Type-only" />
          <div class="h-4 w-px bg-[var(--plc-border)]" />
          <Button size="xs" onClick={() => canvas?.fit()}>
            Fit
          </Button>
          <Show when={props.onLegacy}>
            <Button size="xs" variant="ghost" onClick={() => props.onLegacy?.()}>
              Legacy view
            </Button>
          </Show>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              writeFocusParam(null);
              props.onClose();
            }}
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
