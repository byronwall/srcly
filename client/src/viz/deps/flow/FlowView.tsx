import { batch, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack } from "solid-js";
import { ChevronDown, Crosshair, PanelRight, Redo2, RefreshCw, Undo2, X } from "lucide-solid";
import { EmptyState, ErrorState } from "../../../components/feedback/States";
import { Button } from "../../../components/ui/Button";
import { IconButton } from "../../../components/ui/IconButton";
import { fetchAnchorGraph, fetchFileExports, fetchRouteGraph, fetchRoutePath, fetchRouteSurface, fetchRoutes } from "../../../dataflow/api";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import { availabilityFor, ensureStarted, refresh as refreshEngine, statusFor, watchProgress, watchStaleness } from "../../../dataflow/availability";
import { labelFor, reasonText } from "../../../dataflow/outcome";
import { atFromTreePath, encodeAnchor, encodeAnchors, MAX_ANCHORS, parseAnchor, parseAnchors, type Anchor, type Direction } from "../../../navigation/location";
import { canReturn, go, location, replace, returnBack } from "../../../navigation/store";
import { registerViewState } from "../../../navigation/viewState";
import { ViewTools } from "../../viewToolbar";
import { DependencyCanvas, type Camera, type CanvasApi } from "../DependencyCanvas";
import { layoutWithHubs } from "../hubs";
import type { ViewLayout } from "../layout";
import type { ViewNode } from "../viewModel";
import { routeGraphToViewModel } from "./adapter";
import { anchorGraphToViewModel } from "./anchorAdapter";
import { exportsToViewModel } from "./exportsAdapter";
import { anchorsToViewModel } from "./multiAnchorAdapter";
import { FlowInspector } from "./FlowInspector";
import { FlowLegend } from "./FlowLegend";
import { DirectionSwitch, FlowModeSwitch, ReachModeSwitch, RecentFlowMenu } from "./FlowTools";
import { createFetch } from "./fetchSignal";
import { FlowProgress } from "./FlowProgress";
import { reachFrom, REACH_MODES, type ReachMode } from "./reach";
import { RoutePicker } from "./RoutePicker";

const INSPECTOR_KEY = "srcly.flowInspector";
function readInspector(): boolean {
  try {
    return window.localStorage.getItem(INSPECTOR_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeInspector(open: boolean) {
  try {
    window.localStorage.setItem(INSPECTOR_KEY, open ? "1" : "0");
  } catch {
    // Remembering the rail is a convenience only.
  }
}

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
    // ensureStarted reads the recorded status; untracked, or every status write would post /start again.
    untrack(() => ensureStarted(r)).catch((e) => setStartError(String(e?.message ?? e)));
  });
  const availability = () => availabilityFor(root());
  const status = () => statusFor(root());
  /** The generation every fetch names, so a graph never mixes with a newer build: a reply for an older one is `stale`. */
  const generation = () => (availability() === "ready" ? status()?.generation : undefined);
  // While this view is open, watch for edits to the sources.
  createEffect(() => {
    const r = root();
    if (!r) return;
    onCleanup(watchStaleness(r));
  });
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshError, setRefreshError] = createSignal<string | null>(null);
  const doRefresh = async () => {
    const r = root();
    if (!r || refreshing()) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshEngine(r);
    } catch (e) {
      setRefreshError(String((e as Error)?.message ?? e));
    } finally {
      setRefreshing(false);
    }
  };

  // A memo: every status poll writes a new status object, and `routes` must not be asked again on each.
  const routesKey = createMemo(() => (availability() === "ready" ? root() : null));
  const routesFetch = createFetch(routesKey, (r) => fetchRoutes(r));
  const routes = routesFetch.value;
  const routeKey = () => location().flow ?? "";
  const field = () => location().field;
  // Anchor mode: Data flow traced from an expression instead of a route.
  const anchorKey = () => location().anchor;
  // Several anchors share one `anchor` value (T20): the first is the one every single-anchor path reads.
  const anchorSpecs = () => parseAnchors(anchorKey());
  const anchorSpec = () => anchorSpecs()[0] ?? null;
  const primaryAnchorKey = () => (anchorSpec() ? encodeAnchor(anchorSpec()!) : undefined);
  const dir = (): Direction => location().dir ?? "both";
  // The backbone first (T9): the same boxes from the route file alone, drawn
  // while the complete graph (origins, handoffs, gaps) is still being traced.
  // The engine answers one request at a time, so the complete graph is asked
  // for only once the surface has answered.
  const surfaceKey = createMemo(() => (availability() === "ready" && routeKey() && !anchorKey() ? `${root()}\n${routeKey()}\n${generation() ?? ""}` : null));
  const surfaceFetch = createFetch(surfaceKey, (key) => {
    const [path, route, gen] = key.split("\n");
    return fetchRouteSurface({ path, route, ...(gen ? { expectedGeneration: Number(gen) } : {}) });
  });
  const surface = surfaceFetch.value;
  const surfaceSettled = () => !surfaceFetch.loading() && (surface() !== undefined || surfaceFetch.error() !== null);
  // Keys carry the generation: a refresh changes it, so every open graph is fetched again from the new build.
  const graphKey = createMemo(
    () => (availability() === "ready" && routeKey() && !anchorKey() && surfaceSettled() ? `${root()}\n${routeKey()}\n${field() ?? ""}\n${generation() ?? ""}` : null),
  );
  // A file or folder anchor (T19): its exports, one box each, traced on demand.
  const exportsSpec = () => {
    const spec = anchorSpec();
    return spec && "exports" in spec ? spec : null;
  };
  const exportsKey = createMemo(() => (availability() === "ready" && exportsSpec() ? `${root()}\n${exportsSpec()!.file}\n${generation() ?? ""}` : null));
  const exportsFetch = createFetch(exportsKey, (key) => {
    const [path, file, gen] = key.split("\n");
    return fetchFileExports({ path, file, ...(gen ? { expectedGeneration: Number(gen) } : {}) });
  });
  const fileExports = exportsFetch.value;
  const anchorFetchKey = createMemo(() => (availability() === "ready" && anchorSpec() && !exportsSpec() ? `${root()}\n${primaryAnchorKey()}\n${dir()}\n${generation() ?? ""}` : null));
  /** The request fields for one anchor spec: a span, a name on a line, or an element id. */
  const anchorFields = (spec: Anchor) => ("element" in spec ? { file: spec.file, elementId: spec.element } : "exports" in spec ? { file: spec.file } : spec);
  const anchorFetch = createFetch(anchorFetchKey, (key) => {
    const [path, raw, direction, gen] = key.split("\n");
    const spec = parseAnchor(raw)!;
    return watchProgress(path, fetchAnchorGraph({ path, direction: direction as Direction, ...anchorFields(spec), ...(gen ? { expectedGeneration: Number(gen) } : {}) }));
  });
  const anchorGraph = anchorFetch.value;
  // The other anchors (T20): each its own query, one at a time, kept by generation so a Return does not refetch.
  type ExtraAnchor = { raw: string; graph: AnchorGraphResult | null; outcome: string; reason: string | null };
  const moreAnchorGraphs = new Map<string, ExtraAnchor>();
  const moreAnchorsKey = createMemo(() => {
    const rest = anchorSpecs().slice(1);
    const first = anchorGraph()?.graph;
    return availability() === "ready" && rest.length && first ? `${root()}\n${dir()}\n${first.generation}\n${encodeAnchors(rest)}` : null;
  });
  const moreAnchorsFetch = createFetch(moreAnchorsKey, async (key) => {
    const [path, direction, gen, list] = key.split("\n");
    const entries: ExtraAnchor[] = [];
    for (const raw of list.split("|")) {
      const cacheKey = `${path}|${gen}|${direction}|${raw}`;
      if (!moreAnchorGraphs.has(cacheKey)) {
        const spec = parseAnchor(raw);
        if (!spec || "exports" in spec) continue;
        const reply = await fetchAnchorGraph({ path, direction: direction as Direction, ...anchorFields(spec), expectedGeneration: Number(gen) });
        // An anchor the engine cannot trace stays listed with its reason; it never blocks the others.
        moreAnchorGraphs.set(cacheKey, { raw, graph: reply.graph ?? null, outcome: reply.outcome, reason: reply.reason ?? reply.graph?.reason ?? null });
      }
      entries.push(moreAnchorGraphs.get(cacheKey)!);
    }
    return entries;
  });
  /** The anchors after the first, each with its graph or the reason it has none; null until all have answered. */
  const extraAnchors = (): ExtraAnchor[] | null => (anchorSpecs().length > 1 && !moreAnchorsFetch.loading() ? moreAnchorsFetch.value() ?? null : anchorSpecs().length > 1 ? null : []);
  /** Every anchor graph of this generation, the first one first; null until all are in. */
  const anchorGraphs = (): AnchorGraphResult[] | null => {
    const first = anchorGraph()?.graph;
    const extra = extraAnchors();
    if (!first || !extra) return null;
    return [first, ...extra.flatMap((entry) => (entry.graph ? [entry.graph] : []))];
  };
  const merged = createMemo(() => {
    const graphs = anchorGraphs();
    return graphs && graphs.length > 1 ? anchorsToViewModel(graphs) : null;
  });
  /** Drop one anchor from the canvas; the last one cannot go. */
  const removeAnchor = (index: number) => {
    const rest = anchorSpecs().filter((_, i) => i !== index);
    if (rest.length) go({ anchor: encodeAnchors(rest) });
  };
  /** Add a drawn box as an anchor by its span (T20), up to MAX_ANCHORS. */
  const addAnchorFrom = (id: string) => {
    const box = model()?.byId.get(id);
    const specs = anchorSpecs();
    if (!box || !specs.length || specs.length >= MAX_ANCHORS || exportsSpec()) return;
    // By element id: the engine anchors at the very element the box stands for, so the traces share ids by construction.
    const next: Anchor = { file: box.file, element: id };
    if (specs.some((a) => encodeAnchor(a) === encodeAnchor(next))) return;
    setSelected(null);
    go({ anchor: encodeAnchors([...specs, next]) });
  };
  const canAddAnchor = () => anchorSpecs().length >= 1 && anchorSpecs().length < MAX_ANCHORS && !exportsSpec();
  const anchorText = () => anchorGraph()?.graph?.anchor.text ?? (exportsSpec() ? `${exportsSpec()!.file || "."} (exports)` : anchorSpec() && "name" in anchorSpec()! ? (anchorSpec() as { name: string }).name : anchorKey()) ?? "";
  // Opened exports: each is its own anchor graph, fetched one at a time (the engine is serial) and kept by generation.
  const expansionGraphs = new Map<string, AnchorGraphResult | null>();
  const expansionKey = createMemo(() => {
    const result = fileExports()?.exports;
    if (!result) return null;
    const ids = new Set(result.files.flatMap((file) => file.exports.filter((e) => e.traceable).map((e) => e.id)));
    const wanted = (location().open ?? []).filter((id) => ids.has(id)).sort();
    return wanted.length ? `${root()}\n${dir()}\n${result.generation}\n${wanted.join(",")}` : null;
  });
  const expansionFetch = createFetch(expansionKey, async (key) => {
    const [path, direction, gen, list] = key.split("\n");
    const graphs = new Map<string, AnchorGraphResult | null>();
    for (const id of list.split(",")) {
      const cacheKey = `${path}|${gen}|${direction}|${id}`;
      if (!expansionGraphs.has(cacheKey)) {
        const spec = parseAnchor(id);
        if (!spec || !("name" in spec)) continue;
        const reply = await fetchAnchorGraph({ path, direction: direction as Direction, ...spec, expectedGeneration: Number(gen) });
        expansionGraphs.set(cacheKey, reply.graph ?? null);
      }
      graphs.set(id, expansionGraphs.get(cacheKey) ?? null);
    }
    return graphs;
  });
  const graphFetch = createFetch(graphKey, (key) => {
    const [path, route, source, gen] = key.split("\n");
    return watchProgress(path, fetchRouteGraph({ path, route, source: source || undefined, ...(gen ? { expectedGeneration: Number(gen) } : {}) }));
  });
  /** The complete graph when it has arrived for this route and generation, else the backbone. */
  const drawnGraph = () => {
    const g = graph()?.graph;
    if (g && g.route.key === (currentRoute()?.key ?? g.route.key)) return g;
    const s = surface()?.graph;
    return s && (!routeKey() || s.route.key === currentRoute()?.key || s.route.pathPattern === routeKey()) ? s : g ?? null;
  };
  /** The sources changed under the drawn graph, or the engine refused the generation it was drawn from. */
  const stale = () => Boolean(status()?.stale) || graph()?.outcome === "stale" || anchorGraph()?.outcome === "stale";
  const graph = graphFetch.value;
  const routeList = () => routes()?.routes ?? [];
  const currentRoute = () => routeList().find((r) => r.key === routeKey() || r.pathPattern === routeKey());

  const [picker, setPicker] = createSignal(false);
  // No route yet: offer the picker as soon as there are routes to pick.
  createEffect(() => {
    if (!routeKey() && !anchorKey() && routeList().length > 0) untrack(() => setPicker(true));
  });

  const model = createMemo(() => {
    if (exportsSpec()) {
      const result = fileExports()?.exports;
      return result ? exportsToViewModel(result, { expanded: location().open ?? [], graphs: expansionFetch.value() ?? new Map(), dir: dir() }) : null;
    }
    if (anchorKey()) {
      const many = merged();
      if (many) return many.model;
      if (anchorSpecs().length > 1 && !extraAnchors()) return null;
      const a = anchorGraph()?.graph;
      return a ? anchorGraphToViewModel(a) : null;
    }
    const g = drawnGraph();
    return g ? routeGraphToViewModel(g, { expanded: location().open ?? [] }) : null;
  });

  const [layout, setLayout] = createSignal<ViewLayout | null>(null);
  const [selected, setSelected] = createSignal<string | null>(null);
  /** A clicked handoff or field edge (route mode): the inspector explains it in order (M4). */
  const [selectedEdge, setSelectedEdge] = createSignal<string | null>(null);
  const edgePathKey = createMemo(() => {
    const id = selectedEdge();
    const g = graph()?.graph;
    return id && g && !anchorKey() ? `${root()}\n${g.route.key}\n${g.selectedSource ?? ""}\n${id}\n${g.generation}` : null;
  });
  const edgePath = createFetch(edgePathKey, (key) => {
    const [path, route, source, edge, gen] = key.split("\n");
    return fetchRoutePath({ path, route, edge, source: source || undefined, expectedGeneration: Number(gen) });
  });
  const [hovered, setHovered] = createSignal<ViewNode | null>(null);
  const [reachMode, setReachMode] = createSignal<ReachMode>("both");
  /** The selected box's reach over the drawn view: what is proven to reach it, and what it reaches. */
  const reach = createMemo(() => {
    const m = model();
    const s = selected();
    if (!m || !s || !m.vm.nodes.some((n) => n.id === s)) return null;
    return reachFrom(m.vm, s, reachMode(), { exclude: m.notFlow });
  });
  /** What the canvas keeps lit: a selected box's reach, else the selected origin's destinations. */
  const highlight = () => {
    const r = reach();
    if (r) return { nodes: r.strong.nodes, edges: r.strong.edges, light: r.light, frontier: r.frontier, dim: 0.35 };
    return model()?.lit ?? null;
  };
  let canvas: CanvasApi | undefined;
  let host!: HTMLDivElement;
  let pendingAnchor: string | null = null;
  // ---- view state (T17): what Return restores that the URL does not carry ----
  /** A camera for the next layout instead of a fit: the one the place was left with, for that place's URL only. */
  let restoreCamera: { camera: Camera; search: string } | null = null;
  onCleanup(
    registerViewState<{ selected: string | null; edge: string | null; reach: ReachMode; camera: Camera | null }>("graph.view", {
      capture: () => ({ selected: selected(), edge: selectedEdge(), reach: reachMode(), camera: canvas?.getCamera() ?? null }),
      restore: (part) => {
        batch(() => {
          setSelected(typeof part?.selected === "string" ? part.selected : null);
          setSelectedEdge(typeof part?.edge === "string" ? part.edge : null);
          if (REACH_MODES.some((m) => m.id === part?.reach)) setReachMode(part.reach);
        });
        const camera = part?.camera;
        restoreCamera = camera && Number.isFinite(camera.k) && Number.isFinite(camera.x) && Number.isFinite(camera.y) ? { camera, search: window.location.search } : null;
      },
    }),
  );
  /** Asked by the canvas once per layout: the held camera when the layout is the returned-to place's. */
  const cameraForLayout = () => {
    const held = restoreCamera;
    restoreCamera = null;
    return held && held.search === window.location.search ? held.camera : null;
  };
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

  /** Open a source location in the code viewer (an absolute path under the scan root). */
  const openAt = (absPath: string, line: number) => {
    const at = atFromTreePath(absPath, root());
    if (at !== null) props.onOpen(at, line);
  };
  const openNode = (n: ViewNode) => {
    const flow = model()?.byId.get(n.id);
    if (flow) openAt(flow.absPath, flow.line);
  };
  const [inspector, setInspector] = createSignal(readInspector());
  const toggleInspector = () => {
    const next = !inspector();
    setInspector(next);
    writeInspector(next);
  };
  /** Open or fold a frame in place from the inspector; the canvas keeps the frame where it was. */
  const toggleFrame = (id: string) => {
    pendingAnchor = id;
    setOpen(openList().includes(id) ? openList().filter((x) => x !== id) : [...openList(), id]);
  };
  const pickRoute = (key: string) => {
    setSelected(null);
    go({ flow: key, anchor: undefined, dir: undefined, open: undefined, field: undefined, dest: undefined });
  };
  /** Leave anchor mode for the route picker. */
  const toRoutes = () => {
    setSelected(null);
    go({ flow: "", anchor: undefined, dir: undefined, open: undefined, field: undefined, dest: undefined });
  };
  /** Pick an origin (or clear it): its proven destinations light up. No Back step. */
  const pickOrigin = (id: string | undefined) => {
    setSelected(null);
    replace({ field: id, dest: undefined });
  };
  /** A click: an origin selects itself as the source; a lit box becomes the destination. */
  const onBoxClick = (n: ViewNode) => {
    const flow = model()?.byId.get(n.id);
    if (flow?.kind === "origin" && !anchorKey()) return pickOrigin(field() === n.id ? undefined : n.id);
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
  /** The selected box's reach, for the status line. */
  const reachText = () => {
    const r = reach();
    const n = r && model()?.byId.get(r.seed);
    if (!r || !n) return null;
    const box = (k: number) => `${k} box${k === 1 ? "" : "es"}`;
    const parts = [n.label];
    if (r.mode !== "down") parts.push(r.counts.up ? `reached from ${box(r.counts.up)}` : "nothing proven reaches it");
    if (r.mode !== "up") parts.push(r.counts.down ? `reaches ${box(r.counts.down)}` : "reaches nothing proven");
    if (r.counts.frontier) parts.push(`${r.counts.frontier} stop${r.counts.frontier === 1 ? "s" : ""} at a frontier`);
    return parts.join(" · ");
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector('[aria-modal="true"], [role="menu"]')) return;
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.key === "ArrowLeft" && canReturn()) returnBack();
        else if (e.key === "ArrowRight") window.history.forward();
        else return;
        return e.preventDefault();
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const n = layout()?.nodes.find((p) => p.id === selected())?.node ?? hovered();
      if (key === "/") setPicker(true);
      else if (key === "0") canvas?.fit();
      else if (key === "i") toggleInspector();
      else if (key === "r" && selected()) setReachMode(REACH_MODES[(REACH_MODES.findIndex((m) => m.id === reachMode()) + 1) % REACH_MODES.length].id);
      else if (key === "Escape" && (selectedEdge() || selected() || field())) {
        if (selectedEdge()) setSelectedEdge(null);
        else if (selected()) setSelected(null);
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
    if (exportsSpec()) {
      const e = fileExports();
      return e ? labelFor(e.outcome, e.reason, e.message ?? undefined) : null;
    }
    if (anchorKey()) {
      const a = anchorGraph();
      return a ? labelFor(a.outcome, a.reason, a.message ?? a.graph?.reason ?? undefined) : null;
    }
    const g = graph();
    return g ? labelFor(g.outcome, g.reason, g.message ?? g.graph?.unavailableReason) : null;
  };
  const stats = () => {
    const m = model();
    const a = anchorGraph()?.graph;
    if (exportsSpec()) {
      const result = fileExports()?.exports;
      if (!m || !result) return "";
      const opened = (location().open ?? []).length;
      return `${result.counts.exports} export${result.counts.exports === 1 ? "" : "s"} in ${result.counts.files} file${result.counts.files === 1 ? "" : "s"} · ${result.counts.traceable} traceable · ${opened} opened · generation ${result.generation}`;
    }
    if (anchorKey()) {
      if (!m || !a) return "";
      const many = merged();
      const failed = (extraAnchors() ?? []).filter((entry) => !entry.graph).length;
      if (many) {
        const graphs = anchorGraphs() ?? [];
        return `${graphs.length} anchors · ${many.shared.size} shared box${many.shared.size === 1 ? "" : "es"} · ${m.vm.nodes.length} boxes${failed ? ` · ${failed} not traced` : ""} · generation ${a.generation}`;
      }
      const c = a.counts;
      const stops = [c.boundaries ? `${c.boundaries} boundar${c.boundaries === 1 ? "y" : "ies"}` : "", c.frontiers ? `${c.frontiers} frontier${c.frontiers === 1 ? "" : "s"}` : ""].filter(Boolean);
      return `${c.up} upstream · ${c.down} downstream · ${c.origins} origin${c.origins === 1 ? "" : "s"} · ${c.terminals} terminal${c.terminals === 1 ? "" : "s"} · ${c.scopes} function${c.scopes === 1 ? "" : "s"}${stops.length ? ` · ${stops.join(" · ")}` : ""} · generation ${a.generation}`;
    }
    const g = drawnGraph();
    if (!m || !g) return "";
    const c = g.counts;
    const folded = m.vm.rolledUp ? ` · ${m.vm.rolledUp} folded` : "";
    const omitted = c.omittedItems ? ` · ${c.omittedItems} omitted by the engine` : "";
    if (g.phase === "surface") return `backbone · ${c.occurrences} occurrences · ${c.boundaries} boundaries · ${c.terminals} terminals${folded} · tracing evidence… · generation ${g.generation}`;
    return `${c.occurrences} occurrences · ${c.boundaries} boundaries · ${c.terminals} terminals · ${c.origins} origins${folded}${omitted} · generation ${g.generation}`;
  };
  const waitingOn = () => {
    if (availability() !== "ready") return "Starting the data-flow engine";
    if (anchorFetch.loading()) return `Tracing from ${anchorText()}`;
    if (anchorSpecs().length > 1 && anchorGraph()?.graph && !extraAnchors()) return `Tracing ${anchorSpecs().length} anchors`;
    if (exportsFetch.loading()) return `Listing the exports of ${exportsSpec()?.file || "."}`;
    // With the backbone drawn, the complete graph loads behind it; the status line says so.
    if (graphFetch.loading() && !drawnGraph()) return `Tracing ${currentRoute()?.pathPattern ?? routeKey()}`;
    return null;
  };

  return (
    <div class="flex h-full flex-col bg-[var(--plc-surface)]">
      <ViewTools>
        <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-[var(--plc-border)]" />
        <FlowModeSwitch />
        <Show when={anchorSpec()}>
          <Button
            variant="ghost"
            class="max-w-[22rem] gap-1 px-2"
            onClick={() => {
              const a = anchorGraph()?.graph;
              if (a) openAt(a.anchor.absPath, a.anchor.span.startLine);
            }}
            title="The expression this flow is traced from · click opens it in the code viewer"
          >
            <Crosshair size={13} aria-hidden="true" class="shrink-0 text-[var(--plc-accent)]" />
            <span class="text-[var(--plc-on-muted)]">{anchorSpecs().length > 1 ? "Anchors" : "Anchor"}</span>
            <span class="min-w-0 truncate font-mono text-[11.5px] font-medium">{anchorText()}</span>
          </Button>
          <For each={extraAnchors() ?? []}>
            {(entry, i) => (
              <span
                class="flex max-w-[14rem] shrink-0 items-center gap-0.5 rounded-md border pl-1.5 text-[11.5px]"
                classList={{ "border-[var(--plc-border)]": !!entry.graph, "border-[var(--plc-warning)] text-[var(--plc-warning)]": !entry.graph }}
                title={entry.graph ? `${entry.graph.anchor.text} · ${entry.graph.anchor.file}:${entry.graph.anchor.span.startLine}` : `Not traced: ${labelFor(entry.outcome as "ok", entry.reason, undefined) ?? entry.reason ?? entry.outcome} · ${entry.raw}`}
              >
                <span class="min-w-0 truncate font-mono font-medium">{entry.graph ? entry.graph.anchor.text : `${entry.raw.slice(entry.raw.lastIndexOf("/") + 1)} · not traced`}</span>
                <IconButton label={`Remove anchor ${entry.graph ? entry.graph.anchor.text : entry.raw}`} size="xs" onClick={() => removeAnchor(i() + 1)}>
                  <X size={11} aria-hidden="true" />
                </IconButton>
              </span>
            )}
          </For>
          <DirectionSwitch dir={dir()} onChange={(d) => replace({ dir: d === "both" ? undefined : d })} />
          <Button variant="ghost" class="px-2" onClick={toRoutes} title="Trace a route instead (/)">
            Routes
          </Button>
        </Show>
        <Show when={!anchorSpec()}>
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
        </Show>
        <Show when={reach()}>
          <ReachModeSwitch mode={reachMode()} onChange={setReachMode} />
        </Show>
        <Button variant="ghost" class="px-2" onClick={() => canvas?.fit()} title="Fit the graph to the window (0)" disabled={!layout()}>
          Fit
        </Button>
        <IconButton label="Return" title="Return to the previous place as you left it: camera, selection, metric and filters (Alt+←)" onClick={returnBack} disabled={!canReturn()}>
          <Undo2 size={14} aria-hidden="true" />
        </IconButton>
        <IconButton label="Forward" title="Forward again, as you left it (Alt+→)" onClick={() => window.history.forward()}>
          <Redo2 size={14} aria-hidden="true" />
        </IconButton>
        <RecentFlowMenu routeName={(key) => routeList().find((r) => r.key === key)?.pathPattern ?? key} />
        <Button variant="ghost" class="gap-1 px-2" active={inspector()} aria-pressed={inspector()} onClick={toggleInspector} title="Show or hide the inspector (I)">
          <PanelRight size={13} aria-hidden="true" />
          Inspector
        </Button>
      </ViewTools>

      <div class="flex min-h-0 flex-1">
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
        <Show when={routes()?.outcome === "ok" && routeList().length === 0 && !anchorKey()}>
          <EmptyState
            class="absolute inset-0"
            title="No routes here"
            description="Data flow starts from a route: a file under a routes/ folder that default-exports a component. Open a folder that has one."
          />
        </Show>
        <Show when={graphFetch.error() ?? anchorFetch.error() ?? exportsFetch.error() ?? expansionFetch.error() ?? routesFetch.error()}>
          {(e) => <ErrorState message={e().message} class="absolute inset-0" />}
        </Show>
        <Show when={(stale() || refreshing() || refreshError()) && availability() === "ready"}>
          <div
            role="status"
            class="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-[var(--plc-warning)] bg-[var(--plc-surface)] px-3 py-1 text-[12px] shadow-sm"
          >
            <RefreshCw size={13} aria-hidden="true" class={refreshing() ? "animate-spin text-[var(--plc-accent)]" : "text-[var(--plc-warning)]"} />
            <span class="font-semibold text-[var(--plc-on-surface)]">
              {refreshing() ? "Rebuilding from the sources as they are now…" : refreshError() ? `Refresh failed: ${refreshError()}` : "Source changed. Refresh."}
            </span>
            <Show when={!refreshing()}>
              <Button variant="ghost" class="px-2" onClick={() => void doRefresh()} title="Rebuild the analysis from the sources as they are now">
                Refresh
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={!graphFetch.loading() && !anchorFetch.loading() && !exportsFetch.loading() && layout()}>
          {(l) => (
            <>
              <DependencyCanvas
                layout={l()}
                anchor={anchor() ?? undefined}
                focusId={model()?.vm.focusId}
                onFocus={onBoxClick}
                onOpen={openNode}
                onToggleOpen={toggleOpen}
                onPointerAct={() => {
                  setSelected(null);
                  setSelectedEdge(null);
                }}
                onSelectEdge={(edge) => {
                  setSelected(null);
                  // The adapter prefixes a flow edge's id with its kind; the engine knows the bare id.
                  setSelectedEdge(edge.id.replace(/^(handoff|field|render):/, ""));
                }}
                onHover={setHovered}
                selectedId={location().dest ?? selected() ?? undefined}
                highlight={highlight()}
                collapsible={collapsible}
                onCollapse={collapse}
                ref={(api) => (canvas = api)}
                cameraForLayout={cameraForLayout}
                linkCounts="flow"
              />
              <FlowLegend />
            </>
          )}
        </Show>
      </div>
      <Show when={inspector() && !graphFetch.loading() && !anchorFetch.loading() && (anchorKey() ? anchorGraph()?.graph : graph()?.graph) && model()}>
        <FlowInspector
          graph={anchorKey() ? null : (graph()?.graph ?? null)}
          anchor={anchorKey() ? (anchorGraph()?.graph ?? null) : null}
          model={model()!}
          rootPath={root()}
          selected={location().dest ?? selected()}
          edge={selectedEdge()}
          edgePath={{ loading: edgePath.loading(), value: edgePath.value(), error: edgePath.error() }}
          onSelectEdge={setSelectedEdge}
          reach={reach()}
          open={openList()}
          onOpen={openAt}
          onSelect={(id) => {
            if (location().dest) replace({ dest: undefined });
            setSelected(id);
          }}
          onPickOrigin={pickOrigin}
          onToggleFrame={toggleFrame}
          onAddAnchor={canAddAnchor() ? addAnchorFrom : undefined}
          onClose={toggleInspector}
        />
      </Show>
      </div>

      <div class="flex items-center gap-3 border-t border-[var(--plc-border)] px-3 py-1 text-[11px] text-[var(--plc-on-subtle)]" aria-live="polite">
        <Show when={reachText() ?? lineageText() ?? outcomeText()}>
          {(text) => <span class="max-w-[60%] shrink-0 truncate font-semibold text-[var(--plc-on-surface)]" title={text()}>{text()}</span>}
        </Show>
        <span class="ml-auto min-w-0 truncate tabular-nums">
          {stats()}
          {stats() ? " · " : ""}Click a box to light its reach (R: both, up, down) · Double-click or O opens code · Shift-click opens a frame · / picks a route
        </span>
      </div>

      <RoutePicker open={picker()} routes={routeList()} current={currentRoute()?.key} onClose={() => setPicker(false)} onPick={(r) => pickRoute(r.key)} />
    </div>
  );
}
