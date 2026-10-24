import { batch, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show, untrack } from "solid-js";
import { Keyboard, Minus, Plus, RotateCcw, Search } from "lucide-solid";
import { EmptyState, ErrorState, LoadingState } from "../../components/feedback/States";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import { ViewTools } from "../viewToolbar";
import type { DependencyGraphContract } from "./contract";
import { DependencyCanvas, type CanvasApi } from "./DependencyCanvas";
import { DependencyLegend } from "./DependencyLegend";
import FlowView from "./flow/FlowView";
import { FlowModeSwitch } from "./flow/FlowTools";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { GoToPalette, type GoToMode } from "./GoToPalette";
import type { GoToHit } from "./goto";
import { clickAction, nextInDirection, type Direction } from "./interaction";
import {
  applyFilters,
  buildIndex,
  collapseChain,
  displayName,
} from "./hierarchy";
import { layoutWithHubs } from "./hubs";
import type { ViewLayout } from "./layout";
import { viewContents, viewMetrics, type MetricsIndex } from "./metrics";
import { buildViewModel, DEFAULT_BUDGET, type ViewNode } from "./viewModel";
import { folderOf, graphIdFor } from "../../navigation/location";
import NodeActionsMenu, { type NodeMenuTarget } from "../../navigation/NodeActionsMenu";
import { go, graphFilters as filters, location, replace, setGraphFilters as setFilters } from "../../navigation/store";

async function fetchGraph(path: string | undefined): Promise<DependencyGraphContract> {
  const url = new URL("/api/analysis/dependency-graph", window.location.origin);
  if (path) url.searchParams.set("path", path);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to load dependencies (${res.status})`);
  return (await res.json()) as DependencyGraphContract;
}

/** The graph view: the import graph, or Data flow mode when the URL names `flow`. */
export default function DependencyView(props: Parameters<typeof ImportView>[0]) {
  return (
    <Show when={location().flow !== undefined} fallback={<ImportView {...props} />}>
      <FlowView rootPath={props.rootPath} onOpen={props.onOpen} />
    </Show>
  );
}

function ImportView(props: {
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
  /** The box the current layout opened or closed in place (see `pendingAnchor`). */
  const [anchor, setAnchor] = createSignal<string | null>(null);
  const [menu, setMenu] = createSignal<(NodeMenuTarget & { node: ViewNode }) | null>(null);
  const [help, setHelp] = createSignal(false);
  const [goTo, setGoTo] = createSignal(false);
  /** The keyboard selection, by graph id so it survives relayouts. */
  const [selected, setSelected] = createSignal<string | null>(null);
  /** The box under the pointer, reported by the canvas: keys act on it when nothing is selected. */
  const [hovered, setHovered] = createSignal<ViewNode | null>(null);
  /** Shift is down: a click opens in place instead of focusing. */
  const [shiftHeld, setShiftHeld] = createSignal(false);
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
    return buildViewModel(idx, { focusId: f, budget: DEFAULT_BUDGET, expanded: location().open ?? [] });
  });

  // ---- Expand in place: the URL's `open` list, edited without a Back step ----
  const openList = () => location().open ?? [];
  const setOpen = (ids: string[]) => replace({ open: [...new Set(ids)].sort() });
  /** `id` is `root` or inside it (folder paths, then `file#symbol`). */
  const within = (root: string, id: string) => id === root || id.startsWith(`${root}/`) || id.startsWith(`${root}#`);
  /**
   * The one box being opened or closed in place, for the next layout: it keeps
   * the old layout's order and the camera stays on that box.
   */
  let pendingAnchor: string | null = null;
  const expand = (graphId: string) => {
    pendingAnchor = graphId;
    setOpen([...openList(), graphId]);
  };
  /** Close a folder and everything opened inside it. */
  const collapse = (graphId: string) => {
    pendingAnchor = graphId;
    setOpen(openList().filter((id) => !within(graphId, id)));
  };
  /** A frame can close when an expansion sits at or under it. */
  const collapsible = (groupId: string) => (viewModel()?.expanded ?? []).some((id) => within(groupId, id));
  /** One level deeper everywhere: open every folder box on screen. */
  const levelUpTargets = createMemo(() =>
    (viewModel()?.nodes ?? []).filter((n) => n.kind === "folder" && n.expandable).map((n) => n.graphId),
  );
  const expandLevel = () => {
    const t = levelUpTargets();
    if (t.length) setOpen([...openList(), ...t]);
  };
  /** One level back: close the deepest expansions. */
  const collapseLevel = () => {
    const active = viewModel()?.expanded ?? [];
    if (!active.length) return;
    const depth = (id: string) => id.split(/[/#]/).length;
    const deepest = Math.max(...active.map(depth));
    const drop = new Set(active.filter((id) => depth(id) === deepest));
    setOpen(openList().filter((id) => !drop.has(id)));
  };

  /**
   * The selected box: the box for the selected graph id, else (after it was
   * opened in place) the first box inside it, top-left first.
   */
  const selectedBox = createMemo((): ViewNode | null => {
    const id = selected();
    const l = layout();
    if (!id || !l) return null;
    const exact = l.nodes.find((n) => n.node.graphId === id);
    if (exact) return exact.node;
    const inside = l.nodes.filter((n) => within(id, n.node.graphId)).sort((a, b) => a.y - b.y || a.x - b.x);
    return inside[0]?.node ?? null;
  });
  const target = () => selectedBox() ?? hovered();
  const select = (n: ViewNode | null) => {
    setSelected(n?.graphId ?? null);
    if (n) canvas?.reveal(n.id);
  };

  const move = (dir: Direction) => {
    const l = layout();
    if (!l?.nodes.length) return;
    const from = target() ?? l.nodes.find((n) => n.node.isFocus)?.node;
    if (!from) return select([...l.nodes].sort((a, b) => a.y - b.y || a.x - b.x)[0].node);
    // The first press selects the box you start from.
    if (!selectedBox()) return select(from);
    const next = nextInDirection(l.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height })), from.id, dir);
    if (next) select(l.nodes.find((n) => n.id === next)!.node);
  };

  /** Close the opened folder a box sits in. */
  const closeFrame = (n: ViewNode) => {
    if (n.group && collapsible(n.group.id)) {
      setSelected(n.group.id);
      collapse(n.group.id);
    }
  };
  /** Alt-click, E, Space: open in place, or close the frame around it. */
  const toggleOpen = (n: ViewNode) => {
    if (n.expandable) {
      setSelected(n.graphId);
      expand(n.graphId);
    } else closeFrame(n);
  };
  /** Focus the parent folder, keeping the old focus selected so you can see where you were. */
  const up = () => {
    const idx = index();
    const f = effectiveFocus();
    if (!idx || f === null) return;
    for (let p = idx.byId.get(f)?.parent ?? null; p !== null; p = idx.byId.get(p)?.parent ?? null) {
      const at = collapseChain(idx, p);
      if (at !== f) {
        setSelected(f);
        go({ at });
        return;
      }
    }
  };

  /** A go-to pick: focus it, open it in place, or open its code. */
  const goToPick = (hit: GoToHit, mode: GoToMode) => {
    const idx = index();
    if (!idx) return;
    const id = hit.node.id;
    if (mode === "code" && hit.node.kind !== "folder") {
      props.onOpen(id, hit.node.kind === "symbol" ? hit.node.line : undefined);
      return;
    }
    setSelected(id);
    if (mode === "expand" && hit.node.kind !== "symbol") expand(id);
    else go({ at: collapseChain(idx, id) });
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.metaKey || e.ctrlKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (help()) {
        if (e.key === "Escape" || e.key === "?") {
          setHelp(false);
          e.preventDefault();
        }
        return;
      }
      // Another dialog or a menu owns the keyboard.
      if (document.querySelector('[aria-modal="true"], [role="menu"]')) return;
      if (e.altKey) {
        if (e.key === "ArrowLeft") window.history.back();
        else if (e.key === "ArrowRight") window.history.forward();
        else return;
        e.preventDefault();
        return;
      }
      const n = target();
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "?") setHelp(true);
      else if (key === "/") setGoTo(true);
      else if (key === "ArrowLeft") move("left");
      else if (key === "ArrowRight") move("right");
      else if (key === "ArrowUp") move("up");
      else if (key === "ArrowDown") move("down");
      else if (key === "Escape" && selected()) setSelected(null);
      else if (key === "+" || key === "=") expandLevel();
      else if (key === "-" || key === "_") collapseLevel();
      else if (key === "r") setOpen([]);
      else if (key === "0") canvas?.fit();
      else if (key === "x") setFilters((f) => ({ ...f, showExternal: !f.showExternal }));
      else if (key === "t") setFilters((f) => ({ ...f, showTests: !f.showTests }));
      else if (key === "y") setFilters((f) => ({ ...f, showTypeOnly: !f.showTypeOnly }));
      else if (key === "u" || key === "Backspace") up();
      else if (n && key === "Enter") {
        if (e.shiftKey) toggleOpen(n);
        else {
          setSelected(n.graphId);
          onFocusNode(n);
        }
      } else if (n && key === "f") {
        setSelected(n.graphId);
        onFocusNode(n);
      } else if (n && (key === "e" || key === " ")) toggleOpen(n);
      else if (n && key === "c") closeFrame(n);
      else if (n && key === "o") onOpenNode(n);
      else if (n && key === "m") {
        const r = canvas?.screenRect(n.id);
        if (r) openMenu(n, { x: r.left, y: r.bottom + 4 });
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));

    // Shift changes what a click does: track it for the cursor and status line.
    const onShift = (e: KeyboardEvent) => setShiftHeld(e.shiftKey);
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onShift);
    window.addEventListener("keyup", onShift);
    window.addEventListener("blur", onBlur);
    onCleanup(() => {
      window.removeEventListener("keydown", onShift);
      window.removeEventListener("keyup", onShift);
      window.removeEventListener("blur", onBlur);
    });
  });

  let layoutToken = 0;
  createEffect(() => {
    const vm = viewModel();
    if (!vm) return;
    const token = ++layoutToken;
    const rect = host?.getBoundingClientRect();
    const aspectRatio = rect && rect.height > 0 ? rect.width / rect.height : 1.6;
    const viewport = rect && rect.height > 0 ? { width: rect.width, height: rect.height } : undefined;
    const anchorId = pendingAnchor;
    pendingAnchor = null;
    const previous = anchorId ? (untrack(layout) ?? undefined) : undefined;
    void Promise.resolve().then(() => {
      if (token !== layoutToken) return;
      const next = layoutWithHubs(vm, { aspectRatio, viewport, previous });
      batch(() => {
        setAnchor(previous ? anchorId : null);
        setLayout(next);
      });
    });
  });

  // Metrics per box: follows the layout and the scan, never the color
  // metric, so recoloring repaints without a relayout.
  const boxMetrics = createMemo(() => {
    const l = layout();
    const idx = index();
    return l && idx ? viewMetrics(idx, l.nodes.map((n) => n.node), props.metricsIndex) : undefined;
  });

  // Folder boxes' children by size, for their contents strip and card.
  const boxContents = createMemo(() => {
    const l = layout();
    const idx = index();
    return l && idx ? viewContents(idx, l.nodes.map((n) => n.node), props.metricsIndex) : undefined;
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
    // Folders have no code: a double-click focuses them instead.
    if (n.kind === "folder") onFocusNode(n);
    else if (n.kind === "file") props.onOpen(n.graphId);
    else if (n.kind === "symbol") props.onOpen(n.graphId, index()?.byId.get(n.graphId)?.line);
  };

  const openMenu = (n: ViewNode, point: { x: number; y: number }) => {
    const frame = n.group && collapsible(n.group.id) ? n.group : undefined;
    setMenu({
      ...point,
      node: n,
      at: n.graphId,
      kind: n.kind,
      title: n.title || n.label,
      currentAt: effectiveFocus() ?? location().at,
      expand: n.expandable ? true : frame ? { collapse: frame.label } : undefined,
    });
  };

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

  const stats = createMemo(() => {
    const vm = viewModel();
    if (!vm) return "";
    const links = vm.edges.reduce((a, e) => a + e.weight, 0);
    const opened = vm.expanded?.length ?? 0;
    const base = `${vm.nodes.length} boxes · ${vm.edges.length} edges (${links} links)${opened ? ` · ${opened} opened` : ""}`;
    const l = layout();
    const hidden = l?.hiddenEdges?.length ?? 0;
    const hubs = l?.hubs?.length ?? 0;
    return hidden ? `${base} · ${hidden} behind ${hubs} hub${hubs === 1 ? "" : "s"}` : base;
  });

  return (
    <div class="flex h-full flex-col bg-[var(--plc-surface)]">
      {/* Graph tools join the view toolbar; what's included lives in its filter menu. */}
      <ViewTools>
        <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-[var(--plc-border)]" />
        <FlowModeSwitch />
        <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-[var(--plc-border)]" />
        {/* A stepper: the label sits between the two steps it names. */}
        <div class="flex shrink-0 items-center" role="group" aria-label="Detail">
          <IconButton label="Less detail: close the deepest opened folders (−)" disabled={!(viewModel()?.expanded?.length)} onClick={collapseLevel}>
            <Minus size={14} />
          </IconButton>
          <span class="plc-collapsible-label px-1 text-[12px] text-[var(--plc-on-muted)]">Detail</span>
          <IconButton label="More detail: open every folder box in place (+)" disabled={levelUpTargets().length === 0} onClick={expandLevel}>
            <Plus size={14} />
          </IconButton>
          <IconButton label="Close every opened folder" disabled={!(viewModel()?.expanded?.length)} onClick={() => setOpen([])}>
            <RotateCcw size={14} />
          </IconButton>
        </div>
        <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-[var(--plc-border)]" />
        <Button variant="ghost" class="px-2" onClick={() => canvas?.fit()} title="Fit the graph to the window (0)">
          Fit
        </Button>
        <IconButton label="Go to a folder, file or symbol (/)" onClick={() => setGoTo(true)}>
          <Search size={14} />
        </IconButton>
        <IconButton label="Keyboard and mouse shortcuts (?)" onClick={() => setHelp(true)}>
          <Keyboard size={14} />
        </IconButton>
      </ViewTools>

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
                anchor={anchor() ?? undefined}
                focusId={effectiveFocus() ?? undefined}
                focusFrame={focusFrame()}
                onFocus={onFocusNode}
                onToggleOpen={toggleOpen}
                shiftHeld={shiftHeld()}
                onPointerAct={() => setSelected(null)}
                onHover={setHovered}
                selectedId={selectedBox()?.id}
                onOpen={onOpenNode}
                collapsible={collapsible}
                onCollapse={collapse}
                onMenu={openMenu}
                ref={(api) => (canvas = api)}
                metrics={boxMetrics()}
                contents={boxContents()}
                colorMetric={props.colorMetric}
              />
              <DependencyLegend />
            </>
          )}
        </Show>
      </div>

      <ClickStatus node={hovered()} shift={shiftHeld()} focusId={effectiveFocus()} collapsible={collapsible} stats={stats()} />

      <ShortcutsDialog open={help()} onClose={() => setHelp(false)} />
      <GoToPalette open={goTo()} index={index()} near={effectiveFocus() ?? ""} onClose={() => setGoTo(false)} onPick={goToPick} />

      <Show when={menu()}>
        {(m) => (
          <NodeActionsMenu
            target={m()}
            onClose={() => setMenu(null)}
            onAction={(id) => {
              const n = m().node;
              if (id === "focus") onFocusNode(n);
              else if (id === "expand") n.expandable ? expand(n.graphId) : n.group && collapse(n.group.id);
              else if (id === "open") onOpenNode(n);
              else go({ at: folderOf(n.graphId) });
            }}
          />
        )}
      </Show>
    </div>
  );
}

/**
 * The status line under the graph: what a click does right now, in bold (it
 * follows Shift and the hovered box), and the graph's size, quietly.
 */
function ClickStatus(props: {
  node: ViewNode | null;
  shift: boolean;
  focusId: string | null;
  collapsible: (groupId: string) => boolean;
  stats: string;
}) {
  const action = () => {
    const n = props.node;
    const name = n ? n.label : undefined;
    if (!n) return props.shift ? "Shift-click opens a box in place" : "Click focuses a box";
    const a = clickAction(n, { shift: props.shift, focusId: props.focusId, collapsible: props.collapsible });
    if (a.kind === "focus") return `Click focuses ${name}`;
    if (a.kind === "isolate") return `Click isolates ${name}`;
    if (a.kind === "expand") return n.kind === "file" ? `Shift-click shows ${name}'s symbols` : `Shift-click opens ${name} in place`;
    if (a.kind === "collapse") return `Shift-click closes ${a.frame}`;
    return props.shift ? `Nothing to open in ${name}` : `${name} is the focus`;
  };
  return (
    <div class="flex items-center gap-3 border-t border-[var(--plc-border)] px-3 py-1 text-[11px] text-[var(--plc-on-subtle)]" aria-live="polite">
      <span
        class="shrink-0 font-semibold"
        classList={{ "text-[var(--plc-accent)]": props.shift, "text-[var(--plc-on-surface)]": !props.shift }}
      >
        {action()}
      </span>
      <span class="ml-auto min-w-0 truncate tabular-nums">
        {props.stats} · Double-click opens code · Right-click for actions · ? for keys
      </span>
    </div>
  );
}
