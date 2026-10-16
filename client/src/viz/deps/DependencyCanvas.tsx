import * as d3 from "d3";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { makeTextMeasurer, truncateTextToWidth } from "../../utils/svgText";
import { formatMetricValue } from "../../utils/metricsStore";
import { treemapFillColor, treemapRampPosition, rampColor } from "../treemap/utils/colors";
import { boxInfo, type BoxInfo } from "./boxInfo";
import {
  CONTEXT_EDGE_DASH,
  CONTEXT_EDGE_OPACITY,
  EDGE_OPACITY,
  edgeStrokeWidth,
  EXTERNAL_BOX_DASH,
} from "./encoding";
import { boundsOf } from "./geometry";
import { createClickIntent, liveHover } from "./interaction";
import { formatLoc } from "./metrics";
import type { HubShape } from "./hubs";
import { MAX_SCALE, type PositionedEdge, type PositionedNode, type ViewLayout } from "./layout";
import type { Region, ViewNode } from "./viewModel";

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
const SIZE_BAR_H = 2;
const METRIC_BAR_W = 28;
/** Treemap color mixed into the box fill: enough to read, soft enough for text. */
const TINT = 0.3;
const MUTED_TEXT = "var(--plc-on-muted)";

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
  return truncateTextToWidth(text, max, font);
}

export interface CanvasApi {
  fit: () => void;
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
};

function KindGlyph(props: { node: ViewNode; x: number; y: number }) {
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
      <Show
        when={props.dir === "in"}
        fallback={<path d="M1.5 2.5v6h4 M5 5.5h5.5 M8.5 3.5l2 2-2 2" />}
      >
        <path d="M10.5 2.5v6h-4 M1 5.5h5.5 M4.5 3.5l2 2-2 2" />
      </Show>
    </g>
  );
}

/** Two arrows chasing each other: a mutual import. */
function CycleIcon(props: { x: number; y: number }) {
  return (
    <g transform={`translate(${props.x - 5},${props.y - 5})`} fill="none" stroke="var(--plc-danger, #dc2626)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8.5 3.2A4 4 0 0 0 1.4 4 M1.5 6.8A4 4 0 0 0 8.6 6 M1.2 1.6v2.6h2.6 M8.8 8.4V5.8H6.2" />
    </g>
  );
}

type Tip = { title: string; lines: string[] };

export function DependencyCanvas(props: {
  layout: ViewLayout;
  /** Name of the focused item; a focused file frames its symbols under this title. */
  focusLabel?: string;
  focusIsGroup?: boolean;
  onFocus: (node: ViewNode) => void;
  onOpen: (node: ViewNode) => void;
  /** Node actions: right-click, or the "⋯" shown on the hovered node. */
  onMenu?: (node: ViewNode, at: { x: number; y: number }) => void;
  ref?: (api: CanvasApi) => void;
  /** Treemap metrics per box id (boxes without a treemap match are absent). */
  metrics?: Map<string, Record<string, any>>;
  /** The treemap's color metric; boxes are tinted with the treemap's colors. */
  colorMetric?: string;
}) {
  let svgRef!: SVGSVGElement;
  let gRef!: SVGGElement;
  const [rawHoverNode, setHoverNode] = createSignal<string | null>(null);
  const [rawHoverEdge, setHoverEdge] = createSignal<string | null>(null);
  const [card, setCard] = createSignal<{ x: number; y: number; node?: PositionedNode; edge?: PositionedEdge; tip?: Tip } | null>(null);
  /** A hub whose badge is hovered somewhere: its hidden edges show. */
  const [rawHoverHub, setHoverHub] = createSignal<string | null>(null);

  // A refocus swaps the hovered element out, so its mouseleave never fires:
  // reset hover on every new layout and ignore ids the layout no longer has.
  const nodeIds = createMemo(() => new Set(props.layout.nodes.map((n) => n.id)));
  const edgeIds = createMemo(() => new Set(props.layout.edges.map((e) => e.id)));
  const hoverNode = () => liveHover(nodeIds(), rawHoverNode());
  const hoverEdge = () => liveHover(edgeIds(), rawHoverEdge());
  const hoverHub = () => liveHover(nodeIds(), rawHoverHub());
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
    if (animate && !reduce) sel.transition().duration(220).call(zoom.transform, t);
    else sel.call(zoom.transform, t);
  };

  onMount(() => {
    d3.select(svgRef).call(zoom).on("dblclick.zoom", null);
    props.ref?.({ fit: () => fit(true) });
    const ro = new ResizeObserver(() => fit(false));
    ro.observe(svgRef);
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    void props.layout;
    queueMicrotask(() => fit(true));
  });

  const nodeById = createMemo(() => new Map(props.layout.nodes.map((n) => [n.id, n])));
  const info = createMemo(() => boxInfo(props.layout));
  const hubById = createMemo(() => new Map((props.layout.hubs ?? []).map((h) => [h.id, h])));
  const allEdges = createMemo(() => [...props.layout.edges, ...(props.layout.hiddenEdges ?? [])]);

  // Edges touching the hovered node (or the hovered edge itself) are
  // emphasized. Hovering a hub, or one of its badges, brings its hidden edges back.
  const activeEdges = createMemo(() => {
    const hn = hoverHub() ?? hoverNode();
    const he = hoverEdge();
    if (!hn && !he) return null;
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
    const hn = hoverHub() ?? hoverNode();
    if (hn) set.add(hn);
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
    const host = svgRef.getBoundingClientRect();
    setCard({ x: ev.clientX - host.left + 14, y: ev.clientY - host.top + 14, ...payload });
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
  // Boxes inside a package frame: the frame already names the package.
  const framed = createMemo(() => {
    const out = new Set<string>();
    for (const f of props.layout.frames ?? []) {
      for (const n of props.layout.nodes) {
        if (n.column === f.column && n.node.group?.id === f.groupId && n.y >= f.y && n.y + n.height <= f.y + f.height) out.add(n.id);
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
    return n.node.kind === "file" || n.node.kind === "symbol"
      ? truncatePathStart(sub, subtitleRoom(n), SUBTITLE_FONT)
      : truncateTextToWidth(sub, subtitleRoom(n), SUBTITLE_FONT);
  };
  const labelOf = (id: string) => nodeById().get(id)?.node.label ?? id;
  const listTip = (ids: string[], max = 10) => [
    ...ids.slice(0, max).map(labelOf),
    ...(ids.length > max ? [`+${ids.length - max} more`] : []),
  ];
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
    return { t, color: rampColor(t), value: metric === "loc" ? "" : formatMetricValue(metric, m[metric]) };
  };

  // Folder size bars: log(LOC) — or log(files) without treemap metrics —
  // against the largest folder on the same side.
  const sizeBarFraction = createMemo(() => {
    const size = (n: PositionedNode) => props.metrics?.get(n.id)?.loc ?? (props.metrics?.size ? 0 : (n.node.fileCount ?? 0));
    const max: Record<Region, number> = { in: 0, center: 0, out: 0 };
    for (const n of props.layout.nodes) {
      if (n.node.kind === "folder") max[n.node.region] = Math.max(max[n.node.region], size(n));
    }
    const out = new Map<string, number>();
    for (const n of props.layout.nodes) {
      const top = max[n.node.region];
      if (n.node.kind !== "folder" || top === 0) continue;
      out.set(n.id, Math.max(0.04, Math.log1p(size(n)) / Math.log1p(top)));
    }
    return out;
  });

  // Treemap colors, kept apart from layout: changing the color metric only
  // repaints. Boxes without a treemap match keep the neutral styling.
  // Boxes get a pastel of the treemap color with a border in the same hue;
  // text stays the regular dark ink on every box.
  const paint = createMemo(() => {
    const out = new Map<string, { fill: string; stroke: string }>();
    const metric = props.colorMetric;
    if (!metric || !props.metrics) return out;
    for (const [id, m] of props.metrics) {
      const base = treemapFillColor(metric, m, 0);
      out.set(id, {
        fill: d3.interpolateLab("#ffffff", base)(TINT),
        stroke: d3.interpolateLab(base, "#334155")(0.35),
      });
    }
    return out;
  });

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
              <text x={g.x} y={g.y} class="fill-[var(--plc-on-muted)] text-[12px] font-semibold">
                {g.label}
              </text>
            )}
          </For>
          {/* Package frames around side neighbors (drawn under edges and boxes). */}
          <For each={props.layout.frames ?? []}>
            {(f) => (
              <g>
                <rect
                  x={f.x}
                  y={f.y}
                  width={f.width}
                  height={f.height}
                  rx="6"
                  fill="var(--plc-surface)"
                  fill-opacity="0.6"
                  stroke="var(--plc-border)"
                />
                <text x={f.x + 7} y={f.y + 11.5} class="fill-[var(--plc-on-subtle)] text-[11px] font-semibold">
                  {truncateTextToWidth(f.label, f.width - 14, FRAME_LABEL_FONT)}
                </text>
              </g>
            )}
          </For>
          <Show when={props.focusIsGroup ? focusFrame() : null}>
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
          <Show when={props.focusIsGroup && props.focusLabel ? focusFrame() : null}>
            {(f) => (
              <text
                x={f().x + f().width / 2}
                y={f().y - 8}
                text-anchor="middle"
                class="fill-[var(--plc-accent-hover)] text-[12px] font-semibold"
              >
                {props.focusLabel}
              </text>
            )}
          </Show>
          <g fill="none">
            <For each={props.layout.edges}>
              {(e) => {
                const active = () => activeEdges()?.has(e.id) ?? false;
                const dimmed = () => activeEdges() !== null && !active();
                return (
                  <g>
                    <path
                      d={edgePath(e)}
                      stroke={active() ? "var(--plc-accent)" : "var(--plc-tertiary)"}
                      stroke-width={edgeStrokeWidth(e.edge.weight, e.edge.faint)}
                      stroke-opacity={dimmed() ? 0.12 : e.edge.faint && !active() ? CONTEXT_EDGE_OPACITY : EDGE_OPACITY}
                      stroke-dasharray={e.edge.faint ? CONTEXT_EDGE_DASH : undefined}
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
                    stroke={hubById().get(e.target)?.color ?? "var(--plc-accent)"}
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
              return (
                <g
                  transform={`translate(${n.x},${n.y})`}
                  class="cursor-pointer"
                  style={{ opacity: dimmed() ? 0.62 : 1, transition: "opacity 140ms ease" }}
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
                    clickIntent.click(n.node, ev);
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
                  <rect
                    width={n.width}
                    height={n.height}
                    rx="6"
                    filter={dimmed() ? undefined : "url(#dv-shadow)"}
                    fill={
                      dimmed()
                        ? "var(--plc-surface)"
                        : (paint().get(n.id)?.fill ??
                          (isFocus ? "var(--plc-accent-subtle)" : isFolder ? "var(--plc-surface-muted)" : "var(--plc-surface)"))
                    }
                    stroke={
                      isFocus
                        ? "var(--plc-accent)"
                        : hoverNode() === n.id || hoverHub() === n.id
                          ? "var(--plc-on-muted)"
                          : (paint().get(n.id)?.stroke ?? (isFolder ? "var(--plc-on-disabled)" : "var(--plc-border-strong)"))
                    }
                    stroke-width={isFocus ? 2.25 : isFolder || hub() ? 1.5 : 1}
                    stroke-dasharray={n.node.kind === "external" ? EXTERNAL_BOX_DASH : undefined}
                    style={{ transition: "stroke 140ms ease, fill 140ms ease" }}
                  />
                  <Show when={sizeBarFraction().get(n.id)}>
                    {(f) => (
                      <rect
                        x={6}
                        y={n.height - SIZE_BAR_H - 2}
                        width={(n.width - 12) * f()}
                        height={SIZE_BAR_H}
                        rx={SIZE_BAR_H / 2}
                        fill="var(--plc-tertiary)"
                        fill-opacity="0.35"
                      />
                    )}
                  </Show>
                  {/* Row 1: kind + name (a hub repeats its badge, large, on the right). */}
                  <KindGlyph node={n.node} x={PAD_X} y={LINE1_Y - 10} />
                  <text x={PAD_X + ICON_W} y={LINE1_Y} class="text-[12.5px] font-semibold" fill="var(--plc-on-surface)">
                    {labelFor(n)}
                  </text>
                  <Show when={hub() && !(props.onMenu && hoverNode() === n.id) ? hub() : null}>
                    {(h) => (
                      <g
                        {...iconHover(() => ({
                          title: `Hub · imported by ${h().importers} boxes`,
                          lines: ["Its edges are hidden; importers show this badge.", "Hover here or on a badge to draw them."],
                        }), h().id)}
                      >
                        <rect x={n.width - 22} y={4} width={18} height={18} fill="transparent" />
                        <HubGlyph shape={h().shape} color={h().color} x={n.width - 13} y={LINE1_Y - 4.5} r={6} />
                      </g>
                    )}
                  </Show>
                  {/* Row 2: where it lives (or what it holds) + LOC. */}
                  <Show when={shownSubtitle(n)}>
                    <text x={PAD_X + ICON_W} y={LINE2_Y} class="text-[11px]" fill={MUTED_TEXT}>
                      {subtitleFor(n)}
                    </text>
                  </Show>
                  <Show when={locText(n)}>
                    <text x={n.width - PAD_X} y={LINE2_Y} text-anchor="end" class="text-[11px] tabular-nums" fill={MUTED_TEXT}>
                      {locText(n)}
                    </text>
                  </Show>
                  {/* Row 3: import links in and out, and the color metric as a bar. */}
                  <Show when={box()}>
                    {(b) => (
                      <g class="text-[var(--plc-on-muted)]">
                        <g
                          {...iconHover(() => ({
                            title: `${b().inLinks} import link${b().inLinks === 1 ? "" : "s"} in`,
                            lines: b().importers.length ? listTip(b().importers) : ["Nothing here imports it."],
                          }))}
                        >
                          <rect x={PAD_X - 2} y={LINE3_Y - 11} width={40} height={14} fill="transparent" />
                          <FlowIcon dir="in" x={PAD_X} y={LINE3_Y} />
                          <text x={PAD_X + 15} y={LINE3_Y} class="text-[11px] tabular-nums" fill="currentColor">
                            {b().inLinks}
                          </text>
                        </g>
                        <g
                          {...iconHover(() => ({
                            title: `${b().outLinks} import link${b().outLinks === 1 ? "" : "s"} out`,
                            lines: b().imports.length ? listTip(b().imports) : ["Imports nothing shown here."],
                          }))}
                        >
                          <rect x={PAD_X + 44} y={LINE3_Y - 11} width={40} height={14} fill="transparent" />
                          <FlowIcon dir="out" x={PAD_X + 46} y={LINE3_Y} />
                          <text x={PAD_X + 61} y={LINE3_Y} class="text-[11px] tabular-nums" fill="currentColor">
                            {b().outLinks}
                          </text>
                        </g>
                      </g>
                    )}
                  </Show>
                  <Show when={metricRow(n)}>
                    {(m) => (
                      <g>
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
                  {/* Row 4: badges for the hubs it imports, mutual imports; a hub names itself. */}
                  <Show when={hub()}>
                    {(h) => (
                      <text x={PAD_X + (box()?.hubBadges.length ?? 0) * 15} y={ROW4_Y + 3.5} class="text-[10.5px] font-medium" fill={h().color}>
                        hub · {h().importers} importers
                      </text>
                    )}
                  </Show>
                  <For each={box()?.hubBadges ?? []}>
                    {(h, i) => (
                      <g
                        {...iconHover(() => ({
                          title: `Imports ${labelOf(h.id)}`,
                          lines: [`A hub imported by ${h.importers} boxes; its edges are hidden.`],
                        }), h.id)}
                      >
                        <rect x={PAD_X - 2 + i() * 15} y={ROW4_Y - 7} width={14} height={14} fill="transparent" />
                        <HubGlyph shape={h.shape} color={h.color} x={PAD_X + 5 + i() * 15} y={ROW4_Y} r={4.5} />
                      </g>
                    )}
                  </For>
                  <Show when={(box()?.cycles.length ?? 0) > 0}>
                    <g
                      {...iconHover(() => ({
                        title: "Mutual import",
                        lines: ["Imports and is imported by:", ...listTip(box()!.cycles)],
                      }))}
                    >
                      <rect x={n.width - PAD_X - 14} y={ROW4_Y - 7} width={14} height={14} fill="transparent" />
                      <CycleIcon x={n.width - PAD_X - 6} y={ROW4_Y} />
                    </g>
                  </Show>
                  <Show when={props.onMenu && hoverNode() === n.id}>
                    <g
                      transform={`translate(${n.width - MENU_BTN_W - 3},${LINE1_Y - MENU_BTN_H + 4})`}
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
            class="pointer-events-none absolute z-20 max-w-[360px] rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface)] px-2.5 py-1.5 text-xs text-[var(--plc-on-surface)] shadow-[var(--plc-menu-shadow)]"
            style={{ left: `${c().x}px`, top: `${c().y}px` }}
          >
            <Show when={c().node}>
              {(pn) => <NodeCard node={pn().node} info={info().get(pn().id)} />}
            </Show>
            <Show when={c().edge}>
              {(pe) => <EdgeCard edge={pe()} nodes={nodeById()} />}
            </Show>
            <Show when={c().tip}>
              {(t) => (
                <div class="space-y-0.5">
                  <div class="font-semibold">{t().title}</div>
                  <For each={t().lines}>{(l) => <div class="text-[var(--plc-on-muted)]">{l}</div>}</For>
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

function NodeCard(props: { node: ViewNode; info?: BoxInfo }) {
  return (
    <div class="space-y-0.5">
      <div class="break-all font-semibold">{props.node.title || props.node.label}</div>
      <div class="text-[var(--plc-on-muted)]">
        {props.node.kind}
        {props.node.kind === "folder" && props.node.subtitle ? ` · ${props.node.subtitle}` : ""}
        {props.node.region !== "center" && props.node.memberCount > 1 ? ` · ${props.node.memberCount} linked` : ""}
      </div>
      <div class="tabular-nums text-[var(--plc-on-muted)]">
        {props.info?.inLinks ?? 0} in · {props.info?.outLinks ?? 0} out
      </div>
      <div class="text-[var(--plc-on-subtle)]">
        {props.node.isFocus
          ? "Double-click or middle-click to open code"
          : "Click to focus · double-click or middle-click to open"}
      </div>
    </div>
  );
}

function EdgeCard(props: { edge: PositionedEdge; nodes: Map<string, PositionedNode> }) {
  const s = () => props.nodes.get(props.edge.source)?.node;
  const t = () => props.nodes.get(props.edge.target)?.node;
  const syms = () => props.edge.edge.symbols;
  return (
    <div class="space-y-0.5">
      <div>
        <span class="font-semibold">{s()?.label}</span>
        <span class="text-[var(--plc-on-subtle)]"> imports </span>
        <span class="font-semibold">{t()?.label}</span>
      </div>
      <Show when={props.edge.edge.weight > 1}>
        <div class="tabular-nums text-[var(--plc-on-muted)]">{props.edge.edge.weight} import links</div>
      </Show>
      <Show when={syms().length > 0}>
        <div class="font-mono text-[11px] text-[var(--plc-on-muted)]">
          {syms().slice(0, 12).join(", ")}
          {syms().length > 12 ? ` +${syms().length - 12} more` : ""}
        </div>
      </Show>
    </div>
  );
}
