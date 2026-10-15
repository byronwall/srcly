import * as d3 from "d3";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { truncateTextToWidth } from "../../utils/svgText";
import { boundsOf } from "./geometry";
import { createClickIntent, liveHover } from "./interaction";
import { MAX_SCALE, type PositionedEdge, type PositionedNode, type ViewLayout } from "./layout";
import type { Region, ViewNode } from "./viewModel";

const LABEL_FONT = "500 12px Inter, ui-sans-serif, system-ui, sans-serif";
const PAD_X = 8;
const ICON_W = 16;
const COUNT_W = 30;
const MENU_BTN_W = 20;
const MENU_BTN_H = 16;

export interface CanvasApi {
  fit: () => void;
}

const REGION_TITLE: Record<Region, string> = {
  in: "Imported by",
  center: "Focus",
  out: "Imports",
};

function edgePath(e: PositionedEdge): string {
  return e.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

function strokeWidth(weight: number, faint: boolean): number {
  if (faint) return 1;
  return Math.min(4.5, 1.25 + Math.log2(weight) * 0.75);
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
}) {
  let svgRef!: SVGSVGElement;
  let gRef!: SVGGElement;
  const [rawHoverNode, setHoverNode] = createSignal<string | null>(null);
  const [rawHoverEdge, setHoverEdge] = createSignal<string | null>(null);
  const [card, setCard] = createSignal<{ x: number; y: number; node?: PositionedNode; edge?: PositionedEdge } | null>(null);

  // A refocus swaps the hovered element out, so its mouseleave never fires:
  // reset hover on every new layout and ignore ids the layout no longer has.
  const nodeIds = createMemo(() => new Set(props.layout.nodes.map((n) => n.id)));
  const edgeIds = createMemo(() => new Set(props.layout.edges.map((e) => e.id)));
  const hoverNode = () => liveHover(nodeIds(), rawHoverNode());
  const hoverEdge = () => liveHover(edgeIds(), rawHoverEdge());
  createEffect(() => {
    void props.layout;
    setHoverNode(null);
    setHoverEdge(null);
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

  // Edges touching the hovered node (or the hovered edge itself) are emphasized.
  const activeEdges = createMemo(() => {
    const hn = hoverNode();
    const he = hoverEdge();
    if (!hn && !he) return null;
    const set = new Set<string>();
    for (const e of props.layout.edges) {
      if (e.id === he || e.source === hn || e.target === hn) set.add(e.id);
    }
    return set;
  });
  const activeNodes = createMemo(() => {
    const ae = activeEdges();
    if (!ae) return null;
    const set = new Set<string>();
    const hn = hoverNode();
    if (hn) set.add(hn);
    for (const e of props.layout.edges) {
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

  // Column headers above each region.
  const regionHeaders = createMemo(() => {
    const out: { region: Region; x: number; y: number; width: number }[] = [];
    const regions = new Set(props.layout.nodes.map((n) => n.node.region));
    if (regions.size < 2 && !props.focusIsGroup) return out;
    const top = Math.min(...props.layout.nodes.map((n) => n.y));
    for (const region of ["in", "center", "out"] as Region[]) {
      const ns = props.layout.nodes.filter((n) => n.node.region === region);
      if (ns.length === 0) continue;
      const x0 = Math.min(...ns.map((n) => n.x));
      const x1 = Math.max(...ns.map((n) => n.x + n.width));
      out.push({ region, x: x0, y: top - 16, width: x1 - x0 });
    }
    return out;
  });

  const showCard = (ev: MouseEvent, payload: { node?: PositionedNode; edge?: PositionedEdge }) => {
    const host = svgRef.getBoundingClientRect();
    setCard({ x: ev.clientX - host.left + 14, y: ev.clientY - host.top + 14, ...payload });
  };

  const labelFor = (n: PositionedNode) => {
    const hasCount = n.node.memberCount > 1;
    const max = n.width - PAD_X * 2 - ICON_W - (hasCount ? COUNT_W : 0);
    return truncateTextToWidth(n.node.label, max, LABEL_FONT);
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
          <For each={regionHeaders()}>
            {(h) => (
              <text
                x={h.x + h.width / 2}
                y={h.y}
                text-anchor="middle"
                class={
                  h.region === "center" && props.focusIsGroup
                    ? "fill-[var(--plc-accent-hover)] text-[12px] font-semibold"
                    : "fill-[var(--plc-on-subtle)] text-[11px] font-semibold uppercase tracking-wide"
                }
              >
                {h.region === "center" && props.focusIsGroup && props.focusLabel ? props.focusLabel : REGION_TITLE[h.region]}
              </text>
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
                      stroke-width={strokeWidth(e.edge.weight, e.edge.faint)}
                      stroke-opacity={dimmed() ? 0.12 : e.edge.faint && !active() ? 0.35 : 0.9}
                      stroke-dasharray={e.edge.faint ? "3 3" : undefined}
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
          </g>

          <For each={props.layout.nodes}>
            {(n) => {
              const isFocus = n.node.isFocus;
              const dimmed = () => activeNodes() !== null && !activeNodes()!.has(n.id);
              return (
                <g
                  transform={`translate(${n.x},${n.y})`}
                  class="cursor-pointer"
                  style={{ opacity: dimmed() ? 0.35 : 1, transition: "opacity 140ms ease" }}
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
                    rx="4"
                    fill={isFocus ? "var(--plc-accent-subtle)" : "var(--plc-surface)"}
                    stroke={
                      isFocus
                        ? "var(--plc-accent)"
                        : hoverNode() === n.id
                          ? "var(--plc-on-subtle)"
                          : "var(--plc-border-strong)"
                    }
                    stroke-width={isFocus ? 1.5 : 1}
                    stroke-dasharray={n.node.kind === "external" ? "4 2" : undefined}
                    style={{ transition: "stroke 140ms ease" }}
                  />
                  <KindGlyph node={n.node} x={PAD_X} y={n.height / 2 - 6} />
                  <text
                    x={PAD_X + ICON_W}
                    y={n.height / 2}
                    dominant-baseline="central"
                    class="text-[12px] font-medium"
                    fill={isFocus ? "var(--plc-accent-hover)" : "var(--plc-on-surface)"}
                  >
                    {labelFor(n)}
                  </text>
                  <Show when={n.node.memberCount > 1}>
                    <text
                      x={n.width - PAD_X}
                      y={n.height / 2}
                      dominant-baseline="central"
                      text-anchor="end"
                      class="fill-[var(--plc-on-subtle)] text-[11px] tabular-nums"
                    >
                      {n.node.memberCount}
                    </text>
                  </Show>
                  <Show when={props.onMenu && hoverNode() === n.id}>
                    <g
                      transform={`translate(${n.width - MENU_BTN_W - 3},${(n.height - MENU_BTN_H) / 2})`}
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
              {(pn) => <NodeCard node={pn().node} layout={props.layout} id={pn().id} />}
            </Show>
            <Show when={c().edge}>
              {(pe) => <EdgeCard edge={pe()} nodes={nodeById()} />}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

function NodeCard(props: { node: ViewNode; layout: ViewLayout; id: string }) {
  const incoming = () => props.layout.edges.filter((e) => e.target === props.id && !e.edge.faint);
  const outgoing = () => props.layout.edges.filter((e) => e.source === props.id && !e.edge.faint);
  const sum = (es: PositionedEdge[]) => es.reduce((a, e) => a + e.edge.weight, 0);
  return (
    <div class="space-y-0.5">
      <div class="break-all font-semibold">{props.node.title || props.node.label}</div>
      <div class="text-[var(--plc-on-muted)]">
        {props.node.kind}
        {props.node.memberCount > 1 ? ` · ${props.node.memberCount} items` : ""}
        {props.node.context ? ` · in ${props.node.context}` : ""}
      </div>
      <div class="tabular-nums text-[var(--plc-on-muted)]">
        {sum(incoming())} in · {sum(outgoing())} out
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
