import * as d3 from "d3";
import { createEffect, createMemo, createRenderEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { makeTextMeasurer, truncateTextToWidth } from "../../utils/svgText";
import { formatMetricValue, metricLabel, type MetricId } from "../../utils/metricsStore";
import { treemapFillColor, treemapRampPosition, rampColor } from "../treemap/utils/colors";
import { tailPath } from "../treemap/components/TreemapTooltip";
import { placeFloating } from "../treemap/hooks/useTreemapTooltip";
import { boxInfo, type BoxInfo } from "./boxInfo";
import { compactText, inkForZoom, labelFont, viewInk, type CompactBox } from "./boxText";
import {
  CONTEXT_EDGE_DASH,
  CONTEXT_EDGE_OPACITY,
  EDGE_OPACITY,
  edgeStrokeWidth,
  DOTTED_BOX_DASH,
  EXTERNAL_BOX_DASH,
  FRONTIER_BOX_DASH,
  HANDOFF_EDGE_DASH,
} from "./encoding";
import { boundsOf } from "./geometry";
import { CLICK_CURSOR, clickAction, createClickIntent, liveHover } from "./interaction";
import { formatLoc, stripSegments, type ContentItem, type StripSegment } from "./metrics";
import type { HubShape } from "./hubs";
import { FRAME_LABEL_H, MAX_SCALE, type PositionedEdge, type PositionedNode, type ViewLayout } from "./layout";
import type { ViewNode } from "./viewModel";

const LABEL_FONT = "600 12.5px Inter, ui-sans-serif, system-ui, sans-serif";
const SUBTITLE_FONT = "400 11px Inter, ui-sans-serif, system-ui, sans-serif";
const FRAME_LABEL_FONT = "600 11px Inter, ui-sans-serif, system-ui, sans-serif";
const PAD_X = 9;
const ICON_W = 17;
const MENU_BTN_W = 20;
const MENU_BTN_H = 16;
/** Baselines of the text rows inside a box; row 4 holds badges, centered on `ROW4_Y`. */
const LINE1_Y = 18;
const LINE2_Y = 34;
const LINE3_Y = 50;
const ROW4_Y = 60.5;
const METRIC_BAR_W = 28;
/**
 * Treemap color mixed into the box fill: enough to read at a glance, soft
 * enough that the bar and the contents strip carry the exact colors.
 */
const TINT = 0.22;
const MUTED_TEXT = "var(--plc-on-muted)";
/** Rows 2–4 share the label's left edge; the kind glyph owns the column before it. */
const TEXT_X = PAD_X + ICON_W;
/** Pitch between badges in row 4. */
const BADGE_PITCH = 15;
/** A folder's contents strip: its height, and the room it takes from the bottom of a box. */
const STRIP_H = 4;
const STRIP_RESERVE = 10;
/** An importer or import count at least this big (and among the view's top three) reads as a connector. */
const CONNECTOR_MIN = 6;


const measurer = makeTextMeasurer();
function measureText(text: string, font: string): number {
  measurer.setFont(font);
  return measurer.measure(text);
}

/** Fit a path by dropping leading segments: `…/viz/deps` rather than `client/src/vi…`. */
function truncatePathStart(text: string, max: number, font: string): string {
  if (truncateTextToWidth(text, max, font) === text) return text;
  // `ui/CheckboxRow` reads better than `ui/CheckboxRo…`: the extension goes first.
  const bare = text.replace(/\.[a-z0-9]+$/i, "");
  if (bare !== text) return truncatePathStart(bare, max, font);
  const parts = text.split("/");
  for (let i = 1; i < parts.length; i++) {
    const tail = `…/${parts.slice(i).join("/")}`;
    if (truncateTextToWidth(tail, max, font) === tail) return tail;
  }
  // Not even the file fits: keep the start of its name, which is what you scan for.
  return truncateTextToWidth(parts[parts.length - 1], max, font);
}

export interface CanvasApi {
  fit: () => void;
  /** Pan just enough to bring a box fully into view. */
  reveal: (id: string) => void;
  /** A box's rectangle on screen. */
  screenRect: (id: string) => DOMRect | undefined;
}

function edgePath(e: PositionedEdge): string {
  return e.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

const SYMBOL_GLYPH: Record<string, string> = {
  function: "ƒ",
  class: "C",
  type: "T",
  enum: "E",
  variable: "v",
  value: "v",
  // Data flow mode.
  route: "R",
  component: "<",
  control: "{",
  terminal: "t",
  origin: "o",
};

/** The 12px kind icon boxes use; the go-to palette draws the same ones. */
export function KindGlyph(props: { node: Pick<ViewNode, "kind" | "symbolKind">; x: number; y: number }) {
  const k = () => props.node.kind;
  const glyph = () => SYMBOL_GLYPH[props.node.symbolKind ?? ""] ?? "ƒ";
  return (
    <g transform={`translate(${props.x},${props.y})`} class="text-[var(--plc-on-subtle)]" aria-hidden="true">
      <Show when={k() === "folder"}>
        <path d="M0.5 2.5h4l1.5 1.5h6v6.5h-11.5z" fill="none" stroke="currentColor" stroke-width="1.1" />
      </Show>
      <Show when={k() === "file"}>
        <path d="M2 0.5h5l3 3v7.5h-8z M7 0.5v3h3" fill="none" stroke="currentColor" stroke-width="1.1" />
      </Show>
      <Show when={k() === "external"}>
        <path d="M1 3l5-2.5 5 2.5v6l-5 2.5-5-2.5z M1 3l5 2.5 5-2.5 M6 5.5v6" fill="none" stroke="currentColor" stroke-width="1.1" />
      </Show>
      <Show when={k() === "symbol"}>
        <text x="1" y="10" font-size="11" font-weight="600" fill="currentColor" font-style={glyph() === "ƒ" ? "italic" : "normal"}>
          {glyph()}
        </text>
      </Show>
    </g>
  );
}

/** A hub's badge: one shape, one color, filled. `r` is the half-size. */
export function HubGlyph(props: { shape: HubShape; color: string; x: number; y: number; r: number }) {
  const d = () => {
    const { x, y, r } = props;
    switch (props.shape) {
      case "diamond":
        return `M${x},${y - r * 1.15}L${x + r * 1.15},${y}L${x},${y + r * 1.15}L${x - r * 1.15},${y}Z`;
      case "triangle":
        return `M${x},${y - r * 1.1}L${x + r * 1.15},${y + r * 0.9}L${x - r * 1.15},${y + r * 0.9}Z`;
      case "square":
        return `M${x - r * 0.9},${y - r * 0.9}h${r * 1.8}v${r * 1.8}h${-r * 1.8}Z`;
      default:
        return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    }
  };
  return <path d={d()} fill={props.color} stroke="var(--plc-surface)" stroke-width="0.75" />;
}

/** Arrow into (`in`) or out of (`out`) a small box: the in/out link counts. */
export function FlowIcon(props: { dir: "in" | "out"; x: number; y: number }) {
  return (
    <g transform={`translate(${props.x},${props.y - 8})`} fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <Show when={props.dir === "in"} fallback={<path d="M1.5 1.5v8 M4 5.5h6.5 M8.5 3.5l2 2-2 2" />}>
        <path d="M10.5 1.5v8 M1 5.5h6.5 M5.5 3.5l2 2-2 2" />
      </Show>
    </g>
  );
}

/** Two arrows chasing each other: a mutual import. */
export function CycleIcon(props: { x: number; y: number }) {
  return (
    <g transform={`translate(${props.x - 5},${props.y - 5})`} fill="none" stroke="var(--plc-on-muted)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8.5 3.2A4 4 0 0 0 1.4 4 M1.5 6.8A4 4 0 0 0 8.6 6 M1.2 1.6v2.6h2.6 M8.8 8.4V5.8H6.2" />
    </g>
  );
}

/** A hover card for an icon: a title, plain lines, and optional name · count rows. */
type Tip = { title: string; lines?: string[]; rows?: [string, string][] };

export function DependencyCanvas(props: {
  layout: ViewLayout;
  /**
   * Graph id of the box this layout opened or closed in place. The camera
   * keeps it where it was, at the same zoom, instead of refitting.
   */
  anchor?: string;
  /** Graph id of the focus; clicking any other box moves (or isolates) to it. */
  focusId?: string;
  /**
   * A titled frame around the center boxes: a focused file's symbols, or an
   * isolated symbol under its file's name (`onTitle` goes back to the file).
   */
  focusFrame?: { title: string; note?: string; onTitle?: () => void };
  onFocus: (node: ViewNode) => void;
  onOpen: (node: ViewNode) => void;
  /** Shift- or Alt-click: open the box in place, or close the folder frame around it. */
  onToggleOpen?: (node: ViewNode) => void;
  /** Shift is down: the cursor shows that a click opens in place. */
  shiftHeld?: boolean;
  /** Any click on a box: the pointer takes over from the keyboard selection. */
  onPointerAct?: () => void;
  /** The box under the pointer, or null. */
  onHover?: (node: ViewNode | null) => void;
  /** The keyboard-selected box: ringed, and its edges drawn like a hover. */
  selectedId?: string;
  /** Node actions: right-click, or the "⋯" shown on the hovered node. */
  onMenu?: (node: ViewNode, at: { x: number; y: number }) => void;
  ref?: (api: CanvasApi) => void;
  /** Treemap metrics per box id (boxes without a treemap match are absent). */
  metrics?: Map<string, Record<string, any>>;
  /** The treemap's color metric; boxes are tinted with the treemap's colors. */
  colorMetric?: string;
  /** Folder boxes' children, largest first: the contents strip and the card's list. */
  contents?: Map<string, ContentItem[]>;
  /** A frame around an opened folder whose title closes it again. */
  collapsible?: (groupId: string) => boolean;
  onCollapse?: (groupId: string) => void;
  /**
   * Import counts and mutual-import badges on each box (default on). Data
   * flow mode turns them off and shows the box's `note` on that row instead.
   */
  linkCounts?: boolean;
  /**
   * Boxes and edges to keep lit while nothing is hovered (Data flow mode's
   * selected origin and its proven destinations); the rest dim like a hover.
   */
  highlight?: { nodes: Set<string>; edges: Set<string> } | null;
}) {
  let svgRef!: SVGSVGElement;
  let gRef!: SVGGElement;
  const [rawHoverNode, setHoverNode] = createSignal<string | null>(null);
  const [rawHoverEdge, setHoverEdge] = createSignal<string | null>(null);
  /** The hover card, at the pointer in viewport coordinates (placed like the treemap's tooltip). */
  const [card, setCard] = createSignal<{
    x: number;
    y: number;
    node?: PositionedNode;
    edge?: PositionedEdge;
    tip?: Tip;
  } | null>(null);
  let cardRef: HTMLDivElement | undefined;
  // Measure the rendered card, then flip it away from the right/bottom edges.
  createEffect(() => {
    const c = card();
    if (!c || !cardRef) return;
    const { width, height } = cardRef.getBoundingClientRect();
    const { left, top } = placeFloating({ x: c.x, y: c.y }, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    cardRef.style.left = `${left}px`;
    cardRef.style.top = `${top}px`;
    cardRef.style.visibility = "visible";
  });
  /** Text scale for the current zoom (see `inkForZoom`); 1 shows full detail. */
  const [ink, setInk] = createSignal(1);
  /** A hub whose badge is hovered somewhere: its hidden edges show. */
  const [rawHoverHub, setHoverHub] = createSignal<string | null>(null);

  // A refocus swaps the hovered element out, so its mouseleave never fires:
  // reset hover on every new layout and ignore ids the layout no longer has.
  const nodeIds = createMemo(() => new Set(props.layout.nodes.map((n) => n.id)));
  const edgeIds = createMemo(() => new Set(props.layout.edges.map((e) => e.id)));
  const hoverNode = () => liveHover(nodeIds(), rawHoverNode());
  const hoverEdge = () => liveHover(edgeIds(), rawHoverEdge());
  const hoverHub = () => liveHover(nodeIds(), rawHoverHub());
  const selectedId = () => liveHover(nodeIds(), props.selectedId ?? null);
  createEffect(() => {
    void props.layout;
    setHoverNode(null);
    setHoverEdge(null);
    setHoverHub(null);
    setCard(null);
  });

  const clickIntent = createClickIntent<ViewNode>({
    onFocus: (node) => {
      setHoverNode(null);
      setHoverEdge(null);
      props.onFocus(node);
    },
    onOpen: (node) => props.onOpen(node),
  });
  onCleanup(() => clickIntent.cancel());

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 4])
    .on("zoom", (ev) => {
      gRef.setAttribute("transform", ev.transform.toString());
      setInk(inkForZoom(ev.transform.k));
      setCard(null);
    });

  const fit = (animate = true) => {
    if (!svgRef) return;
    const { width, height } = svgRef.getBoundingClientRect();
    const b = boundsOf(props.layout.nodes, props.layout.edges);
    if (b.width === 0 || width === 0) return;
    const margin = 32;
    const scale = Math.min(MAX_SCALE, (width - margin * 2) / b.width, (height - margin * 2 - 20) / b.height);
    const tx = (width - b.width * scale) / 2 - b.x * scale;
    const ty = (height - b.height * scale) / 2 - b.y * scale + 10;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    const sel = d3.select(svgRef);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (animate && !reduce) sel.transition().duration(FLY_MS).call(zoom.transform, t);
    else sel.call(zoom.transform, t);
  };

  const reveal = (id: string) => {
    const n = props.layout.nodes.find((b) => b.id === id);
    if (!svgRef || !n) return;
    const { width, height } = svgRef.getBoundingClientRect();
    const t = d3.zoomTransform(svgRef);
    const m = 24;
    const x0 = t.applyX(n.x);
    const x1 = t.applyX(n.x + n.width);
    const y0 = t.applyY(n.y);
    const y1 = t.applyY(n.y + n.height);
    const dx = x0 < m ? m - x0 : x1 > width - m ? Math.max(m - x0, width - m - x1) : 0;
    const dy = y0 < m ? m - y0 : y1 > height - m ? Math.max(m - y0, height - m - y1) : 0;
    if (!dx && !dy) return;
    const sel = d3.select(svgRef);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    (reduce ? sel : sel.transition().duration(180)).call(zoom.translateBy as any, dx / t.k, dy / t.k);
  };

  onMount(() => {
    d3.select(svgRef).call(zoom).on("dblclick.zoom", null);
    props.ref?.({
      fit: () => fit(true),
      reveal,
      screenRect: (id) => svgRef.querySelector<SVGGElement>(`[data-box="${CSS.escape(id)}"]`)?.getBoundingClientRect(),
    });
    const ro = new ResizeObserver(() => fit(false));
    ro.observe(svgRef);
    onCleanup(() => ro.disconnect());
  });


  const nodeById = createMemo(() => new Map(props.layout.nodes.map((n) => [n.id, n])));
  createEffect(() => {
    const id = hoverNode();
    props.onHover?.(id ? (nodeById().get(id)?.node ?? null) : null);
  });
  // What moves on a new layout. Opening or closing one box in place pins the
  // camera on it (no refit, so it never reads as a zoom), and every box's start
  // is shifted into the new camera so it moves only as far as it really moved.
  let seen = new Map<string, Seen>();
  const motion = createMemo(() => {
    const layout = props.layout;
    const prev = seen;
    seen = new Map(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y, width: n.width, height: n.height, graphId: n.node.graphId }]));
    const rect = svgRef?.getBoundingClientRect();
    const t0 = svgRef ? d3.zoomTransform(svgRef) : null;
    const camera =
      props.anchor && t0 && rect && rect.width > 0 && prev.size
        ? anchoredCamera(layout, prev, props.anchor, t0, rect)
        : null;
    const shift = camera && t0 ? { t0, t1: camera } : null;
    return {
      camera,
      flights: planFlights(layout, prev, shift),
      glow: shift && props.anchor ? anchorGlow(layout, prev, props.anchor, shift) : null,
    };
  });
  const flights = () => motion().flights;
  // Before paint, so boxes start from where they were on screen.
  createRenderEffect(() => {
    const { camera } = motion();
    if (camera) d3.select(svgRef).interrupt().call(zoom.transform, camera);
    else queueMicrotask(() => fit(true));
  });
  const info = createMemo(() => boxInfo(props.layout));
  const hubById = createMemo(() => new Map((props.layout.hubs ?? []).map((h) => [h.id, h])));

  const allEdges = createMemo(() => [...props.layout.edges, ...(props.layout.hiddenEdges ?? [])]);

  // Edges touching the hovered node (or the hovered edge itself) are
  // emphasized. Hovering a hub, or one of its badges, brings its hidden edges back.
  const activeEdges = createMemo(() => {
    const hn = hoverHub() ?? hoverNode() ?? (hoverEdge() ? null : selectedId());
    const he = hoverEdge();
    if (!hn && !he) return props.highlight ? props.highlight.edges : null;
    const set = new Set<string>();
    for (const e of allEdges()) {
      if (e.id === he || e.source === hn || e.target === hn) set.add(e.id);
    }
    return set;
  });
  const activeNodes = createMemo(() => {
    const ae = activeEdges();
    if (!ae) return null;
    const set = new Set<string>();
    const hn = hoverHub() ?? hoverNode() ?? (hoverEdge() ? null : selectedId());
    if (hn) set.add(hn);
    if (props.highlight && !hoverHub() && !hoverNode() && !hoverEdge()) for (const id of props.highlight.nodes) set.add(id);
    for (const e of allEdges()) {
      if (ae.has(e.id)) {
        set.add(e.source);
        set.add(e.target);
      }
    }
    return set;
  });

  // Frame around a focused file's symbols.
  const focusFrame = createMemo(() => {
    const ns = props.layout.nodes.filter((n) => n.node.region === "center");
    if (ns.length === 0) return null;
    const pad = 6;
    const x0 = Math.min(...ns.map((n) => n.x)) - pad;
    const y0 = Math.min(...ns.map((n) => n.y)) - pad;
    const x1 = Math.max(...ns.map((n) => n.x + n.width)) + pad;
    const y1 = Math.max(...ns.map((n) => n.y + n.height)) + pad;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });

  const showCard = (ev: MouseEvent, payload: { node?: PositionedNode; edge?: PositionedEdge; tip?: Tip }) => {
    setCard({ x: ev.clientX, y: ev.clientY, ...payload });
  };

  const locText = (n: PositionedNode) => {
    const loc = props.metrics?.get(n.id)?.loc;
    return typeof loc === "number" && loc > 0 ? formatLoc(loc) : "";
  };
  const textRoom = (n: PositionedNode) => n.width - PAD_X * 2 - ICON_W - (hubById().has(n.id) ? 16 : 0);
  /** Line 2 shares its width with the right-aligned LOC. */
  const subtitleRoom = (n: PositionedNode) => {
    const loc = locText(n);
    return textRoom(n) - (loc ? measureText(loc, SUBTITLE_FONT) + 8 : 0);
  };
  const labelFor = (n: PositionedNode) => truncateTextToWidth(n.node.label, textRoom(n), LABEL_FONT);
  const frameInk = () => (ink() === 1 ? 1 : boxInk());
  const frameLabelFont = () => (frameInk() === 1 ? FRAME_LABEL_FONT : `600 ${11 * frameInk()}px Inter, ui-sans-serif, system-ui, sans-serif`);
  // Boxes inside a package frame: the frame already names the package.
  const framed = createMemo(() => {
    const out = new Set<string>();
    for (const f of props.layout.frames ?? []) {
      for (const n of props.layout.nodes) {
        if (n.column >= f.column && n.column <= f.lastColumn && n.node.group?.id === f.groupId && n.y >= f.y && n.y + n.height <= f.y + f.height) out.add(n.id);
      }
    }
    return out;
  });
  /** The subtitle minus whatever the surrounding package frame already says. */
  const shownSubtitle = (n: PositionedNode) => {
    const sub = n.node.subtitle ?? "";
    const label = n.node.group?.label;
    // A side symbol keeps its `folder/file`: frames can share a name.
    if (!label || !framed().has(n.id) || n.node.kind === "symbol") return sub;
    if (sub === label) return "";
    for (const sep of [" · ", "/"]) if (sub.startsWith(label + sep)) return sub.slice(label.length + sep.length);
    return sub;
  };
  const subtitleFor = (n: PositionedNode) => {
    const sub = shownSubtitle(n);
    if (n.node.kind === "file" || n.node.kind === "symbol") return truncatePathStart(sub, subtitleRoom(n), SUBTITLE_FONT);
    // `22 files · 2 folders` → `22 files` before cutting a word in half.
    const fit = truncateTextToWidth(sub, subtitleRoom(n), SUBTITLE_FONT);
    if (fit === sub || !sub.includes(" · ")) return fit;
    return truncateTextToWidth(sub.split(" · ")[0], subtitleRoom(n), SUBTITLE_FONT);
  };
  const labelOf = (id: string) => nodeById().get(id)?.node.label ?? id;
  const listTip = (ids: string[], max = 10) => [
    ...ids.slice(0, max).map(labelOf),
    ...(ids.length > max ? [`+${ids.length - max} more`] : []),
  ];
  /** Neighbors busiest first, each with its import link count. */
  const linkRows = (ids: string[], links: Map<string, number>, max = 10): [string, string][] => [
    ...ids.slice(0, max).map((id): [string, string] => [labelOf(id), String(links.get(id) ?? 0)]),
    ...(ids.length > max ? [[`+${ids.length - max} more`, ""] as [string, string]] : []),
  ];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : /(s|x|ch|sh)$/.test(word) ? "es" : "s"}`;
  /** Show a hover card for an icon inside a box, instead of the box's own card. */
  const iconHover = (tip: () => Tip, hub?: string) => ({
    onMouseEnter: (ev: MouseEvent) => {
      if (hub) setHoverHub(hub);
      showCard(ev, { tip: tip() });
    },
    onMouseMove: (ev: MouseEvent) => {
      ev.stopPropagation();
      showCard(ev, { tip: tip() });
    },
    onMouseLeave: () => {
      if (hub) setHoverHub(null);
    },
  });
  const metricRow = (n: PositionedNode) => {
    const metric = props.colorMetric;
    const m = props.metrics?.get(n.id);
    if (!metric || !m || m[metric] === undefined || m[metric] === null) return null;
    const t = treemapRampPosition(metric, m);
    return {
      t,
      color: rampColor(t),
      value: metric === "loc" ? "" : formatMetricValue(metric, m[metric]),
      label: metricLabel(metric as MetricId),
      full: formatMetricValue(metric, m[metric]),
    };
  };

  /**
   * The view's big connectors: a box's importer or import count at least
   * CONNECTOR_MIN and among the three largest counts in view draws bold.
   */
  const connectorMin = createMemo(() => {
    const counts = [...info().values()].flatMap((b) => [b.importers.length, b.imports.length]).sort((a, b) => b - a);
    return Math.max(CONNECTOR_MIN, counts[2] ?? Infinity);
  });
  const countTone = (k: number) => (k === 0 ? "var(--plc-on-disabled)" : k >= connectorMin() ? "var(--plc-on-surface)" : "var(--plc-on-muted)");
  const countWeight = (k: number) => (k > 0 && k >= connectorMin() ? 700 : 400);
  const inTip = (b: BoxInfo): Tip => ({
    title: b.importers.length ? `Imported by ${plural(b.importers.length, "box")} · ${plural(b.inLinks, "link")}` : "Nothing in view imports it",
    rows: linkRows(b.importers, b.linksFrom),
  });
  const outTip = (b: BoxInfo): Tip => ({
    title: b.imports.length ? `Imports ${plural(b.imports.length, "box")} · ${plural(b.outLinks, "link")}` : "Imports nothing in view",
    rows: linkRows(b.imports, b.linksTo),
  });

  const contentsOf = (n: PositionedNode) => props.contents?.get(n.id);
  const itemColor = (c: ContentItem) => (props.colorMetric ? treemapFillColor(props.colorMetric, c.metrics, 0) : "var(--plc-tertiary)");
  const stripTip = (n: PositionedNode, seg: StripSegment): Tip => {
    const total = (contentsOf(n) ?? []).reduce((a, c) => a + c.loc, 0) || 1;
    const share = (loc: number) => `${Math.max(1, Math.round((100 * loc) / total))}% of ${n.node.label}`;
    if (seg.item) {
      const m = props.colorMetric;
      const v = m ? seg.item.metrics[m] : undefined;
      return {
        title: `${seg.item.name}${seg.item.kind === "folder" ? "/" : ""}`,
        lines: [
          `${formatLoc(seg.item.loc)} · ${share(seg.item.loc)}`,
          ...(m && m !== "loc" && v !== undefined && v !== null ? [`${metricLabel(m as MetricId)}: ${formatMetricValue(m, v)}`] : []),
        ],
      };
    }
    const rest = seg.rest ?? [];
    return {
      title: `${plural(rest.length, "smaller item")}`,
      lines: [`${formatLoc(rest.reduce((a, c) => a + c.loc, 0))} · ${share(rest.reduce((a, c) => a + c.loc, 0))}`],
      rows: rest.slice(0, 10).map((c): [string, string] => [c.name, formatLoc(c.loc)]),
    };
  };
  /** A folder's children as one bar along its bottom: widths by LOC, colors by the color metric. */
  const ContentsStrip = (p: { n: PositionedNode; y: number; h: number }) => {
    const segs = createMemo(() => stripSegments(contentsOf(p.n) ?? [], p.n.width - PAD_X * 2));
    // The segment under the pointer gets an outline, so the card's name has a place.
    const [hot, setHot] = createSignal<number | null>(null);
    return (
      <>
      {/* A white track: the strip's colors read on their own, not against the box tint. */}
      <rect x={PAD_X - 1} y={p.y - 1} width={p.n.width - PAD_X * 2 + 1} height={p.h + 2} rx={Math.min(2.5, p.h / 2 + 1)} fill="var(--plc-surface)" stroke="var(--plc-border)" stroke-width="0.5" />
      <For each={segs()}>
        {(seg, i) => (
          <g
            {...iconHover(() => stripTip(p.n, seg))}
            onMouseOver={() => setHot(i())}
            onMouseOut={() => setHot(null)}
          >
            <rect x={PAD_X + seg.x} y={p.y - 3} width={seg.w} height={p.h + 6} fill="transparent" />
            <rect
              x={PAD_X + seg.x}
              y={p.y}
              width={Math.max(1, seg.w - 1)}
              height={p.h}
              rx={Math.min(1.5, p.h / 2)}
              fill={seg.item ? itemColor(seg.item) : "var(--plc-border-strong)"}
              stroke={hot() === i() ? "var(--plc-on-surface)" : "none"}
              stroke-width="1"
            />
          </g>
        )}
      </For>
      </>
    );
  };

  // Treemap colors, kept apart from layout: changing the color metric only
  // repaints. Boxes without a treemap match keep the neutral styling.
  // Color has one job per channel: the metric ramp tints the fill (and draws
  // the bar and strip); borders stay neutral so blue (focus, selection,
  // hover) is the only colored outline.
  const paint = createMemo(() => {
    const out = new Map<string, { fill: string }>();
    const metric = props.colorMetric;
    if (!metric || !props.metrics) return out;
    for (const [id, m] of props.metrics) {
      out.set(id, { fill: d3.interpolateLab("#ffffff", treemapFillColor(metric, m, 0))(TINT) });
    }
    return out;
  });

  /**
   * A box's contents below `FULL_DETAIL_ZOOM`: its name in text scaled by
   * `ink`, wrapped to as many lines as fit, then — when there is room — one
   * line with hub/mutual badges and LOC. Centered in the box.
   */
  const COMPACT_PAD_Y = 5;
  const compactBox = (n: PositionedNode): CompactBox => {
    const b = info().get(n.id);
    return {
      label: n.node.label,
      width: n.width,
      fixedInset: PAD_X * 2,
      inkInset: ICON_W + (hubById().has(n.id) ? 15 : 0),
      height: n.height - 2 * COMPACT_PAD_Y - (contentsOf(n) ? STRIP_RESERVE : 0),
      hasStats: b !== undefined || locText(n) !== "",
    };
  };
  /** One text scale for every compact box in the view (see `viewInk`). */
  const boxInk = createMemo(() => (ink() === 1 ? 1 : viewInk(props.layout.nodes.map(compactBox), ink())));
  const CompactBody = (p: { n: PositionedNode }) => {
    const n = p.n;
    const hub = () => hubById().get(n.id);
    const box = () => (props.linkCounts === false ? undefined : info().get(n.id));
    const geo = createMemo(() => {
      const k = boxInk();
      const t = compactText(compactBox(n), k);
      const room = n.height - (contentsOf(n) ? STRIP_RESERVE : 0);
      const textX = PAD_X + ICON_W * k;
      const right = n.width - PAD_X;
      // Stats line, left to right while it fits: link counts, hub and mutual badges, then LOC on the right.
      const font = `400 ${t.statsPx}px Inter, ui-sans-serif, system-ui, sans-serif`;
      const b = box();
      let x = textX;
      const counts: { dir: "in" | "out"; n: number; x: number }[] = [];
      for (const [dir, c] of [["in", b?.importers.length], ["out", n.node.kind === "external" ? undefined : b?.imports.length]] as const) {
        if (c === undefined) continue;
        const w = 15 * k + measureText(String(c), font) + 7 * k;
        if (x + w - 7 * k > right) break;
        counts.push({ dir, n: c, x });
        x += w;
      }
      const pitch = BADGE_PITCH * k;
      const loc = locText(n);
      const locW = loc ? 6 * k + measureText(loc, font) : 0;
      const badgeCount = (b?.hubBadges.length ?? 0) + ((b?.cycles.length ?? 0) > 0 ? 1 : 0);
      // Counts, badges and LOC share one line when they fit; else badges and
      // LOC move to a second line when the box has the height.
      const oneLine = x + badgeCount * pitch + locW <= right;
      const nameH = t.lines.length * t.lineH;
      const second = !oneLine && (badgeCount > 0 || loc !== "") && t.stats && room - 2 * COMPACT_PAD_Y - nameH - 2 * t.statsH >= 0;
      const badgeX = second ? textX : x;
      const badgeSlots = Math.max(0, Math.floor((right - badgeX) / pitch));
      const hubBadges = (b?.hubBadges ?? []).slice(0, badgeSlots);
      const cycle = (b?.cycles.length ?? 0) > 0 && hubBadges.length < badgeSlots;
      const rowEnd = badgeX + (hubBadges.length + (cycle ? 1 : 0)) * pitch;
      const blockH = nameH + (t.stats ? t.statsH * (second ? 2 : 1) : 0);
      const top = (room - blockH) / 2;
      const statsY = top + nameH + t.statsH * 0.8;
      const badgeY = second ? statsY + t.statsH : statsY;
      // LOC goes on the stats line when it fits there, else after a short
      // name's last line (not beside a hub's badge), else it stays in the card.
      const lastLine = t.lines[t.lines.length - 1] ?? "";
      const besideHub = hubById().has(n.id) && t.lines.length === 1;
      const locY =
        loc === "" ? null
        : t.stats && rowEnd + locW <= right ? badgeY
        : !besideHub && textX + measureText(lastLine, labelFont(t.px)) + 8 * k + locW <= right ? top + t.lineH * (t.lines.length - 1 + 0.82)
        : null;
      return { k, px: t.px, lineH: t.lineH, textX, lines: t.lines, stats: t.stats, statsPx: t.statsPx, counts, badgeX, hubBadges, cycle, locY, top, statsY, badgeY };
    });
    const pitch = () => BADGE_PITCH * geo().k;
    return (
      <>
        <g transform={`translate(${PAD_X},${geo().top + geo().lineH * 0.82 - 10 * geo().k}) scale(${geo().k})`}>
          <KindGlyph node={n.node} x={0} y={0} />
        </g>
        <text x={geo().textX} font-size={`${geo().px}`} class="font-semibold" fill="var(--plc-on-surface)">
          <For each={geo().lines}>
            {(line, i) => (
              <tspan x={geo().textX} y={geo().top + geo().lineH * (i() + 0.82)}>
                {line}
              </tspan>
            )}
          </For>
        </text>
        <Show when={hub()}>
          {(h) => (
            <g
              {...iconHover(() => ({
                title: `Hub: ${plural(h().importers, "box")} import it`,
                lines: ["Its edges are hidden; hovering here or on a badge draws them."],
              }), h().id)}
            >
              <HubGlyph shape={h().shape} color={h().color} x={n.width - PAD_X - 6 * geo().k} y={geo().top + geo().lineH * 0.45} r={6 * geo().k} />
            </g>
          )}
        </Show>
        <Show when={geo().stats}>
          <For each={geo().counts}>
            {(c) => (
              <g style={{ color: countTone(c.n) }} {...iconHover(() => (c.dir === "in" ? inTip(box()!) : outTip(box()!)))}>
                <rect x={c.x - 2 * geo().k} y={geo().statsY - 11 * geo().k} width={15 * geo().k + 4 + String(c.n).length * 7 * geo().k} height={14 * geo().k} fill="transparent" />
                <g transform={`translate(${c.x},${geo().statsY}) scale(${geo().k})`}>
                  <FlowIcon dir={c.dir} x={0} y={0} />
                </g>
                <text x={c.x + 15 * geo().k} y={geo().statsY} font-size={`${geo().statsPx}`} font-weight={countWeight(c.n)} class="tabular-nums" fill="currentColor">
                  {c.n}
                </text>
              </g>
            )}
          </For>
          <For each={geo().hubBadges}>
            {(h, i) => (
              <g
                {...iconHover(() => ({
                  title: `Imports ${labelOf(h.id)}`,
                  lines: [`A hub ${plural(h.importers, "box")} import; its edges are hidden.`],
                }), h.id)}
              >
                <rect x={geo().badgeX - 2 + i() * pitch()} y={geo().badgeY - 11 * geo().k} width={pitch()} height={14 * geo().k} fill="transparent" />
                <HubGlyph shape={h.shape} color={h.color} x={geo().badgeX + 5 * geo().k + i() * pitch()} y={geo().badgeY - 4 * geo().k} r={4.5 * geo().k} />
              </g>
            )}
          </For>
          <Show when={geo().cycle}>
            <g
              transform={`translate(${geo().badgeX + 5 * geo().k + geo().hubBadges.length * pitch()},${geo().badgeY - 4 * geo().k}) scale(${geo().k})`}
              {...iconHover(() => ({ title: "Mutual import", lines: ["Imports and is imported by:", ...listTip(box()!.cycles)] }))}
            >
              <rect x={-7} y={-7} width={14} height={14} fill="transparent" />
              <CycleIcon x={0} y={0} />
            </g>
          </Show>
        </Show>
        <Show when={geo().locY !== null}>
          <text x={n.width - PAD_X} y={geo().locY!} text-anchor="end" font-size={`${geo().statsPx}`} class="tabular-nums" fill={MUTED_TEXT}>
            {locText(n)}
          </text>
        </Show>
        <Show when={contentsOf(n)}>
          <ContentsStrip n={n} y={n.height - STRIP_RESERVE + 1} h={STRIP_H * 1.5} />
        </Show>
      </>
    );
  };

  return (
    <div class="relative h-full w-full overflow-hidden bg-[var(--plc-surface-subtle)]">
      <svg
        ref={svgRef}
        class="h-full w-full cursor-grab select-none active:cursor-grabbing"
        role="img"
        aria-label="Dependency graph"
      >
        <defs>
          <marker id="dv-arrow" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--plc-tertiary)" />
          </marker>
          <filter id="dv-shadow" x="-10%" y="-10%" width="120%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.12" />
          </filter>
          <marker id="dv-arrow-active" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--plc-accent)" />
          </marker>
        </defs>
        <g ref={gRef}>
          <For each={props.layout.groups ?? []}>
            {(g) => (
              <text x={g.x} y={g.y} font-size={`${12 * ink()}`} class="fill-[var(--plc-on-muted)] font-semibold">
                {g.label}
              </text>
            )}
          </For>
          {/* Package frames around side neighbors (drawn under edges and boxes). */}
          <For each={props.layout.frames ?? []}>
            {(f) => {
              // An opened folder's frame: its title (with a "−") closes it.
              const closable = () => props.collapsible?.(f.groupId) ?? false;
              return (
                <g class="dv-settle">
                  <rect
                    x={f.x}
                    y={f.y}
                    width={f.width}
                    height={f.height}
                    rx="6"
                    fill="var(--plc-surface)"
                    fill-opacity="0.6"
                    stroke={closable() ? "var(--plc-accent-border)" : "var(--plc-border)"}
                  />
                  {/* The label band above the first box is fixed: larger labels grow up past the frame's top, haloed. */}
                  <Show
                    when={closable()}
                    fallback={
                      <text
                        x={f.x + 7}
                        y={f.y + 11.5}
                        font-size={`${11 * frameInk()}`}
                        paint-order="stroke"
                        stroke={frameInk() > 1 ? "var(--plc-surface-subtle)" : "none"}
                        stroke-width={3 * frameInk()}
                        stroke-linejoin="round"
                        class="fill-[var(--plc-on-subtle)] font-semibold"
                      >
                        {truncateTextToWidth(f.label, f.width - 14, frameLabelFont())}
                      </text>
                    }
                  >
                    <g
                      class="group/frame cursor-pointer"
                      role="button"
                      aria-label={`Collapse ${f.label}`}
                      onMouseEnter={(ev) => showCard(ev, { tip: { title: `Collapse ${f.label}`, lines: ["Folds its boxes back into one."] } })}
                      onMouseLeave={() => setCard(null)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setCard(null);
                        props.onCollapse?.(f.groupId);
                      }}
                    >
                      <rect x={f.x + 2} y={f.y + 1} width={f.width - 4} height={FRAME_LABEL_H - 1} rx="4" fill="transparent" class="transition-[fill] duration-[140ms] group-hover/frame:fill-[var(--plc-accent-subtle)]" />
                      <rect x={f.x + 6.5} y={f.y + 3.5} width={9} height={9} rx="2" fill="var(--plc-surface)" stroke="var(--plc-accent)" stroke-width="1" />
                      <path d={`M${f.x + 8.5},${f.y + 8}h5`} stroke="var(--plc-accent)" stroke-width="1.2" stroke-linecap="round" />
                      <text
                        x={f.x + 19}
                        y={f.y + 11.5}
                        font-size={`${11 * frameInk()}`}
                        paint-order="stroke"
                        stroke={frameInk() > 1 ? "var(--plc-surface-subtle)" : "none"}
                        stroke-width={3 * frameInk()}
                        stroke-linejoin="round"
                        class="fill-[var(--plc-accent)] font-semibold"
                      >
                        {truncateTextToWidth(f.label, f.width - 26, frameLabelFont())}
                      </text>
                    </g>
                  </Show>
                </g>
              );
            }}
          </For>
          <Show when={props.focusFrame ? focusFrame() : null}>
            {(f) => (
              <rect
                x={f().x}
                y={f().y}
                width={f().width}
                height={f().height}
                rx="6"
                fill="var(--plc-accent-subtle)"
                fill-opacity="0.55"
                stroke="var(--plc-accent-border)"
              />
            )}
          </Show>
          {/* The focused file titles the frame around its symbols. */}
          <Show when={props.focusFrame ? focusFrame() : null}>
            {(f) => {
              const ff = () => props.focusFrame!;
              return (
                <text
                  x={f().x + f().width / 2}
                  y={f().y - 8 * ink()}
                  text-anchor="middle"
                  font-size={`${12 * ink()}`}
                  class="font-semibold"
                  // A halo in the canvas color keeps edges in the gutter from striking through it.
                  paint-order="stroke"
                  stroke="var(--plc-surface-subtle)"
                  stroke-width={4 * ink()}
                  stroke-linejoin="round"
                >
                  <tspan
                    fill={ff().onTitle ? "var(--plc-accent)" : "var(--plc-on-surface)"}
                    class={ff().onTitle ? "cursor-pointer hover:fill-[var(--plc-accent-strong,var(--plc-accent))] hover:underline" : undefined}
                    role={ff().onTitle ? "link" : undefined}
                    tabindex={ff().onTitle ? 0 : undefined}
                    aria-label={ff().onTitle ? `Show all of ${ff().title}` : undefined}
                    onClick={(ev) => {
                      if (!ff().onTitle) return;
                      ev.stopPropagation();
                      ff().onTitle!();
                    }}
                    onKeyDown={(ev) => {
                      if (ff().onTitle && (ev.key === "Enter" || ev.key === " ")) {
                        ev.preventDefault();
                        ff().onTitle!();
                      }
                    }}
                  >
                    {ff().title}
                  </tspan>
                  <Show when={ff().note}>
                    <tspan fill={MUTED_TEXT} font-weight="400">{` · ${ff().note}`}</tspan>
                  </Show>
                </text>
              );
            }}
          </Show>
          {/* The opened folder's outline grows out of its box, then fades. */}
          <Show when={motion().glow} keyed>
            {(g) => (
              <rect
                class="dv-glow pointer-events-none"
                x={g.to.x}
                y={g.to.y}
                width={g.to.width}
                height={g.to.height}
                rx="7"
                fill="var(--plc-accent-subtle)"
                fill-opacity="0.55"
                stroke="var(--plc-accent)"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
                style={{
                  "--dv-from": `translate(${g.from.x - g.to.x * (g.from.width / g.to.width)}px,${g.from.y - g.to.y * (g.from.height / g.to.height)}px) scale(${g.from.width / g.to.width},${g.from.height / g.to.height})`,
                }}
              />
            )}
          </Show>
          <g fill="none" class="dv-settle">
            <For each={props.layout.edges}>
              {(e) => {
                const active = () => activeEdges()?.has(e.id) ?? false;
                const dimmed = () => activeEdges() !== null && !active();
                return (
                  <g>
                    <path
                      d={edgePath(e)}
                      stroke={active() || e.edge.style === "field" ? "var(--plc-accent)" : "var(--plc-tertiary)"}
                      stroke-width={edgeStrokeWidth(e.edge.weight, e.edge.faint)}
                      stroke-opacity={dimmed() ? 0.12 : e.edge.faint && !active() ? CONTEXT_EDGE_OPACITY : EDGE_OPACITY}
                      stroke-dasharray={e.edge.style === "handoff" ? HANDOFF_EDGE_DASH : e.edge.faint ? CONTEXT_EDGE_DASH : undefined}
                      stroke-linejoin="round"
                      marker-end={active() ? "url(#dv-arrow-active)" : "url(#dv-arrow)"}
                      style={{ transition: "stroke 140ms ease, stroke-opacity 140ms ease" }}
                    />
                    {/* Wide invisible hit area for hover. */}
                    <path
                      d={edgePath(e)}
                      stroke="transparent"
                      stroke-width="8"
                      onMouseEnter={(ev) => {
                        setHoverEdge(e.id);
                        showCard(ev, { edge: e });
                      }}
                      onMouseMove={(ev) => showCard(ev, { edge: e })}
                      onMouseLeave={() => {
                        setHoverEdge(null);
                        setCard(null);
                      }}
                    />
                  </g>
                );
              }}
            </For>
            {/* Hub edges: drawn only while the hub, an importer or a badge is hovered. */}
            <For each={props.layout.hiddenEdges ?? []}>
              {(e) => (
                <Show when={activeEdges()?.has(e.id)}>
                  <path
                    d={edgePath(e)}
                    stroke="var(--plc-accent)"
                    stroke-width={edgeStrokeWidth(e.edge.weight, false)}
                    stroke-opacity="0.85"
                    stroke-linejoin="round"
                    marker-end="url(#dv-arrow-active)"
                    pointer-events="none"
                  />
                </Show>
              )}
            </For>
          </g>

          <For each={props.layout.nodes}>
            {(n) => {
              const isFocus = n.node.isFocus;
              const isFolder = n.node.kind === "folder";
              const dimmed = () => activeNodes() !== null && !activeNodes()!.has(n.id);
              const box = () => info().get(n.id);
              const hub = () => hubById().get(n.id);
              const flight = flights().get(n.id);
              const cursor = () =>
                CLICK_CURSOR[
                  clickAction(n.node, {
                    shift: !!props.shiftHeld,
                    focusId: props.focusId ?? null,
                    collapsible: (id) => props.collapsible?.(id) ?? false,
                  }).kind
                ];
              return (
                <g
                  data-box={n.id}
                  class={flight ? "dv-fly" : undefined}
                  style={{
                    ...(flight?.delay ? { "animation-delay": `${flight.delay}ms` } : {}),
                    transform: `translate(${n.x}px,${n.y}px)`,
                    cursor: cursor(),
                    opacity: dimmed() ? 0.62 : 1,
                    transition: "opacity 140ms ease",
                    ...(flight
                      ? { "--dv-from": `translate(${flight.x}px,${flight.y}px) scale(${flight.scale})`, "--dv-from-opacity": String(flight.opacity) }
                      : {}),
                  }}
                  onMouseEnter={(ev) => {
                    setHoverNode(n.id);
                    showCard(ev, { node: n });
                  }}
                  onMouseMove={(ev) => showCard(ev, { node: n })}
                  onMouseLeave={() => {
                    setHoverNode(null);
                    setCard(null);
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setCard(null);
                    props.onPointerAct?.();
                    if ((ev.shiftKey || ev.altKey) && props.onToggleOpen) {
                      clickIntent.cancel();
                      props.onToggleOpen(n.node);
                    } else clickIntent.click(n.node, ev);
                  }}
                  onMouseDown={(ev) => {
                    // No middle-button autoscroll; the aux click opens the node.
                    if (ev.button === 1) ev.preventDefault();
                  }}
                  onAuxClick={(ev) => {
                    if (ev.button !== 1) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    setCard(null);
                    clickIntent.auxClick(n.node, ev.button);
                  }}
                  onContextMenu={(ev) => {
                    if (!props.onMenu) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    setCard(null);
                    props.onMenu(n.node, { x: ev.clientX, y: ev.clientY });
                  }}
                >
                  <Show when={selectedId() === n.id}>
                    <rect x={-4} y={-4} width={n.width + 8} height={n.height + 8} rx="9" fill="none" stroke="var(--plc-accent)" stroke-width={2 * ink()} />
                  </Show>
                  <rect
                    width={n.width}
                    height={n.height}
                    rx="6"
                    filter="url(#dv-shadow)"
                    fill={
                      dimmed()
                        ? "var(--plc-surface)"
                        : (paint().get(n.id)?.fill ??
                          (isFolder ? "var(--plc-surface-muted)" : "var(--plc-surface)"))
                    }
                    stroke={
                      isFocus || n.node.lit
                        ? "var(--plc-accent)"
                        : hoverNode() === n.id || hoverHub() === n.id
                          ? "var(--plc-on-muted)"
                          : isFolder ? "var(--plc-on-disabled)" : "var(--plc-border-strong)"
                    }
                    stroke-width={isFocus ? 2.25 : n.node.lit ? 2 : isFolder || hub() ? 1.5 : 1}
                    stroke-dasharray={n.node.kind === "external" ? EXTERNAL_BOX_DASH : n.node.outline === "dotted" ? DOTTED_BOX_DASH : n.node.outline === "hatched" ? FRONTIER_BOX_DASH : undefined}
                    style={{ transition: "stroke 140ms ease, fill 140ms ease" }}
                  />
                  <Show when={ink() === 1} fallback={<CompactBody n={n} />}>
                  {/* Row 1: kind + name (a hub repeats its badge, large, on the right). */}
                  <KindGlyph node={n.node} x={PAD_X} y={LINE1_Y - 10} />
                  <text x={TEXT_X} y={LINE1_Y} class="text-[12.5px] font-semibold" fill="var(--plc-on-surface)">
                    {labelFor(n)}
                  </text>
                  <Show when={hub()}>
                    {(h) => (
                      <g
                        {...iconHover(() => ({
                          title: `Hub: ${plural(h().importers, "box")} import it`,
                          lines: ["Its edges are hidden; hovering here or on a badge draws them."],
                        }), h().id)}
                      >
                        <rect x={n.width - 22} y={4} width={18} height={18} fill="transparent" />
                        <HubGlyph shape={h().shape} color={h().color} x={n.width - 13} y={LINE1_Y - 4.5} r={6} />
                      </g>
                    )}
                  </Show>
                  {/* Row 2: where it lives (or what it holds) + LOC. */}
                  <Show when={shownSubtitle(n)}>
                    <text x={TEXT_X} y={LINE2_Y} class="text-[11px]" fill={MUTED_TEXT}>
                      {subtitleFor(n)}
                    </text>
                  </Show>
                  <Show when={locText(n)}>
                    <text x={n.width - PAD_X} y={LINE2_Y} text-anchor="end" class="text-[11px] tabular-nums" fill={MUTED_TEXT}>
                      {locText(n)}
                    </text>
                  </Show>
                  {/* Row 3: boxes importing it / it imports, and the color metric as a bar. */}
                  <Show when={props.linkCounts === false && n.node.note}>
                    <text x={TEXT_X} y={LINE3_Y} class="text-[11px]" fill={MUTED_TEXT}>
                      {truncateTextToWidth(n.node.note ?? "", textRoom(n), SUBTITLE_FONT)}
                    </text>
                  </Show>
                  <Show when={props.linkCounts !== false && box()}>
                    {(b) => {
                      const external = n.node.kind === "external";
                      return (
                        <g>
                          <g style={{ color: countTone(b().importers.length) }} {...iconHover(() => inTip(b()))}>
                            <rect x={TEXT_X - 3} y={LINE3_Y - 12} width={36} height={16} fill="transparent" />
                            <FlowIcon dir="in" x={TEXT_X} y={LINE3_Y} />
                            <text x={TEXT_X + 15} y={LINE3_Y} class="text-[11px] tabular-nums" font-weight={countWeight(b().importers.length)} fill="currentColor">
                              {b().importers.length}
                            </text>
                          </g>
                          <Show when={!external}>
                            <g style={{ color: countTone(b().imports.length) }} {...iconHover(() => outTip(b()))}>
                              <rect x={TEXT_X + 37} y={LINE3_Y - 12} width={36} height={16} fill="transparent" />
                              <FlowIcon dir="out" x={TEXT_X + 40} y={LINE3_Y} />
                              <text x={TEXT_X + 55} y={LINE3_Y} class="text-[11px] tabular-nums" font-weight={countWeight(b().imports.length)} fill="currentColor">
                                {b().imports.length}
                              </text>
                            </g>
                          </Show>
                        </g>
                      );
                    }}
                  </Show>
                  <Show when={metricRow(n)}>
                    {(m) => (
                      <g {...iconHover(() => ({ title: `${m().label}: ${m().full}`, lines: ["The bar and the box tint use the treemap's color scale."] }))}>
                        <rect x={n.width - PAD_X - METRIC_BAR_W - 22} y={LINE3_Y - 12} width={METRIC_BAR_W + 24} height={16} fill="transparent" />
                        <rect x={n.width - PAD_X - METRIC_BAR_W} y={LINE3_Y - 6} width={METRIC_BAR_W} height={5} rx={2.5} fill="var(--plc-surface-muted)" stroke="var(--plc-border)" stroke-width="0.5" />
                        <rect x={n.width - PAD_X - METRIC_BAR_W} y={LINE3_Y - 6} width={Math.max(3, METRIC_BAR_W * m().t)} height={5} rx={2.5} fill={m().color} />
                        <Show when={m().value}>
                          <text x={n.width - PAD_X - METRIC_BAR_W - 5} y={LINE3_Y} text-anchor="end" class="text-[11px] tabular-nums" fill={MUTED_TEXT}>
                            {m().value}
                          </text>
                        </Show>
                      </g>
                    )}
                  </Show>
                  {/* Row 4: badges for the hubs it imports, then mutual imports; a hub names itself on the right. */}
                  <For each={props.linkCounts === false ? [] : box()?.hubBadges ?? []}>
                    {(h, i) => (
                      <g
                        {...iconHover(() => ({
                          title: `Imports ${labelOf(h.id)}`,
                          lines: [`A hub ${plural(h.importers, "box")} import; its edges are hidden.`],
                        }), h.id)}
                      >
                        <rect x={TEXT_X - 2 + i() * BADGE_PITCH} y={ROW4_Y - 9} width={BADGE_PITCH} height={18} fill="transparent" />
                        <HubGlyph shape={h.shape} color={h.color} x={TEXT_X + 5 + i() * BADGE_PITCH} y={ROW4_Y} r={4.5} />
                      </g>
                    )}
                  </For>
                  <Show when={props.linkCounts !== false && (box()?.cycles.length ?? 0) > 0}>
                    <g
                      {...iconHover(() => ({
                        title: "Mutual import",
                        lines: ["Imports and is imported by:", ...listTip(box()!.cycles)],
                      }))}
                    >
                      <rect x={TEXT_X - 2 + (box()?.hubBadges.length ?? 0) * BADGE_PITCH} y={ROW4_Y - 9} width={BADGE_PITCH} height={18} fill="transparent" />
                      <CycleIcon x={TEXT_X + 5 + (box()?.hubBadges.length ?? 0) * BADGE_PITCH} y={ROW4_Y} />
                    </g>
                  </Show>
                  <Show when={contentsOf(n)}>
                    <ContentsStrip n={n} y={n.height - 7} h={STRIP_H} />
                  </Show>
                  <Show when={hub()}>
                    <text x={n.width - PAD_X} y={ROW4_Y + 3.5} text-anchor="end" class="text-[11px] font-medium" fill={MUTED_TEXT}>
                      hub
                    </text>
                  </Show>
                  </Show>
                  <Show when={props.onMenu && hoverNode() === n.id}>
                    <g
                      transform={
                        ink() === 1
                          ? `translate(${n.width - MENU_BTN_W - 3 - (hub() ? 20 : 0)},${LINE1_Y - MENU_BTN_H + 4})`
                          : // Zoomed out the name fills the box: the button straddles the top border instead of covering it.
                            `translate(${n.width - (MENU_BTN_W + 6 + (hub() ? 18 : 0)) * ink()},${(-MENU_BTN_H / 2) * ink()}) scale(${ink()})`
                      }
                      class="group/menu cursor-pointer"
                      role="button"
                      aria-label={`Actions for ${n.node.title || n.node.label}`}
                      onMouseEnter={() => setCard(null)}
                      onMouseMove={(ev) => ev.stopPropagation()}
                      onDblClick={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        const r = (ev.currentTarget as SVGGElement).getBoundingClientRect();
                        props.onMenu?.(n.node, { x: r.left, y: r.bottom + 4 });
                      }}
                    >
                      <rect
                        width={MENU_BTN_W}
                        height={MENU_BTN_H}
                        rx="3"
                        class="fill-[var(--plc-surface-muted)] stroke-[var(--plc-border)] transition-[fill] duration-[140ms] group-hover/menu:fill-[var(--plc-surface-selected)] group-active/menu:fill-[var(--plc-accent-subtle)]"
                      />
                      <For each={[0, 1, 2]}>
                        {(i) => (
                          <circle
                            cx={MENU_BTN_W / 2 + (i - 1) * 4}
                            cy={MENU_BTN_H / 2}
                            r="1.25"
                            class="fill-[var(--plc-on-muted)] group-hover/menu:fill-[var(--plc-accent)]"
                          />
                        )}
                      </For>
                    </g>
                  </Show>
                </g>
              );
            }}
          </For>
        </g>
      </svg>

      <Show when={card()}>
        {(c) => (
          <div
            ref={cardRef}
            role="tooltip"
            class="plc-floating pointer-events-none fixed z-50 w-max min-w-[240px] max-w-[min(380px,calc(100vw-8px))] rounded-md border px-2.5 py-2 text-[12px] leading-[1.35]"
            style={{ left: "0px", top: "0px", visibility: "hidden" }}
          >
            <Show when={c().node}>
              {(pn) => <NodeCard node={pn().node} focused={pn().node.graphId === props.focusId} info={info().get(pn().id)} metric={metricRow(pn())} loc={props.metrics?.get(pn().id)?.loc} hub={hubById().get(pn().id)} contents={contentsOf(pn())} itemColor={itemColor} />}
            </Show>
            <Show when={c().edge}>
              {(pe) => <EdgeCard edge={pe()} nodes={nodeById()} />}
            </Show>
            <Show when={c().tip}>{(t) => <TipCard tip={t()} />}</Show>
          </div>
        )}
      </Show>
    </div>
  );
}

/** Box moves, camera fit and the fly-out of opened folders share one duration. */
const FLY_MS = 420;
/** Boxes coming out of an opened folder leave it one after another. */
const STAGGER_MS = 35;
const MAX_STAGGER_MS = 280;

interface Flight {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  /** ms before it starts moving (boxes leaving an opened folder in turn). */
  delay?: number;
}

type Seen = { x: number; y: number; width: number; height: number; graphId: string };
type Rect = { x: number; y: number; width: number; height: number };
/** The camera before and after a layout change, when it jumps instead of gliding. */
type CameraShift = { t0: d3.ZoomTransform; t1: d3.ZoomTransform };

/** `id` is `root` or inside it (folder paths, then `file#symbol`). */
const within = (root: string, id: string) => id === root || id.startsWith(`${root}/`) || id.startsWith(`${root}#`);

const rectOf = (rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
};

/** A point of the old camera's world in the new camera's world (same spot on screen). */
const carry = (shift: CameraShift | null, x: number, y: number) =>
  shift ? { x: (shift.t0.applyX(x) - shift.t1.x) / shift.t1.k, y: (shift.t0.applyY(y) - shift.t1.y) / shift.t1.k } : { x, y };

/**
 * The camera for a layout that opened or closed `anchor` in place: the same
 * zoom (less only if the opened folder can't fit), with what it became placed
 * where it was on screen, then pulled fully into view.
 */
function anchoredCamera(layout: ViewLayout, prev: Map<string, Seen>, anchor: string, t0: d3.ZoomTransform, view: { width: number; height: number }) {
  const was = [...prev.values()].filter((p) => within(anchor, p.graphId));
  const now = layout.nodes.filter((n) => within(anchor, n.node.graphId));
  if (!was.length || !now.length) return null;
  const a = rectOf(was);
  const b = rectOf(now);
  const m = 28;
  const k = Math.min(t0.k, (view.width - 2 * m) / b.width, (view.height - 2 * m) / b.height);
  let x = t0.applyX(a.x) - b.x * k;
  let y = t0.applyY(a.y) - b.y * k;
  const into = (lo: number, size: number, room: number) => (lo + size > room - m ? room - m - (lo + size) : 0) || (lo < m ? m - lo : 0);
  x += into(x + b.x * k, b.width * k, view.width);
  y += into(y + b.y * k, b.height * k, view.height);
  return d3.zoomIdentity.translate(x, y).scale(k);
}

/** The outline that grows from the anchor's old box(es) to what replaced them. */
function anchorGlow(layout: ViewLayout, prev: Map<string, Seen>, anchor: string, shift: CameraShift): { from: Rect; to: Rect } | null {
  const was = [...prev.values()].filter((p) => within(anchor, p.graphId));
  const now = layout.nodes.filter((n) => within(anchor, n.node.graphId));
  if (!was.length || !now.length) return null;
  const a = rectOf(was);
  const at = carry(shift, a.x, a.y);
  const r = shift.t0.k / shift.t1.k;
  const frames = (layout.frames ?? []).filter((f) => f.groupId === anchor);
  const pad = 4;
  const b = frames.length ? rectOf(frames) : rectOf(now);
  return {
    from: { x: at.x - pad, y: at.y - pad, width: a.width * r + 2 * pad, height: a.height * r + 2 * pad },
    to: { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad },
  };
}

/**
 * Where each box of a new layout starts its move: where it was before (same
 * box, or the same graph node in another region), out of the folder it was
 * opened from, or at the middle of the boxes it folded together. Brand-new
 * boxes fade in where they land. The first layout doesn't move. With a camera
 * shift, starts are carried into the new camera so nothing jumps.
 */
function planFlights(layout: ViewLayout, prev: Map<string, Seen>, shift: CameraShift | null) {
  const out = new Map<string, Flight>();
  if (prev.size === 0) return out;
  const r = shift ? shift.t0.k / shift.t1.k : 1;
  const from = (x: number, y: number, scale: number, opacity: number): Flight => ({ ...carry(shift, x, y), scale: scale * r, opacity });
  const byGraph = new Map<string, Seen>();
  for (const p of prev.values()) if (!byGraph.has(p.graphId)) byGraph.set(p.graphId, p);
  const leaving = new Map<Seen, PositionedNode[]>();
  for (const n of layout.nodes) {
    const same = prev.get(n.id) ?? byGraph.get(n.node.graphId);
    if (same) {
      const f = from(same.x, same.y, 1, 1);
      if (Math.abs(f.x - n.x) > 0.5 || Math.abs(f.y - n.y) > 0.5 || Math.abs(f.scale - 1) > 0.001) out.set(n.id, f);
      continue;
    }
    let parent: Seen | undefined;
    for (const p of prev.values()) {
      if (p.graphId !== n.node.graphId && within(p.graphId, n.node.graphId) && (!parent || p.graphId.length > parent.graphId.length)) parent = p;
    }
    if (parent) {
      out.set(n.id, from(parent.x + parent.width * 0.2, parent.y + parent.height * 0.2, 0.6, 0.2));
      leaving.set(parent, [...(leaving.get(parent) ?? []), n]);
      continue;
    }
    const kids = [...prev.values()].filter((p) => within(n.node.graphId, p.graphId));
    if (kids.length) {
      const x = kids.reduce((a, p) => a + p.x, 0) / kids.length;
      const y = kids.reduce((a, p) => a + p.y, 0) / kids.length;
      out.set(n.id, from(x, y, 1, 0.4));
      continue;
    }
    out.set(n.id, { x: n.x, y: n.y + 6, scale: 1, opacity: 0 });
  }
  // An opened folder lets its boxes out in reading order.
  for (const boxes of leaving.values()) {
    boxes.sort((a, b) => a.x - b.x || a.y - b.y);
    boxes.forEach((n, i) => {
      const f = out.get(n.id);
      if (f && i > 0) f.delay = Math.min(i * STAGGER_MS, MAX_STAGGER_MS);
    });
  }
  return out;
}

const KIND_WORD: Record<string, string> = { folder: "folder", file: "file", symbol: "symbol", external: "package" };

/** A label / value pair in the cards' two-column grid (the treemap tooltip's layout). */
function Stat(props: { label: string; value: string | number }) {
  return (
    <div class="flex min-w-0 items-baseline justify-between gap-2">
      <span class="truncate text-[var(--plc-on-muted)]">{props.label}</span>
      <span class="plc-data-sm shrink-0 text-right text-[var(--plc-on-surface)]">{props.value}</span>
    </div>
  );
}

const HINT = "text-[11px] text-[var(--plc-on-subtle)]";

/** The box's own card: what the box cannot fit — full path, link totals, the metric by name. */
function NodeCard(props: {
  node: ViewNode;
  /** The box is the focus itself, so a click stays put. */
  focused: boolean;
  info?: BoxInfo;
  metric?: { label: string; full: string; color: string } | null;
  loc?: number;
  hub?: { importers: number };
  /** A folder's children, largest first. */
  contents?: ContentItem[];
  itemColor: (c: ContentItem) => string;
}) {
  const kind = () =>
    [
      props.node.kind === "symbol" ? (props.node.symbolKind ?? "symbol") : KIND_WORD[props.node.kind],
      props.node.kind === "folder" ? props.node.subtitle : undefined,
      props.node.kind === "symbol" && props.node.region === "center" ? props.node.subtitle : undefined,
      props.node.region !== "center" && props.node.memberCount > 1 ? `${props.node.memberCount} linked` : undefined,
      props.hub ? "hub" : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  const i = () => props.info;
  return (
    <div>
      <div class="flex items-baseline gap-3">
        <div class="plc-data-sm min-w-0 flex-1 break-all font-semibold text-[var(--plc-on-surface)]">{props.node.label}</div>
        <Show when={props.loc}>
          {(loc) => (
            <div class="shrink-0 whitespace-nowrap">
              <span class="plc-data-sm font-semibold text-[var(--plc-on-surface)]">{Math.round(loc()).toLocaleString("en-US")}</span>
              <span class="ml-1 text-[11px] text-[var(--plc-on-subtle)]">LOC</span>
            </div>
          )}
        </Show>
      </div>
      <div class={HINT}>{kind()}</div>
      <Show when={props.node.title && props.node.title !== props.node.label}>
        <div class="plc-data-sm truncate !font-normal text-[var(--plc-on-subtle)]">{tailPath(props.node.title)}</div>
      </Show>
      <Show when={props.metric}>
        {(m) => (
          <div class="mt-1.5 flex items-center gap-1.5">
            <span class="size-2.5 shrink-0 rounded-[2px] border border-black/15" style={{ background: m().color }} />
            <span class="text-[var(--plc-on-muted)]">{m().label}</span>
            <span class="plc-data-sm font-semibold text-[var(--plc-on-surface)]">{m().full}</span>
          </div>
        )}
      </Show>
      <Show when={props.contents?.length ? props.contents : undefined}>
        {(items) => {
          const MAX = 6;
          const total = () => items().reduce((a, c) => a + c.loc, 0) || 1;
          const restLoc = () => items().slice(MAX).reduce((a, c) => a + c.loc, 0);
          return (
            <div class="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-2 gap-y-px border-t border-[var(--plc-divider)] pt-1">
              <span class="col-span-4 text-[11px] text-[var(--plc-on-subtle)]">Largest inside</span>
              <For each={items().slice(0, MAX)}>
                {(c) => (
                  <>
                    <span class="size-2 self-center rounded-[2px] border border-black/15" style={{ background: props.itemColor(c) }} />
                    <span class="plc-data-sm truncate !font-normal text-[var(--plc-on-surface)]">
                      {c.name}
                      {c.kind === "folder" ? "/" : ""}
                    </span>
                    <span class="plc-data-sm text-right text-[var(--plc-on-muted)]">{formatLoc(c.loc).replace(" LOC", "")}</span>
                    <span class="plc-data-sm w-8 text-right text-[var(--plc-on-subtle)]">{Math.round((100 * c.loc) / total())}%</span>
                  </>
                )}
              </For>
              <Show when={items().length > MAX}>
                <span />
                <span class="text-[11px] text-[var(--plc-on-subtle)]">+{items().length - MAX} more</span>
                <span class="plc-data-sm text-right text-[var(--plc-on-subtle)]">{formatLoc(restLoc()).replace(" LOC", "")}</span>
                <span class="plc-data-sm w-8 text-right text-[var(--plc-on-subtle)]">{Math.round((100 * restLoc()) / total())}%</span>
              </Show>
            </div>
          );
        }}
      </Show>
      <Show when={i()}>
        {(b) => (
          <div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-px">
            <Stat label="Imported by" value={b().importers.length} />
            <Stat label="Imports" value={b().imports.length} />
            <Stat label="Links in" value={b().inLinks} />
            <Stat label="Links out" value={b().outLinks} />
            <Show when={b().cycles.length}>
              <Stat label="Mutual" value={b().cycles.length} />
            </Show>
          </div>
        )}
      </Show>
      <div class={`mt-1.5 border-t border-[var(--plc-divider)] pt-1 ${HINT}`}>
        {props.focused
          ? "Double-click or middle-click to open code"
          : props.node.kind === "folder" && props.node.expandable
            ? "Click focuses · Shift-click opens in place"
            : props.node.kind === "symbol"
            ? "Click to isolate · double-click to open"
            : props.node.expandable
              ? "Click focuses · Shift-click shows symbols · double-click opens"
              : "Click to focus · double-click or middle-click to open"}
        <span class="float-right pl-3">? for keys</span>
      </div>
    </div>
  );
}

/** An icon's card: a title, a note, and a neighbor list with link counts. */
function TipCard(props: { tip: Tip }) {
  return (
    <div>
      <div class="font-semibold text-[var(--plc-on-surface)]">{props.tip.title}</div>
      <For each={props.tip.lines ?? []}>{(l) => <div class={HINT}>{l}</div>}</For>
      <Show when={props.tip.rows?.length}>
        <div class="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-px border-t border-[var(--plc-divider)] pt-1">
          <span class="plc-label-sm text-[var(--plc-on-subtle)]">Box</span>
          <span class="text-right text-[10px] text-[var(--plc-on-subtle)]">links</span>
          <For each={props.tip.rows}>
            {([name, count]) => (
              <>
                <span class="plc-data-sm truncate text-[var(--plc-on-surface)]">{name}</span>
                <span class="plc-data-sm text-right text-[var(--plc-on-muted)]">{count}</span>
              </>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function EdgeCard(props: { edge: PositionedEdge; nodes: Map<string, PositionedNode> }) {
  const s = () => props.nodes.get(props.edge.source)?.node;
  const t = () => props.nodes.get(props.edge.target)?.node;
  const syms = () => props.edge.edge.symbols;
  return (
    <div>
      <div class="plc-data-sm font-semibold text-[var(--plc-on-surface)]">
        {s()?.label}
        <span class="px-1 font-normal text-[var(--plc-on-subtle)]">→</span>
        {t()?.label}
      </div>
      <div class={HINT}>
        {props.edge.edge.weight} import link{props.edge.edge.weight === 1 ? "" : "s"}
        {props.edge.edge.faint ? " · context" : ""}
      </div>
      <Show when={syms().length > 0}>
        <div class="plc-data-sm mt-1 border-t border-[var(--plc-divider)] pt-1 !font-normal text-[var(--plc-on-muted)]">
          {syms().slice(0, 12).join(", ")}
          {syms().length > 12 ? ` +${syms().length - 12} more` : ""}
        </div>
      </Show>
    </div>
  );
}
