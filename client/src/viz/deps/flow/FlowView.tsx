import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, Show, untrack } from "solid-js";
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
import { createFetch } from "./fetchSignal";
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

  const routesFetch = createFetch(() => (availability() === "ready" ? root() : null), (r) => fetchRoutes(r));
  const routes = routesFetch.value;
  const routeKey = () => location().flow ?? "";
  const field = () => location().field;
  const graphKey = createMemo(
    () => (availability() === "ready" && routeKey() ? `${root()}\n${routeKey()}\n${field() ?? ""}` : null),
  );
  const graphFetch = createFetch(graphKey, (key) => {
    const [path, route, source] = key.split("\n");
    return watchProgress(path, fetchRouteGraph({ path, route, source: source || undefined }));
  });
  const graph = graphFetch.value;
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
    go({ flow: key, open: undefined, field: undefined, dest: undefined });
  };
  /** Pick an origin (or clear it): its proven destinations light up. No Back step. */
  const pickOrigin = (id: string | undefined) => {
    setSelected(null);
    replace({ field: id, dest: undefined });
  };
  /** A click: an origin selects itself as the source; a lit box becomes the destination. */
  const onBoxClick = (n: ViewNode) => {
    const flow = model()?.byId.get(n.id);
    if (flow?.kind === "origin") return pickOrigin(field() === n.id ? undefined : n.id);
    if (n.lit) replace({ dest: n.id });
    else if (location().dest) replace({ dest: undefined });
    setSelected(n.id);
  };
  const origins = () => graph()?.graph?.origins ?? [];
  const lineageText = () => {
    const g = graph()?.graph;
    if (!g?.selectedSource) return null;
    const name = origins().find((o) => o.nodeId === g.selectedSource)?.label ?? "the origin";
    const reach = g.destinations.length
      ? `${name} reaches ${g.destinations.length} proven render site${g.destinations.length === 1 ? "" : "s"}`
      : `${name} reaches no proven render site`;
    const lineage = g.lineage;
    if (!lineage) return reach;
    if (lineage.status === "unavailable") return `${reach} · field lineage N/A: ${lineage.unavailableReason ?? "unavailable"}`;
    return `${reach} · ${lineage.fields} field${lineage.fields === 1 ? "" : "s"}${lineage.frontiers ? `, ${lineage.frontiers} stop at frontiers` : ""}`;
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
      else if (key === "Escape" && (selected() || field())) {
        if (selected()) setSelected(null);
        else pickOrigin(undefined);
      }
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
    if (graphFetch.loading()) return `Tracing ${currentRoute()?.pathPattern ?? routeKey()}`;
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
        <label class="flex shrink-0 items-center gap-1 px-1 text-[12px]">
          <span class="text-[var(--plc-on-muted)]">Origin</span>
          <select
            class="max-w-[14rem] truncate rounded border border-[var(--plc-border)] bg-[var(--plc-surface)] px-1 py-0.5 text-[12px] text-[var(--plc-on-surface)]"
            value={field() ?? ""}
            disabled={!origins().length}
            onChange={(e) => pickOrigin(e.currentTarget.value || undefined)}
            aria-label="Origin whose proven destinations light up"
          >
            <option value="" selected={!field()}>none</option>
            {/* `selected` per option: the select's value is set before its options exist. */}
            {origins().map((o) => <option value={o.nodeId} selected={o.nodeId === field()}>{o.label}</option>)}
          </select>
        </label>
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
        <Show when={graphFetch.error() ?? routesFetch.error()}>
          {(e) => <ErrorState message={e().message} class="absolute inset-0" />}
        </Show>
        <Show when={!graphFetch.loading() && layout()}>
          {(l) => (
            <>
              <DependencyCanvas
                layout={l()}
                anchor={anchor() ?? undefined}
                focusId={model()?.vm.focusId}
                onFocus={onBoxClick}
                onOpen={openNode}
                onToggleOpen={toggleOpen}
                onPointerAct={() => setSelected(null)}
                onHover={setHovered}
                selectedId={location().dest ?? selected() ?? undefined}
                highlight={model()?.lit ?? null}
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
        <Show when={lineageText() ?? outcomeText()}>
          {(text) => <span class="min-w-0 shrink truncate font-semibold text-[var(--plc-on-surface)]">{text()}</span>}
        </Show>
        <span class="ml-auto min-w-0 truncate tabular-nums">
          {stats()}
          {stats() ? " · " : ""}Click an origin to light what it reaches · Double-click or O opens code · Shift-click opens a frame · / picks a route
        </span>
      </div>

      <RoutePicker open={picker()} routes={routeList()} current={currentRoute()?.key} onClose={() => setPicker(false)} onPick={(r) => pickRoute(r.key)} />
    </div>
  );
}
