import { batch, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show, untrack } from "solid-js";
import { ChevronDown } from "lucide-solid";
import { EmptyState, ErrorState } from "../../../components/feedback/States";
import { Button } from "../../../components/ui/Button";
import { fetchRouteGraph, fetchRoutes } from "../../../dataflow/api";
import { availabilityFor, ensureStarted, statusFor, watchProgress } from "../../../dataflow/availability";
import { labelFor, reasonText } from "../../../dataflow/outcome";
import { atFromTreePath } from "../../../navigation/location";
import { go, location, replace } from "../../../navigation/store";
import { ViewTools } from "../../viewToolbar";
import { DependencyCanvas, type CanvasApi } from "../DependencyCanvas";
import { layoutWithHubs } from "../hubs";
import type { ViewLayout } from "../layout";
import type { ViewNode } from "../viewModel";
import { routeGraphToViewModel } from "./adapter";
import { FlowLegend } from "./FlowLegend";
import { FlowModeSwitch } from "./FlowTools";
import { FlowProgress } from "./FlowProgress";
import { RoutePicker } from "./RoutePicker";

/**
 * Data flow mode of the graph view (`?view=graph&flow=<route>`): one route's
 * render backbone from the engine, drawn by the dependency canvas. Click
 * selects a box; double-click or `o` opens its line in the code viewer.
 */
export default function FlowView(props: {
  /** Absolute path of the scan root; the engine analyzes this folder. */
  rootPath: string;
  onOpen: (at: string, line?: number) => void;
}) {
  const root = () => props.rootPath;
  const [startError, setStartError] = createSignal<string | null>(null);
  createEffect(() => {
    const r = root();
    if (!r) return;
    setStartError(null);
    ensureStarted(r).catch((e) => setStartError(String(e?.message ?? e)));
  });
  const availability = () => availabilityFor(root());
  const status = () => statusFor(root());

  const [routes] = createResource(() => (availability() === "ready" ? root() : null), (r) => fetchRoutes(r));
  const routeKey = () => location().flow ?? "";
  const [graph] = createResource(
    () => (availability() === "ready" && routeKey() ? { path: root(), route: routeKey() } : null),
    (req) => watchProgress(req.path, fetchRouteGraph(req)),
  );
  const routeList = () => routes()?.routes ?? [];
  const currentRoute = () => routeList().find((r) => r.key === routeKey() || r.pathPattern === routeKey());

  const [picker, setPicker] = createSignal(false);
  // No route yet: offer the picker as soon as there are routes to pick.
  createEffect(() => {
    if (!routeKey() && routeList().length > 0) untrack(() => setPicker(true));
  });

  const model = createMemo(() => {
    const g = graph()?.graph;
    return g ? routeGraphToViewModel(g, { expanded: location().open ?? [] }) : null;
  });

  const [layout, setLayout] = createSignal<ViewLayout | null>(null);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [hovered, setHovered] = createSignal<ViewNode | null>(null);
  let canvas: CanvasApi | undefined;
  let host!: HTMLDivElement;
  let pendingAnchor: string | null = null;
  const [anchor, setAnchor] = createSignal<string | null>(null);

  let token = 0;
  createEffect(() => {
    const m = model();
    if (!m) return setLayout(null);
    const mine = ++token;
    const rect = host?.getBoundingClientRect();
    const viewport = rect && rect.height > 0 ? { width: rect.width, height: rect.height } : undefined;
    const aspectRatio = viewport ? viewport.width / viewport.height : 1.6;
    const anchorId = pendingAnchor;
    pendingAnchor = null;
    const previous = anchorId ? (untrack(layout) ?? undefined) : undefined;
    void Promise.resolve().then(() => {
      if (mine !== token) return;
      const next = layoutWithHubs(m.vm, { aspectRatio, viewport, previous, hidden: m.hidden });
      batch(() => {
        setAnchor(previous ? anchorId : null);
        setLayout(next);
      });
    });
  });

  // ---- expand in place: the URL's `open` list holds flow node ids ----
  const openList = () => location().open ?? [];
  const setOpen = (ids: string[]) => replace({ open: [...new Set(ids)].sort() });
  const collapsible = (groupId: string) => openList().includes(groupId);
  const toggleOpen = (n: ViewNode) => {
    pendingAnchor = n.id;
    if (n.expandable) setOpen([...openList(), n.id]);
    else if (n.group && collapsible(n.group.id)) setOpen(openList().filter((id) => id !== n.group!.id));
  };
  const collapse = (groupId: string) => {
    pendingAnchor = groupId;
    setOpen(openList().filter((id) => id !== groupId));
  };

  const openNode = (n: ViewNode) => {
    const flow = model()?.byId.get(n.id);
    if (!flow) return;
    const at = atFromTreePath(flow.absPath, root());
    if (at !== null) props.onOpen(at, flow.line);
  };
  const pickRoute = (key: string) => {
    setSelected(null);
    go({ flow: key, open: undefined });
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector('[aria-modal="true"], [role="menu"]')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const n = layout()?.nodes.find((p) => p.id === selected())?.node ?? hovered();
      if (key === "/") setPicker(true);
      else if (key === "0") canvas?.fit();
      else if (key === "Escape" && selected()) setSelected(null);
      else if (n && (key === "o" || key === "Enter")) openNode(n);
      else if (n && (key === "e" || key === " ")) toggleOpen(n);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const outcomeText = () => {
    const g = graph();
    return g ? labelFor(g.outcome, g.reason, g.message ?? g.graph?.unavailableReason) : null;
  };
  const stats = () => {
    const m = model();
    const g = graph()?.graph;
    if (!m || !g) return "";
    const c = g.counts;
    const folded = m.vm.rolledUp ? ` · ${m.vm.rolledUp} folded` : "";
    const omitted = c.omittedItems ? ` · ${c.omittedItems} omitted by the engine` : "";
    return `${c.occurrences} occurrences · ${c.boundaries} boundaries · ${c.terminals} terminals · ${c.origins} origins${folded}${omitted} · generation ${g.generation}`;
  };
  const waitingOn = () => {
    if (availability() !== "ready") return "Starting the data-flow engine";
    if (graph.loading) return `Tracing ${currentRoute()?.pathPattern ?? routeKey()}`;
    return null;
  };

  return (
    <div class="flex h-full flex-col bg-[var(--plc-surface)]">
      <ViewTools>
        <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-[var(--plc-border)]" />
        <FlowModeSwitch />
        <Button variant="ghost" class="gap-1 px-2" onClick={() => setPicker(true)} title="Pick a route (/)" disabled={!routeList().length}>
          <span class="text-[var(--plc-on-muted)]">Route</span>
          <span class="font-medium">{currentRoute()?.pathPattern ?? "none"}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </Button>
        <Button variant="ghost" class="px-2" onClick={() => canvas?.fit()} title="Fit the graph to the window (0)" disabled={!layout()}>
          Fit
        </Button>
      </ViewTools>

      <div ref={host} class="relative min-h-0 flex-1">
        <Show when={startError()}>
          {(message) => <ErrorState message={message()} class="absolute inset-0" />}
        </Show>
        <Show when={availability() === "na"}>
          <EmptyState
            class="absolute inset-0"
            title="Data flow N/A"
            description={`${reasonText(status()?.reason, status()?.message)}. ${status()?.message ?? ""}`.trim()}
          />
        </Show>
        <Show when={!startError() && availability() !== "na" && waitingOn()}>
          {(what) => <FlowProgress title={what()} progress={status()?.progress} class="absolute inset-0" />}
        </Show>
        <Show when={routes()?.outcome === "ok" && routeList().length === 0}>
          <EmptyState
            class="absolute inset-0"
            title="No routes here"
            description="Data flow starts from a route: a file under a routes/ folder that default-exports a component. Open a folder that has one."
          />
        </Show>
        <Show when={graph.error}>
          <ErrorState message={String(graph.error?.message ?? graph.error)} class="absolute inset-0" />
        </Show>
        <Show when={!graph.loading && layout()}>
          {(l) => (
            <>
              <DependencyCanvas
                layout={l()}
                anchor={anchor() ?? undefined}
                focusId={model()?.vm.focusId}
                onFocus={(n) => setSelected(n.id)}
                onOpen={openNode}
                onToggleOpen={toggleOpen}
                onPointerAct={() => setSelected(null)}
                onHover={setHovered}
                selectedId={selected() ?? undefined}
                collapsible={collapsible}
                onCollapse={collapse}
                ref={(api) => (canvas = api)}
                linkCounts={false}
              />
              <FlowLegend />
            </>
          )}
        </Show>
      </div>

      <div class="flex items-center gap-3 border-t border-[var(--plc-border)] px-3 py-1 text-[11px] text-[var(--plc-on-subtle)]" aria-live="polite">
        <Show when={outcomeText()}>
          {(text) => <span class="shrink-0 font-semibold text-[var(--plc-on-surface)]">{text()}</span>}
        </Show>
        <span class="ml-auto min-w-0 truncate tabular-nums">
          {stats()}
          {stats() ? " · " : ""}Click selects · Double-click or O opens code · Shift-click opens a frame · / picks a route
        </span>
      </div>

      <RoutePicker open={picker()} routes={routeList()} current={currentRoute()?.key} onClose={() => setPicker(false)} onPick={(r) => pickRoute(r.key)} />
    </div>
  );
}
