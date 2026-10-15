import * as d3 from "d3";
import { Maximize2, Minimize2, Scan } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Button } from "../components/ui/Button";
import { CheckboxRow } from "../components/ui/CheckboxRow";
import { cx } from "../components/ui/classes";
import { truncateTextToWidth } from "../utils/svgText";
import { boundsOf } from "../viz/deps/geometry";
import { layoutViewSync, type PositionedEdge, type PositionedNode, type ViewLayout } from "../viz/deps/layout";
import type { Region } from "../viz/deps/viewModel";
import { DiffStat, StatusIcon } from "./bits";
import { buildCompareGraph, DEFAULT_GRAPH_OPTIONS, edgeStateOn, type CompareGraphModel } from "./graphModel";
import { fileHealth, STATUS_LABEL } from "./metrics";
import type { ComparePayload } from "./types";

type Side = "base" | "head";

const FONT = "500 12px Inter, ui-sans-serif, system-ui, sans-serif";
const SUBTITLE_FONT = "400 11px Inter, ui-sans-serif, system-ui, sans-serif";
const REGION_TITLE: Record<Region, string> = { in: "Imported by", center: "Changed files", out: "Imports" };

const EDGE_STYLE = {
  same: { stroke: "var(--plc-border-strong)", width: 1.1, marker: "same" },
  added: { stroke: "var(--plc-success)", width: 2, marker: "added" },
  removed: { stroke: "var(--plc-error)", width: 2, marker: "removed" },
  mixed: { stroke: "var(--plc-warning)", width: 1.6, marker: "mixed" },
} as const;

function edgePath(e: PositionedEdge): string {
  return e.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

const STATUS_STROKE = {
  added: "var(--plc-success)",
  removed: "var(--plc-error)",
  modified: "var(--plc-warning)",
  renamed: "var(--plc-accent)",
} as const;

/** Status mark drawn in SVG (HTML icons clip inside foreignObject at zoom). */
function StatusGlyph(props: { status: keyof typeof STATUS_STROKE; x: number; y: number }) {
  const c = () => STATUS_STROKE[props.status];
  return (
    <g transform={`translate(${props.x},${props.y})`} aria-label={STATUS_LABEL[props.status]}>
      <Show when={props.status === "modified"}>
        <circle r="3" fill={c()} />
      </Show>
      <Show when={props.status === "added" || props.status === "removed"}>
        <path d="M-4,0H4" stroke={c()} stroke-width="1.8" stroke-linecap="round" />
      </Show>
      <Show when={props.status === "added"}>
        <path d="M0,-4V4" stroke={c()} stroke-width="1.8" stroke-linecap="round" />
      </Show>
      <Show when={props.status === "renamed"}>
        <path d="M-4,0H4M1,-3L4,0L1,3" fill="none" stroke={c()} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </Show>
    </g>
  );
}

/** Right-aligned "● 2  ● 1" counts of metrics worse / better, in SVG. */
function HealthGlyph(props: { worse: number; better: number; x: number; y: number }) {
  return (
    <g transform={`translate(${props.x},${props.y})`} class="font-mono text-[10.5px]">
      <Show when={props.better}>
        <circle cx="-14" cy="0" r="2.5" fill="var(--plc-success)" />
        <text x="0" y="3.5" text-anchor="end" fill="var(--plc-success)">{props.better}</text>
      </Show>
      <Show when={props.worse}>
        <circle cx={props.better ? -36 : -14} cy="0" r="2.5" fill="var(--plc-error)" />
        <text x={props.better ? -22 : 0} y="3.5" text-anchor="end" fill="var(--plc-error)">{props.worse}</text>
      </Show>
    </g>
  );
}

function Pane(props: {
  side: Side;
  label: string;
  model: CompareGraphModel;
  layout: ViewLayout;
  selected: string | null;
  hovered: string | null;
  onHover: (id: string | null, e?: MouseEvent) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string, side: Side) => void;
  bindZoom: (side: Side, svg: SVGSVGElement, g: SVGGElement) => void;
}) {
  let svg!: SVGSVGElement;
  let g!: SVGGElement;
  onMount(() => props.bindZoom(props.side, svg, g));

  const visible = (id: string) => {
    const p = props.model.nodePresence.get(id);
    return p === "both" || p === props.side;
  };
  const hoverEdges = createMemo(() => {
    const h = props.hovered;
    if (!h) return null;
    return new Set(props.layout.edges.filter((e) => e.source === h || e.target === h).map((e) => e.id));
  });
  const headers = createMemo(() => {
    const out: { region: Region; x: number; y: number; width: number }[] = [];
    if (!props.layout.nodes.length) return out;
    const top = Math.min(...props.layout.nodes.map((n) => n.y));
    for (const region of ["in", "center", "out"] as Region[]) {
      const ns = props.layout.nodes.filter((n) => n.node.region === region);
      if (!ns.length) continue;
      const x0 = Math.min(...ns.map((n) => n.x));
      const x1 = Math.max(...ns.map((n) => n.x + n.width));
      out.push({ region, x: x0, y: top - 14, width: x1 - x0 });
    }
    return out;
  });

  const nodeLabel = (n: PositionedNode, room: number) => truncateTextToWidth(n.node.label, room, FONT);

  return (
    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-subtle)]">
      <div class="pointer-events-none absolute left-3 top-2 z-10 flex items-baseline gap-2">
        <span class="plc-label-caps text-[var(--plc-on-subtle)]">{props.side === "base" ? "Before" : "After"}</span>
        <span class="plc-data-sm text-[var(--plc-on-muted)]">{props.label}</span>
      </div>
      <svg ref={svg} class="compare-graph-pane h-full w-full cursor-grab select-none active:cursor-grabbing">
        <defs>
          <For each={Object.entries(EDGE_STYLE)}>
            {([name, s]) => (
              <marker
                id={`cg-${props.side}-${name}`}
                viewBox="0 0 8 8"
                refX="7.5"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M0,0.8 L7.5,4 L0,7.2 z" fill={s.stroke} />
              </marker>
            )}
          </For>
        </defs>
        <g ref={g}>
          <For each={headers()}>
            {(h) => (
              <text
                x={h.x + h.width / 2}
                y={h.y}
                text-anchor="middle"
                class="fill-[var(--plc-on-subtle)] text-[10px] font-semibold uppercase tracking-[0.08em]"
              >
                {REGION_TITLE[h.region]}
              </text>
            )}
          </For>
          <For each={props.layout.edges}>
            {(e) => {
              const state = () => edgeStateOn(props.model.edgeCounts.get(e.id)!, props.side);
              const style = () => (state() === "hidden" ? null : EDGE_STYLE[state() as keyof typeof EDGE_STYLE]);
              const dim = () => hoverEdges() !== null && !hoverEdges()!.has(e.id);
              return (
                <Show when={style()}>
                  {(s) => (
                    <path
                      d={edgePath(e)}
                      fill="none"
                      stroke={s().stroke}
                      stroke-width={s().width}
                      stroke-linejoin="round"
                      opacity={dim() ? 0.15 : e.edge.faint && state() === "same" ? 0.55 : 1}
                      marker-end={`url(#cg-${props.side}-${s().marker})`}
                      class="transition-opacity duration-150"
                    />
                  )}
                </Show>
              );
            }}
          </For>
          <For each={props.layout.nodes}>
            {(n) => {
              const shown = () => visible(n.id);
              const change = () => props.model.changeByNode.get(n.id);
              const isCenter = n.node.region === "center";
              const isSelected = () => Boolean(change() && change()!.path === props.selected);
              const health = () => (change() && props.side === "head" ? fileHealth(change()!.deltas) : null);
              const leaf = n.node.kind === "file" || n.node.kind === "external";
              const countW = n.node.memberCount > 1 && !n.node.subtitle ? 26 : 0;
              const healthW = () => (health() && (health()!.worse.length || health()!.better.length) ? 46 : 0);
              const iconW = isCenter && change() ? 16 : 0;
              const room = () => n.width - 16 - countW - healthW() - iconW;
              // Vertical middle of the first line (the whole box when there is no subtitle).
              const mid = n.node.subtitle ? 12 : n.height / 2;
              return (
                <g
                  transform={`translate(${n.x},${n.y})`}
                  class="cursor-pointer"
                  opacity={shown() ? 1 : 0.55}
                  onMouseMove={(ev) => props.onHover(n.id, ev)}
                  onMouseLeave={() => props.onHover(null)}
                  onClick={() => change() && props.onSelect(change()!.path)}
                  onDblClick={() => leaf && n.node.kind === "file" && props.onOpen(change()?.path ?? n.node.graphId, props.side)}
                >
                  <rect
                    width={n.width}
                    height={n.height}
                    rx="4"
                    fill={!shown() ? "transparent" : isCenter ? "var(--plc-surface)" : "var(--plc-surface-muted)"}
                    stroke={
                      isSelected()
                        ? "var(--plc-accent)"
                        : props.hovered === n.id
                          ? "var(--plc-on-muted)"
                          : isCenter
                            ? "var(--plc-border-strong)"
                            : "var(--plc-border)"
                    }
                    stroke-width={isSelected() ? 2 : 1}
                    stroke-dasharray={shown() ? undefined : "4 3"}
                  />
                  <Show when={iconW}>
                    <StatusGlyph status={change()!.status} x={13} y={mid} />
                  </Show>
                  <text
                    x={8 + iconW}
                    y={mid + 4}
                    class={cx(
                      "text-[12px] font-medium",
                      !shown() ? "fill-[var(--plc-on-disabled)]" : isCenter ? "fill-[var(--plc-on-surface)]" : "fill-[var(--plc-on-muted)]",
                      n.node.graphId.startsWith("usedby:") && "italic"
                    )}
                    text-decoration={shown() ? undefined : "line-through"}
                  >
                    {nodeLabel(n, room())}
                  </text>
                  <Show when={n.node.subtitle}>
                    <text x={8 + iconW} y={30} class="fill-[var(--plc-on-subtle)] text-[11px]">
                      {truncateTextToWidth(n.node.subtitle!, room(), SUBTITLE_FONT)}
                    </text>
                  </Show>
                  <Show when={countW}>
                    <text
                      x={n.width - 8 - healthW()}
                      y={mid + 4}
                      text-anchor="end"
                      class="fill-[var(--plc-on-subtle)] font-mono text-[11px]"
                    >
                      {n.node.memberCount}
                    </text>
                  </Show>
                  <Show when={healthW() && shown()}>
                    <HealthGlyph
                      worse={health()!.worse.length}
                      better={health()!.better.length}
                      x={n.width - 8}
                      y={mid}
                    />
                  </Show>
                </g>
              );
            }}
          </For>
        </g>
      </svg>
    </div>
  );
}

function HoverCard(props: { model: CompareGraphModel; layout: ViewLayout; id: string; x: number; y: number }) {
  const n = () => props.layout.nodes.find((x) => x.id === props.id)!;
  const change = () => props.model.changeByNode.get(props.id);
  const edges = () => props.layout.edges.filter((e) => e.source === props.id || e.target === props.id);
  const tally = () => {
    const t = { added: 0, removed: 0, same: 0 };
    for (const e of edges()) {
      const c = props.model.edgeCounts.get(e.id)!;
      t.added += c.head;
      t.removed += c.base;
      t.same += c.both;
    }
    return t;
  };
  const presence = () => props.model.nodePresence.get(props.id);
  return (
    <div
      class="plc-floating pointer-events-none fixed z-50 w-80 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        left: `${props.x + 330 > window.innerWidth ? props.x - 332 : props.x + 14}px`,
        top: `${props.y + 150 > window.innerHeight ? props.y - 140 : props.y + 14}px`,
      }}
    >
      <Show when={change()}>
        {(c) => (
          <div class="mb-1 flex items-center gap-1.5">
            <StatusIcon status={c().status} />
            <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--plc-on-muted)]">{STATUS_LABEL[c().status]}</span>
            <span class="ml-auto">
              <DiffStat additions={c().additions} deletions={c().deletions} blocks={false} />
            </span>
          </div>
        )}
      </Show>
      <div class="plc-data-sm break-all text-[var(--plc-on-surface)]">{n()?.node.title}</div>
      <Show when={n()?.node.memberCount > 1}>
        <div class="mt-0.5 text-[11px] text-[var(--plc-on-subtle)]">{n()!.node.memberCount} files rolled up</div>
      </Show>
      <div class="mt-1.5 flex gap-3">
        <span class="text-[var(--plc-success)]">+{tally().added} imports</span>
        <span class="text-[var(--plc-error)]">−{tally().removed}</span>
        <span class="text-[var(--plc-on-subtle)]">{tally().same} unchanged</span>
      </div>
      <Show when={presence() !== "both"}>
        <div class="mt-1 text-[11px] text-[var(--plc-on-subtle)]">Only {presence() === "base" ? "before" : "after"} the change</div>
      </Show>
    </div>
  );
}

/**
 * Before and after dependency graphs on one layout: changed files in the
 * center, importers left, imports right. Each pane draws only what exists on
 * its side; added imports are green on the right, removed ones red on the left.
 */
export function CompareGraph(props: {
  payload: ComparePayload;
  selected: string | null;
  onSelect: (path: string) => void;
  onOpenFile: (path: string, side: Side) => void;
}) {
  const [showExternal, setShowExternal] = createSignal(false);
  const [showTests, setShowTests] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [hover, setHover] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  let container: HTMLDivElement | undefined;

  const model = createMemo(() =>
    buildCompareGraph(props.payload, { ...DEFAULT_GRAPH_OPTIONS, showExternal: showExternal(), showTests: showTests() })
  );
  const layout = createMemo(() => {
    const { width, height } = size();
    if (!width || !height) return null;
    return layoutViewSync(model().vm, { aspectRatio: width / height, viewport: { width, height } });
  });

  // Linked pan/zoom: whichever pane the user moves, the other follows.
  const panes = new Map<Side, { svg: SVGSVGElement; g: SVGGElement; zoom: d3.ZoomBehavior<SVGSVGElement, unknown> }>();
  let syncing = false;
  const bindZoom = (side: Side, svg: SVGSVGElement, g: SVGGElement) => {
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (ev) => {
        g.setAttribute("transform", ev.transform.toString());
        if (syncing) return;
        syncing = true;
        for (const [other, p] of panes) if (other !== side) d3.select(p.svg).call(p.zoom.transform, ev.transform);
        syncing = false;
      });
    d3.select(svg).call(zoom).on("dblclick.zoom", null);
    panes.set(side, { svg, g, zoom });
  };
  const fit = () => {
    const l = layout();
    const first = panes.get("base");
    if (!l || !first) return;
    const { width, height } = first.svg.getBoundingClientRect();
    const b = boundsOf(l.nodes, l.edges);
    if (!b.width || !width) return;
    const m = 28;
    const scale = Math.min(1.25, (width - m * 2) / b.width, (height - m * 2 - 24) / b.height);
    const t = d3.zoomIdentity
      // Centered across, anchored near the top so the eye starts at the column headers.
      .translate((width - b.width * scale) / 2 - b.x * scale, m + 28 - b.y * scale)
      .scale(scale);
    d3.select(first.svg).call(first.zoom.transform, t);
  };
  createEffect(() => {
    void layout();
    void expanded();
    queueMicrotask(fit);
  });

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(0, Math.floor((width - 12) / 2)), height: Math.max(0, Math.floor(height)) });
    });
    if (container) observer.observe(container);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    });
  });

  const stats = createMemo(() => {
    const m = model();
    const center = m.vm.nodes.filter((n) => n.region === "center").length;
    return { center, neighbors: m.vm.nodes.length - center };
  });

  return (
    <div class={cx("flex min-h-0 flex-col bg-[var(--plc-surface)]", expanded() ? "fixed inset-0 z-40" : "h-full")}>
      <div class="plc-toolbar flex shrink-0 items-center gap-4 border-b px-3">
        <span class="text-xs text-[var(--plc-on-muted)]">
          {stats().center} changed · {stats().neighbors} neighbors
          <Show when={model().hubbed}>
            <span class="text-[var(--plc-on-subtle)]"> · {model().hubbed} importers folded into "used by"</span>
          </Show>
        </span>
        <span class="flex items-center gap-3 text-[11px] text-[var(--plc-on-subtle)]">
          <span class="flex items-center gap-1">
            <span class="h-0.5 w-4 rounded bg-[var(--plc-success)]" />
            added import
          </span>
          <span class="flex items-center gap-1">
            <span class="h-0.5 w-4 rounded bg-[var(--plc-error)]" />
            removed import
          </span>
          <span class="flex items-center gap-1">
            <span class="h-3 w-4 rounded-sm border border-dashed border-[var(--plc-border-strong)]" />
            not on this side
          </span>
        </span>
        <div class="ml-auto flex items-center gap-3">
          <CheckboxRow label="Packages" checked={showExternal()} onChange={setShowExternal} />
          <CheckboxRow label="Unchanged tests" checked={showTests()} onChange={setShowTests} />
          <Button variant="ghost" size="sm" class="gap-1.5" onClick={fit}>
            <Scan size={13} aria-hidden="true" />
            Fit
          </Button>
          <Button variant="ghost" size="sm" class="gap-1.5" onClick={() => setExpanded(!expanded())}>
            <Show when={expanded()} fallback={<Maximize2 size={13} aria-hidden="true" />}>
              <Minimize2 size={13} aria-hidden="true" />
            </Show>
            {expanded() ? "Exit full view" : "Expand"}
          </Button>
        </div>
      </div>
      <div ref={container} class="flex min-h-0 flex-1 gap-3 p-3">
        <Show
          when={model().vm.nodes.length}
          fallback={<p class="m-auto text-sm text-[var(--plc-on-subtle)]">None of the changed files are in the dependency graph.</p>}
        >
          <Show when={layout()}>
            {(l) => (
              <For each={["base", "head"] as Side[]}>
                {(side) => (
                  <Pane
                    side={side}
                    label={side === "base" ? props.payload.base.label : props.payload.head.label}
                    model={model()}
                    layout={l()}
                    selected={props.selected}
                    hovered={hover()?.id ?? null}
                    onHover={(id, e) => setHover(id && e ? { id, x: e.clientX, y: e.clientY } : null)}
                    onSelect={props.onSelect}
                    onOpen={props.onOpenFile}
                    bindZoom={bindZoom}
                  />
                )}
              </For>
            )}
          </Show>
        </Show>
      </div>
      <Show when={hover() && layout()}>
        <HoverCard model={model()} layout={layout()!} id={hover()!.id} x={hover()!.x} y={hover()!.y} />
      </Show>
    </div>
  );
}
