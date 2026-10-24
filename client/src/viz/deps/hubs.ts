// Hubs: boxes that most of the view imports (`utils`, a shared store).
//
// Drawing every edge into a hub fills the screen with ink that says one
// thing: "everything uses this". A hub instead gets a shape badge;
// each importer repeats the badge, and the edges show only while the hub (or
// one of its badges) is hovered. Edges touching the focus always stay drawn.

import { layoutViewSync, type LayoutOptions, type ViewLayout } from "./layout";
import type { ViewModel } from "./viewModel";

export type HubShape = "diamond" | "circle" | "triangle" | "square";

export interface Hub {
  /** View node id of the hub box. */
  id: string;
  shape: HubShape;
  color: string;
  /** Distinct boxes whose edges into the hub are hidden. */
  importers: number;
}

/** One distinct hue per badge, clear of the treemap's blue → amber → red ramp. */
/**
 * Hubs differ by shape, all in one ink: hue on the canvas belongs to the
 * metric ramp (fills, bars, strips) and to blue for focus and hover. Only one
 * hub's edges show at a time, so a hue per hub isn't needed to match them.
 */
const HUB_INK = "#64748b";
export const HUB_STYLES: { shape: HubShape; color: string }[] = [
  { shape: "diamond", color: HUB_INK },
  { shape: "circle", color: HUB_INK },
  { shape: "triangle", color: HUB_INK },
  { shape: "square", color: HUB_INK },
];

/** A hub needs at least this many importers … */
export const HUB_MIN_IMPORTERS = 5;
/** … and either this share of the other boxes … */
export const HUB_MIN_SHARE = 0.3;
/** … or a place among this many targets drawing the most edge ink. */
export const HUB_TOP_INK = 3;
export const MAX_HUBS = HUB_STYLES.length;

const length = (pts: { x: number; y: number }[]) =>
  pts.reduce((a, p, i) => (i ? a + Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0), 0);

/**
 * Pick hubs from a laid-out view. Only edges between two non-focus boxes can
 * collapse into a badge; the focus box is never a hub.
 */
export function pickHubs(vm: ViewModel, layout: Pick<ViewLayout, "edges">): Hub[] {
  const focus = new Set(vm.nodes.filter((n) => n.isFocus).map((n) => n.id));
  const importers = new Map<string, Set<string>>();
  const ink = new Map<string, number>();
  const routed = new Map(layout.edges.map((e) => [e.id, e]));
  for (const e of vm.edges) {
    if (focus.has(e.source) || focus.has(e.target) || e.source === e.target) continue;
    importers.set(e.target, (importers.get(e.target) ?? new Set()).add(e.source));
    ink.set(e.target, (ink.get(e.target) ?? 0) + length(routed.get(e.id)?.points ?? []));
  }
  const others = Math.max(1, vm.nodes.length - 1);
  const candidates = [...importers]
    .filter(([, srcs]) => srcs.size >= HUB_MIN_IMPORTERS)
    .sort((a, b) => (ink.get(b[0]) ?? 0) - (ink.get(a[0]) ?? 0) || b[1].size - a[1].size || a[0].localeCompare(b[0]));
  return candidates
    .filter(([, srcs], rank) => srcs.size / others >= HUB_MIN_SHARE || rank < HUB_TOP_INK)
    .slice(0, MAX_HUBS)
    .map(([id, srcs], i) => ({ id, importers: srcs.size, ...HUB_STYLES[i] }));
}

/** Edge ids that collapse into badges for these hubs. */
export function hubEdgeIds(vm: ViewModel, hubs: Hub[]): Set<string> {
  const hubIds = new Set(hubs.map((h) => h.id));
  const focus = new Set(vm.nodes.filter((n) => n.isFocus).map((n) => n.id));
  return new Set(vm.edges.filter((e) => hubIds.has(e.target) && !focus.has(e.source)).map((e) => e.id));
}

/**
 * Lay the view out once to measure edge ink, pick hubs, and lay it out
 * again with hub edges hidden so they free their channel room.
 */
export function layoutWithHubs(vm: ViewModel, opts: LayoutOptions): ViewLayout {
  const first = layoutViewSync(vm, opts);
  const hubs = pickHubs(vm, first);
  if (hubs.length === 0) return { ...first, hubs };
  // Edges the caller already hides (Data flow mode's containment edges) stay hidden.
  const hidden = new Set([...(opts.hidden ?? []), ...hubEdgeIds(vm, hubs)]);
  return { ...layoutViewSync(vm, { ...opts, hidden }), hubs };
}
