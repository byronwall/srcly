import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import * as d3 from "d3";
import { isSameOrAncestor, linkedPathFor, setHoverFrom } from "../../utils/hoverLink";
import type { Node } from "../../components/Explorer";
import {
  QUADRANT_IDS,
  assignQuadrant,
  axisMax,
  forward,
  formatAxisValue,
  inverse,
  logTicks,
  snapCutoff,
  type QuadrantAxis,
  type QuadrantId,
  type QuadrantPreset,
  type ScatterPoint,
} from "./quadrants";
import { QUADRANT_COLORS, withUnit } from "./scatterStyle";

type Point = ScatterPoint<Node>;
type Cut = { x: number; y: number };

const MARGIN = { top: 10, right: 14, bottom: 34, left: 48 };
const POINT_R = 3.5;
/** Pixels between log ticks before one is dropped. */
const TICK_GAP = 26;

/**
 * The 2x2 plot: tinted quadrant fields with their names and counts, points
 * colored by quadrant, and two dashed cut-off lines you can drag. Hovering
 * a point shows its card and lights it in the explorer; clicking opens it;
 * clicking empty space picks that quadrant.
 */
export default function ScatterPlot(props: {
  preset: QuadrantPreset;
  points: Point[];
  counts: Record<QuadrantId, number>;
  cut: Cut;
  onCutChange: (next: Cut) => void;
  selected: QuadrantId;
  onSelect: (id: QuadrantId) => void;
  onOpen: (point: Point) => void;
  /** Shown over empty axes when the preset's data source is missing. */
  unavailable: string;
  /** Shown top-left while a data source loads. */
  loading?: string;
  rootPath: string;
}) {
  let boxRef: HTMLDivElement | undefined;
  let svgRef: SVGSVGElement | undefined;
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  onMount(() => {
    if (!boxRef) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(boxRef);
    onCleanup(() => observer.disconnect());
  });
  const inner = () => ({
    width: Math.max(0, size().width - MARGIN.left - MARGIN.right),
    height: Math.max(0, size().height - MARGIN.top - MARGIN.bottom),
  });

  // Extents follow the data and the default cut-off, never the dragged one, so a drag can't rescale under the pointer.
  const xScale = createMemo(() => {
    const max = axisMax(props.points.map((p) => p.x), props.preset.x.cutoff);
    return d3.scaleLinear().domain([0, forward(props.preset.x.scale, max)]).range([0, inner().width]).nice();
  });
  const yScale = createMemo(() => {
    const max = axisMax(props.points.map((p) => p.y), props.preset.y.cutoff);
    return d3.scaleLinear().domain([0, forward(props.preset.y.scale, max)]).range([inner().height, 0]).nice();
  });
  const px = (v: number) => xScale()(forward(props.preset.x.scale, v));
  const py = (v: number) => yScale()(forward(props.preset.y.scale, v));
  const cutPx = () => ({ x: px(props.cut.x), y: py(props.cut.y) });
  const quadrantOf = (p: Point) => assignQuadrant(p.x, p.y, props.cut.x, props.cut.y);
  const nameOf = (id: QuadrantId) => props.preset.quadrants.find((q) => q.id === id)?.name ?? id;

  const ticks = (axis: QuadrantAxis, scale: d3.ScaleLinear<number, number>, room: number) => {
    const max = inverse(axis.scale, scale.domain()[1]);
    const values = axis.scale === "log" ? logTicks(max) : scale.ticks(Math.max(2, Math.floor(room / 70)));
    const out: number[] = [];
    let last = -Infinity;
    for (const v of values) {
      const at = Math.abs(scale(forward(axis.scale, v)));
      if (Math.abs(at - last) < TICK_GAP) continue;
      out.push(v);
      last = at;
    }
    return out;
  };
  const xTicks = createMemo(() => ticks(props.preset.x, xScale(), inner().width));
  const yTicks = createMemo(() => ticks(props.preset.y, yScale(), inner().height));

  const regions = createMemo(() => {
    const { width, height } = inner();
    const { x, y } = cutPx();
    return {
      high_y: { x: 0, y: 0, w: x, h: y },
      high_both: { x, y: 0, w: width - x, h: y },
      low_both: { x: 0, y, w: x, h: height - y },
      high_x: { x, y, w: width - x, h: height - y },
    } satisfies Record<QuadrantId, { x: number; y: number; w: number; h: number }>;
  });

  // --- Hover and explorer linking ----------------------------------------------------
  const quadtree = createMemo(() =>
    d3.quadtree<Point>().x((p) => px(p.x)).y((p) => py(p.y)).addAll(inner().width > 0 ? props.points : [])
  );
  const [hover, setHover] = createSignal<Point | null>(null);
  const linkedPoints = createMemo(() => {
    const target = linkedPathFor("treemap");
    if (!target) return [];
    return props.points.filter((p) => isSameOrAncestor(target, p.node.path) || isSameOrAncestor(p.node.path, target));
  });
  const clearHover = () => {
    setHover(null);
    setHoverFrom("treemap", null);
  };
  onCleanup(() => setHoverFrom("treemap", null));

  const local = (e: PointerEvent | MouseEvent) => {
    const rect = svgRef!.getBoundingClientRect();
    return { x: e.clientX - rect.left - MARGIN.left, y: e.clientY - rect.top - MARGIN.top };
  };

  // --- Dragging cut-offs ----------------------------------------------------------------
  let drag: { axis: "x" | "y"; pointerId: number } | null = null;
  /** A drag ends with a click; that click mustn't pick a quadrant. */
  let swallowClick = false;
  const startDrag = (axis: "x" | "y") => (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    drag = { axis, pointerId: e.pointerId };
    svgRef?.setPointerCapture(e.pointerId);
    clearHover();
  };
  const endDrag = () => {
    if (!drag) return;
    svgRef?.releasePointerCapture(drag.pointerId);
    drag = null;
    swallowClick = true;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!svgRef) return;
    const at = local(e);
    if (drag) {
      const axis = drag.axis === "x" ? props.preset.x : props.preset.y;
      const scale = drag.axis === "x" ? xScale() : yScale();
      const value = snapCutoff(axis, inverse(axis.scale, scale.invert(drag.axis === "x" ? at.x : at.y)));
      props.onCutChange({ ...props.cut, [drag.axis]: value });
      return;
    }
    const found = quadtree().find(at.x, at.y, 10) ?? null;
    setHover(found);
    setHoverFrom("treemap", found?.node.path ?? null);
  };

  const onClick = (e: MouseEvent) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    const found = hover();
    if (found) return props.onOpen(found);
    const at = local(e);
    if (at.x < 0 || at.y < 0 || at.x > inner().width || at.y > inner().height) return;
    const { x, y } = cutPx();
    props.onSelect(at.x >= x ? (at.y <= y ? "high_both" : "high_x") : at.y <= y ? "high_y" : "low_both");
  };

  const axisTitle = (axis: QuadrantAxis) => ` · ${axis.unit}${axis.scale === "log" ? ", log" : ""} →`;

  return (
    <div ref={boxRef} class="relative min-h-[240px] min-w-0 flex-1 overflow-hidden">
      <Show when={size().width > 0}>
        <svg
          ref={svgRef}
          width={size().width}
          height={size().height}
          class="block select-none"
          role="img"
          aria-label={`${props.preset.label}: ${props.preset.x.label} by ${props.preset.y.label}`}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => !drag && clearHover()}
          onClick={onClick}
          style={{ cursor: hover() ? "pointer" : "default" }}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* Quadrant fields: the selected one is tinted a little more. */}
            <For each={QUADRANT_IDS}>
              {(id) => (
                <rect
                  x={regions()[id].x}
                  y={regions()[id].y}
                  width={Math.max(0, regions()[id].w)}
                  height={Math.max(0, regions()[id].h)}
                  fill={QUADRANT_COLORS[id]}
                  fill-opacity={props.selected === id ? 0.07 : 0.025}
                />
              )}
            </For>

            <For each={xTicks()}>
              {(v) => (
                <g transform={`translate(${px(v)},0)`}>
                  <line y1={0} y2={inner().height} stroke="var(--plc-divider)" />
                  <text y={inner().height + 13} text-anchor="middle" class="fill-[var(--plc-on-subtle)] text-[10px] tabular-nums">
                    {formatAxisValue(props.preset.x, v)}
                  </text>
                </g>
              )}
            </For>
            <For each={yTicks()}>
              {(v) => (
                <g transform={`translate(0,${py(v)})`}>
                  <line x1={0} x2={inner().width} stroke="var(--plc-divider)" />
                  <text x={-6} dy="0.32em" text-anchor="end" class="fill-[var(--plc-on-subtle)] text-[10px] tabular-nums">
                    {formatAxisValue(props.preset.y, v)}
                  </text>
                </g>
              )}
            </For>
            <rect width={inner().width} height={inner().height} fill="none" stroke="var(--plc-border-strong)" />
            <text x={inner().width} y={inner().height + 28} text-anchor="end" class="fill-[var(--plc-on-muted)] text-[11px] font-semibold">
              {props.preset.x.label}
              <tspan class="fill-[var(--plc-on-subtle)] font-normal">{axisTitle(props.preset.x)}</tspan>
            </text>
            <text transform="translate(-36,0) rotate(-90)" text-anchor="end" class="fill-[var(--plc-on-muted)] text-[11px] font-semibold">
              {props.preset.y.label}
              <tspan class="fill-[var(--plc-on-subtle)] font-normal">{axisTitle(props.preset.y)}</tspan>
            </text>

            {/* Quadrant names + counts in each field's outer corner */}
            <Show when={!props.unavailable}>
              <For each={QUADRANT_IDS}>
                {(id) => {
                  const right = id === "high_both" || id === "high_x";
                  const top = id === "high_both" || id === "high_y";
                  const r = () => regions()[id];
                  return (
                    <Show when={r().w > 60 && r().h > 22}>
                      <text
                        x={right ? r().x + r().w - 6 : r().x + 6}
                        y={top ? r().y + 15 : r().y + r().h - 7}
                        text-anchor={right ? "end" : "start"}
                        class="text-[11px] font-semibold"
                        fill={QUADRANT_COLORS[id]}
                        style={{ "paint-order": "stroke", stroke: "var(--plc-surface)", "stroke-width": "3px" }}
                      >
                        {nameOf(id)}
                        <tspan class="font-normal tabular-nums" fill="var(--plc-on-subtle)">{`  ${props.counts[id].toLocaleString("en-US")}`}</tspan>
                      </text>
                    </Show>
                  );
                }}
              </For>
            </Show>

            {/* Points: the selected quadrant at full strength, the rest faded */}
            <g>
              <For each={props.points}>
                {(p) => (
                  <circle
                    cx={px(p.x)}
                    cy={py(p.y)}
                    r={POINT_R}
                    fill={QUADRANT_COLORS[quadrantOf(p)]}
                    fill-opacity={quadrantOf(p) === props.selected ? 0.75 : 0.3}
                    stroke="var(--plc-surface)"
                    stroke-width={0.75}
                  />
                )}
              </For>
            </g>
            <For each={linkedPoints()}>
              {(p) => <circle cx={px(p.x)} cy={py(p.y)} r={POINT_R + 3} fill="none" stroke="var(--plc-accent)" stroke-width={2} />}
            </For>
            <Show when={hover()}>
              {(h) => <circle cx={px(h().x)} cy={py(h().y)} r={POINT_R + 3} fill="none" stroke="var(--plc-on-surface)" stroke-width={1.5} />}
            </Show>

            {/* Cut-offs: dashed lines, a wide grab area, and a value tag on the axis */}
            <g class="text-[10px]">
              <line x1={cutPx().x} x2={cutPx().x} y1={0} y2={inner().height} stroke="var(--plc-on-muted)" stroke-dasharray="4 3" />
              <rect x={cutPx().x - 5} width={10} height={inner().height} fill="transparent" class="cursor-col-resize" onPointerDown={startDrag("x")}>
                <title>Drag to move the {props.preset.x.label} cut-off</title>
              </rect>
              <g transform={`translate(${cutPx().x},${inner().height})`} class="cursor-col-resize" onPointerDown={startDrag("x")}>
                <rect x={-22} y={2} width={44} height={14} rx={3} fill="var(--plc-on-surface)" />
                <text y={12} text-anchor="middle" fill="var(--plc-surface)" class="font-semibold tabular-nums">
                  {formatAxisValue(props.preset.x, props.cut.x)}
                </text>
              </g>
              <line x1={0} x2={inner().width} y1={cutPx().y} y2={cutPx().y} stroke="var(--plc-on-muted)" stroke-dasharray="4 3" />
              <rect y={cutPx().y - 5} width={inner().width} height={10} fill="transparent" class="cursor-row-resize" onPointerDown={startDrag("y")}>
                <title>Drag to move the {props.preset.y.label} cut-off</title>
              </rect>
              <g transform={`translate(0,${cutPx().y})`} class="cursor-row-resize" onPointerDown={startDrag("y")}>
                <rect x={-46} y={-7} width={42} height={14} rx={3} fill="var(--plc-on-surface)" />
                <text x={-25} y={3.5} text-anchor="middle" fill="var(--plc-surface)" class="font-semibold tabular-nums">
                  {formatAxisValue(props.preset.y, props.cut.y)}
                </text>
              </g>
            </g>
          </g>
        </svg>
      </Show>

      <Show when={props.unavailable}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="plc-panel max-w-sm rounded-md border px-3 py-2 text-center">
            <div class="plc-body-sm font-semibold text-[var(--plc-on-surface)]">{props.unavailable}</div>
            <div class="plc-data-sm mt-0.5 text-[var(--plc-on-subtle)]">
              {props.preset.label}: {props.preset.description}
            </div>
          </div>
        </div>
      </Show>
      <Show when={props.loading}>
        <div class="plc-data-sm pointer-events-none absolute left-14 top-3 text-[var(--plc-on-subtle)]">{props.loading}</div>
      </Show>

      <Show when={hover()}>
        {(h) => {
          const left = () => px(h().x) + MARGIN.left;
          const top = () => py(h().y) + MARGIN.top;
          const flip = () => left() > size().width - 260;
          return (
            <div
              class="plc-floating pointer-events-none absolute z-30 w-60 rounded-md border px-2.5 py-1.5 text-xs"
              style={{ left: `${flip() ? left() - 252 : left() + 12}px`, top: `${Math.min(top() + 12, size().height - 96)}px` }}
            >
              <div class="truncate font-semibold text-[var(--plc-on-surface)]">{h().node.name}</div>
              <div class="plc-data-sm truncate text-[var(--plc-on-subtle)]">{h().node.path.replace(`${props.rootPath}/`, "")}</div>
              <div class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 tabular-nums">
                <span class="text-[var(--plc-on-subtle)]">{props.preset.x.label}</span>
                <span class="text-right text-[var(--plc-on-surface)]">{withUnit(props.preset.x, h().x)}</span>
                <span class="text-[var(--plc-on-subtle)]">{props.preset.y.label}</span>
                <span class="text-right text-[var(--plc-on-surface)]">{withUnit(props.preset.y, h().y)}</span>
              </div>
              <div class="mt-1 flex items-center gap-1.5 font-semibold" style={{ color: QUADRANT_COLORS[quadrantOf(h())] }}>
                <span class="inline-block h-2 w-2 rounded-full" style={{ background: QUADRANT_COLORS[quadrantOf(h())] }} />
                {nameOf(quadrantOf(h()))}
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
