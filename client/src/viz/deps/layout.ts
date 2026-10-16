import { boundsOf, type Box, type Point, type Polyline } from "./geometry";
import type { Hub } from "./hubs";
import type { Region, ViewEdge, ViewModel, ViewNode } from "./viewModel";

// Grid + channel layout.
//
// Boxes sit in a global grid of columns and rows (every box is the same size).
// Edges never enter a cell: they leave a box sideways into the vertical channel
// next to its column, run along the channel, and — when they need to cross
// other columns — travel through a horizontal gutter between rows. Rows are
// aligned across columns, so gutters are free from end to end. Edges heading
// to the same box share a track, which `bundleOffsets` spreads 1.25–1.75px
// apart; each track is as wide as its bundle, so busy trunks widen their
// channel instead of piling into one line.

/** Dependency view boxes: four rows of content, a little narrower than tall-and-thin. */
export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 74;
/** Box size for a layout; other views (compare) keep compact two-line boxes. */
export interface BoxSize {
  width: number;
  height: number;
}
export const DEFAULT_BOX: BoxSize = { width: NODE_WIDTH, height: NODE_HEIGHT };
/** The compare view's two-line boxes. */
export const COMPARE_BOX: BoxSize = { width: 196, height: 40 };
const TRACK = 6;
const CHANNEL_PAD = 10;
const MIN_CHANNEL = 36;
const GUTTER_PAD = 5;
const MIN_GUTTER = 10;
const PORT_SPLIT = 5;
const MARGIN = 16;
/** Frame padding around boxes, and the band above a frame's first box for its label. */
export const FRAME_PAD = 5;
export const FRAME_LABEL_H = 16;
/** Spacing between parallel edges inside a bundle, and the floor it shrinks to. */
const BUNDLE_GAP = 1.75;
const MIN_BUNDLE_GAP = 1.25;
/** A bundle stops widening here; past it, its edges pack closer (down to the floor). */
const MAX_BUNDLE_WIDTH = 36;

/** Gap between the edges of an `n`-edge bundle: wide enough to count, capped so a huge trunk stays a trunk. */
export function bundleGap(n: number): number {
  if (n <= 1) return 0;
  return Math.max(MIN_BUNDLE_GAP, Math.min(BUNDLE_GAP, MAX_BUNDLE_WIDTH / (n - 1)));
}

/** Room a track takes in its channel or gutter: its bundle's spread plus clearance to the next track. */
function trackWidth(n: number): number {
  return Math.max(TRACK, (n - 1) * bundleGap(n) + TRACK - 1);
}
/** The canvas never fits above this zoom, so extra width below it is free. */
export const MAX_SCALE = 1.25;

export interface PositionedNode extends Box {
  node: ViewNode;
  column: number;
  row: number;
}

export interface PositionedEdge extends Polyline {
  edge: ViewEdge;
}

export interface LayoutGroup {
  label: string;
  x: number;
  y: number;
}

/** A light labeled frame around a run of one package's boxes in a column. */
export interface GroupFrame {
  /** `${column}|${group id}|${first row}` */
  id: string;
  groupId: string;
  label: string;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
  /** Titles for separately laid-out connected components. */
  groups?: LayoutGroup[];
  /** Package frames around side neighbors. */
  frames?: GroupFrame[];
  /**
   * Edges into hubs: they order boxes like any edge but take no channel
   * room. The canvas draws them only while their hub is hovered.
   */
  hiddenEdges?: PositionedEdge[];
  /** Boxes most of the view imports, shown as badges instead of edges. */
  hubs?: Hub[];
}

export interface LayoutOptions {
  /** Viewport width / height, used to pack columns to the screen. */
  aspectRatio: number;
  /** Viewport size in px; defaults to 1600 wide at the given aspect ratio. */
  viewport?: { width: number; height: number };
  /** Size of every box; defaults to the dependency view's `DEFAULT_BOX`. */
  box?: BoxSize;
  /** Ids of edges that order boxes but are not routed (see `ViewLayout.hiddenEdges`). */
  hidden?: Set<string>;
}

type Side = "left" | "right";

interface Route {
  edge: ViewEdge;
  s: string;
  t: string;
  exitSide: Side;
  entrySide: Side;
  /** Channel indices: channel k sits left of column k (k = C is right of the last). */
  exitChannel: number;
  entryChannel: number;
  /** Gutter index (g sits above row g) when the edge must cross columns. */
  gutter: number | null;
  exitGroup: string;
  entryGroup: string;
  gutterGroup: string | null;
}

// ---------------------------------------------------------------------------
// Column assignment

/**
 * Longest-path depth inside one region. With `towardTarget` false a node is one
 * deeper than anything that imports it; with true, one deeper than anything it
 * imports.
 */
function sideDepths(nodes: ViewNode[], edges: ViewEdge[], towardTarget: boolean): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  // In a two-way dependency, only the heavier direction orders the layers;
  // a single lazy import back should not flip a whole folder.
  const weight = new Map(edges.map((e) => [`${e.source}->${e.target}`, e.weight]));
  const next = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    if ((weight.get(`${e.target}->${e.source}`) ?? 0) > e.weight) continue;
    const [from, to] = towardTarget ? [e.target, e.source] : [e.source, e.target];
    const arr = next.get(from) ?? [];
    arr.push(to);
    next.set(from, arr);
  }
  // depth(x) = 1 + max depth of nodes that must sit closer to the center.
  const prev = new Map<string, string[]>();
  for (const [from, tos] of next) for (const to of tos) prev.set(to, [...(prev.get(to) ?? []), from]);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // cycle: break it
    visiting.add(id);
    let d = 0;
    for (const p of prev.get(id) ?? []) d = Math.max(d, visit(p) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) visit(n.id);
  return depth;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Approximate grid pitch used to estimate a packing's on-screen size. */
const colPitch = (box: BoxSize) => box.width + MIN_CHANNEL + 12;
const rowPitch = (box: BoxSize) => box.height + MIN_GUTTER + 4;
/** Unfold steps tried per region, from fully folded (0) to one column per depth level (1). */
const UNFOLD_STEPS = [0, 0.25, 0.5, 0.75, 1];

/** Depth levels grouped into `k` runs of adjacent levels (k ≤ levels). */
function foldLevels<T>(levels: T[][], k: number): T[][] {
  if (levels.length === 0) return [];
  const groups: T[][] = Array.from({ length: k }, () => []);
  levels.forEach((l, i) => groups[Math.floor((i * k) / levels.length)].push(...l));
  return groups;
}

/** Fewest runs of levels that still fit in `rows` rows' worth of columns. */
function minFold(levelCounts: number[], rows: number): number {
  const n = levelCounts.reduce((a, b) => a + b, 0);
  return n === 0 ? 0 : Math.min(levelCounts.length, Math.max(1, Math.ceil(n / rows)));
}

export interface Packing {
  rows: number;
  /** Per region: how many runs of adjacent depth levels become column groups. */
  folds: number[];
  /** Estimated drawing size (px) and the zoom it fits the viewport at. */
  width: number;
  height: number;
  scale: number;
  /** Share of depth-level boundaries folded away (0 = one column group per level). */
  foldLoss: number;
  /** Some region with several depth levels is folded into a single column group. */
  collapsesFlow: boolean;
}

/**
 * How much a lost depth boundary costs against a shape off by e× (log scale).
 * Folding everything into one column must cost more than a 2× aspect miss.
 */
const FOLD_WEIGHT = 0.7;

/** Width:height within 0.5–2× the viewport's. */
export function inAspectBand(aspect: number, target: number): boolean {
  return Math.abs(Math.log(aspect / target)) <= Math.log(2);
}

/**
 * The aspect band is a hard limit, except where meeting it would stack a
 * region's whole multi-level flow into one column. A handful of one-line
 * boxes can be viewport-shaped only that way, and showing the flow is worth
 * more there than the shape: such views fit at full zoom regardless.
 */
function meetsBand(aspect: number, target: number, p: Pick<Packing, "collapsesFlow">): boolean {
  return inAspectBand(aspect, target) && !p.collapsesFlow;
}

/** Extra cost of stacking a whole multi-level region in one column: its flow disappears. */
const COLLAPSE_PENALTY = 1;

/** Lower is better: distance from the viewport's shape, plus the flow folded away. */
export function packingCost(aspect: number, target: number, p: Pick<Packing, "foldLoss" | "collapsesFlow">): number {
  return Math.abs(Math.log(aspect / target)) + FOLD_WEIGHT * p.foldLoss + (p.collapsesFlow ? COLLAPSE_PENALTY : 0);
}

/**
 * Rank row counts and per-region foldings of depth levels for a grid, best first.
 *
 * `levelCounts[r][d]` is the number of boxes at depth `d` of region `r`. Every
 * (rows, unfold) option is sized from those counts. Options that fit at nearly
 * the best readable zoom are all fine to read; among them the cost is how far
 * the shape is from the viewport's (log scale) — so a compact, centered block
 * beats a wide strip — plus a penalty for folding depth levels into shared
 * columns, which hides the left-to-right flow.
 */
export function rankPackings(
  levelCounts: number[][],
  viewport: { width: number; height: number },
  box: BoxSize = DEFAULT_BOX,
): Packing[] {
  const total = levelCounts.flat().reduce((a, b) => a + b, 0);
  const target = Math.max(0.3, viewport.width / Math.max(1, viewport.height));
  const boundaries = levelCounts.reduce((a, c) => a + Math.max(0, c.length - 1), 0);
  const options: (Packing & { cost: number })[] = [];
  for (let rows = 1; rows <= Math.max(1, total); rows++) {
    for (const t of UNFOLD_STEPS) {
      let cols = 0;
      let tallest = 0;
      let lost = 0;
      let collapsesFlow = false;
      const folds = levelCounts.map((counts) => {
        const lo = minFold(counts, rows);
        const k = Math.round(lo + t * (counts.length - lo));
        lost += counts.length - k;
        if (counts.length > 1 && k === 1) collapsesFlow = true;
        for (const g of foldLevels(counts.map((c) => [c]), k)) {
          const size = g.reduce((a, b) => a + b, 0);
          cols += Math.ceil(size / rows);
          tallest = Math.max(tallest, Math.min(rows, size));
        }
        return k;
      });
      const width = cols * colPitch(box) + 40;
      const height = tallest * rowPitch(box) + 40;
      const scale = Math.min(MAX_SCALE, viewport.width / width, viewport.height / height);
      const foldLoss = boundaries === 0 ? 0 : lost / boundaries;
      options.push({
        rows,
        folds,
        width,
        height,
        scale,
        foldLoss,
        collapsesFlow,
        cost: packingCost(width / height, target, { foldLoss, collapsesFlow }),
      });
    }
  }
  const bestScale = Math.max(...options.map((o) => o.scale));
  const readable = options.filter((o) => o.scale >= bestScale * 0.9);
  const tier = (o: Packing) => (meetsBand(o.width / o.height, target, o) ? 0 : 1);
  readable.sort((a, b) => tier(a) - tier(b) || a.cost - b.cost || a.rows - b.rows);
  // Options that differ only by empty rows produce the same grid; keep the first.
  const seen = new Set<string>();
  const out: Packing[] = [];
  for (const { cost: _cost, ...p } of readable) {
    const key = `${p.width}|${p.height}|${p.folds.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Track ordering inside one channel or gutter

interface TrackGroup {
  key: string;
  /** Span along the channel (y for channels, x for gutters). */
  lo: number;
  hi: number;
  /** Stub positions leaving toward the low side (left / up). */
  lowStubs: number[];
  /** Stub positions leaving toward the high side (right / down). */
  highStubs: number[];
}

/**
 * Order groups so stubs cross as few spans as possible. Group a placed before
 * b (nearer the low side) costs: a's high stubs inside b's span + b's low stubs
 * inside a's span.
 */
function orderGroups(groups: TrackGroup[]): TrackGroup[] {
  const n = groups.length;
  if (n < 2) return groups;
  const inside = (v: number, g: TrackGroup) => v > g.lo + 1e-6 && v < g.hi - 1e-6;
  const cost = (a: TrackGroup, b: TrackGroup) =>
    a.highStubs.filter((v) => inside(v, b)).length + b.lowStubs.filter((v) => inside(v, a)).length;
  const order = [...groups].sort((a, b) => a.lo + a.hi - (b.lo + b.hi) || a.key.localeCompare(b.key));
  // Adjacent swaps until no improvement (n is small: tens of groups at most).
  for (let pass = 0; pass < n * 2; pass++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      const a = order[i];
      const b = order[i + 1];
      if (cost(b, a) < cost(a, b)) {
        order[i] = b;
        order[i + 1] = a;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return order;
}

// ---------------------------------------------------------------------------

export async function layoutView(vm: ViewModel, opts: LayoutOptions): Promise<ViewLayout> {
  return layoutViewSync(vm, opts);
}

const COMPONENT_GAP = 36;

/**
 * Lay out each connected component on its own and stack them, titled by the
 * folder they share. Unrelated parts of a repo (a TS client and a Python
 * server) then never interleave in the same columns.
 */
export function layoutViewSync(vm: ViewModel, opts: LayoutOptions): ViewLayout {
  const comps = connectedComponents(vm);
  if (comps.length <= 1) return layoutComponent(vm, opts);

  const viewport = opts.viewport ?? { width: 1600, height: 1600 / Math.max(0.3, opts.aspectRatio) };
  const total = vm.nodes.length;
  const nodes: PositionedNode[] = [];
  const edges: PositionedEdge[] = [];
  const groups: LayoutGroup[] = [];
  const frames: GroupFrame[] = [];
  const hiddenEdges: PositionedEdge[] = [];
  let y = 0;
  let width = 0;
  for (const comp of comps) {
    const share = comp.nodes.length / total;
    const sub = layoutComponent(comp, {
      aspectRatio: viewport.width / Math.max(80, viewport.height * share),
      viewport: { width: viewport.width, height: Math.max(80, viewport.height * share) },
      box: opts.box,
      hidden: opts.hidden,
    });
    const top = Math.min(...sub.nodes.map((n) => n.y));
    const dy = y - top + 18;
    for (const n of sub.nodes) nodes.push({ ...n, y: n.y + dy });
    for (const e of sub.edges) edges.push({ ...e, points: e.points.map((p) => ({ x: p.x, y: p.y + dy })) });
    for (const e of sub.hiddenEdges ?? []) hiddenEdges.push({ ...e, points: e.points.map((p) => ({ x: p.x, y: p.y + dy })) });
    for (const f of sub.frames ?? []) frames.push({ ...f, y: f.y + dy });
    const label = commonFolder(comp.nodes);
    if (label) groups.push({ label, x: Math.min(...sub.nodes.map((n) => n.x)), y: y + 8 });
    y += sub.height - top + COMPONENT_GAP;
    width = Math.max(width, sub.width);
  }
  return { nodes, edges, width, height: y, groups, frames, hiddenEdges };
}

function connectedComponents(vm: ViewModel): ViewModel[] {
  const parent = new Map(vm.nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const e of vm.edges) parent.set(find(e.source), find(e.target));
  const byRoot = new Map<string, ViewNode[]>();
  for (const n of vm.nodes) byRoot.set(find(n.id), [...(byRoot.get(find(n.id)) ?? []), n]);
  const multi = [...byRoot.values()].filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
  const singles = [...byRoot.values()].filter((c) => c.length === 1).flat();
  // Focus views keep their single centered layout; only split views of a folder's contents.
  if (multi.length <= 1 || vm.nodes.some((n) => n.region !== "center")) return [vm];
  const parts = singles.length ? [...multi, singles] : multi;
  return parts.map((ns) => {
    const ids = new Set(ns.map((n) => n.id));
    return { ...vm, nodes: ns, edges: vm.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  });
}

/** Deepest folder shared by every node in a component ("" when nothing is shared). */
function commonFolder(nodes: ViewNode[]): string {
  const paths = nodes.map((n) => n.title.split("/"));
  if (paths.length < 2) return "";
  const first = paths[0];
  let k = 0;
  while (k < first.length - 1 && paths.every((p) => p.length - 1 > k && p[k] === first[k])) k++;
  return first.slice(0, k).join("/");
}

function layoutComponent(vm: ViewModel, opts: LayoutOptions): ViewLayout {
  if (vm.nodes.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const byRegion: Record<Region, ViewNode[]> = { in: [], center: [], out: [] };
  for (const n of vm.nodes) byRegion[n.region].push(n);

  // Layer each region by dependency depth: importers sit left of what they
  // import, so edges inside a region mostly flow between adjacent columns.
  // Imported code sits right of its importers everywhere. Depth counts away
  // from the focus on the sides (in: importers deeper; out: imports deeper).
  const inDepth = sideDepths(byRegion.in, vm.edges, true);
  const outDepth = sideDepths(byRegion.out, vm.edges, false);
  const centerRank = sideDepths(byRegion.center, vm.edges, false);
  const levels = (ns: ViewNode[], depth: Map<string, number>): ViewNode[][] => {
    const out: ViewNode[][] = [];
    for (const n of ns) {
      const d = depth.get(n.id) ?? 0;
      (out[d] ??= []).push(n);
    }
    // Group members sit together from the start, so chunking a level into
    // columns splits as few groups as possible.
    return out.filter(Boolean).map((l) => l.sort((a, b) => groupKey(a).localeCompare(groupKey(b)) || a.label.localeCompare(b.label)));
  };
  const inLevels = levels(byRegion.in, inDepth); // index 0 = nearest the center
  const centerLevels = levels(byRegion.center, centerRank);
  const outLevels = levels(byRegion.out, outDepth);

  // Fold depth levels into columns. Fewer columns pack tighter; more columns
  // show the flow. `rankPackings` trades the two off against the viewport from
  // box counts alone. Channel widths depend on routing, so a candidate is laid
  // out for real and kept if its real shape meets the band; otherwise the next
  // (up to `MAX_TRIES`) is tried and the best of them kept. Layout takes a few ms,
  // and the first candidate usually passes.
  const viewport = opts.viewport ?? { width: 1600, height: 1600 / Math.max(0.3, opts.aspectRatio) };
  const target = Math.max(0.3, viewport.width / Math.max(1, viewport.height));
  const regions = [inLevels, centerLevels, outLevels];
  const ranked = rankPackings(
    regions.map((lvls) => lvls.map((l) => l.length)),
    viewport,
    opts.box,
  );
  let best: { layout: ViewLayout; rank: number } | null = null;
  for (const packing of ranked.slice(0, vm.nodes.length > 32 ? 2 : MAX_TRIES)) {
    const [inCols, centerCols, outCols] = regions.map((lvls, r) =>
      foldLevels(lvls, packing.folds[r]).flatMap((g) => chunk(g, packing.rows)),
    );
    inCols.reverse();
    const layout = placeAndRoute(vm, byRegion, [...inCols, ...centerCols, ...outCols], packing.rows, opts.box ?? DEFAULT_BOX, opts.hidden);
    const aspect = aspectOf(layout);
    const cost = packingCost(aspect, target, packing);
    const rank = (meetsBand(aspect, target, packing) ? 0 : 100) + cost;
    if (!best || rank < best.rank - 1e-9) best = { layout, rank };
    // Candidates are ranked best first, so the first real fit is kept.
    if (meetsBand(aspect, target, packing)) break;
  }
  return best!.layout;
}

/**
 * Candidate packings laid out for real before settling for the best seen.
 * Big views have many rows, so the estimate is close and each try costs more:
 * they get two.
 */
const MAX_TRIES = 6;

/** Width:height of what the canvas frames (boxes and edges). */
export function aspectOf(layout: Pick<ViewLayout, "nodes" | "edges">): number {
  const b = boundsOf(layout.nodes, layout.edges);
  return b.height > 0 ? b.width / b.height : 1;
}

/** Order rows within columns, route every edge and materialize coordinates. */
function placeAndRoute(
  vm: ViewModel,
  byRegion: Record<Region, ViewNode[]>,
  columns: ViewNode[][],
  rows: number,
  box: BoxSize,
  hidden: Set<string> = new Set(),
): ViewLayout {
  const C = columns.length;

  const colOf = new Map<string, number>();
  columns.forEach((col, ci) => col.forEach((n) => colOf.set(n.id, ci)));

  // Barycenter sweeps to order rows within each column.
  const neighbors = new Map<string, string[]>();
  for (const e of vm.edges) {
    neighbors.set(e.source, [...(neighbors.get(e.source) ?? []), e.target]);
    neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), e.source]);
  }
  const gKey = new Map(vm.nodes.map((n) => [n.id, groupKey(n)]));
  const sKey = new Map(vm.nodes.map((n) => [n.id, subgroupKey(n)]));
  const rowOf = new Map<string, number>();
  const placeColumn = (col: ViewNode[]) => {
    const start = Math.floor((rows - col.length) / 2);
    col.forEach((n, i) => rowOf.set(n.id, start + i));
  };
  columns.forEach(placeColumn);
  for (let sweep = 0; sweep < 12; sweep++) {
    const order = sweep % 2 === 0 ? columns.map((_, i) => i) : columns.map((_, i) => C - 1 - i);
    for (const ci of order) {
      const col = columns[ci];
      const bary = new Map<string, number>();
      for (const n of col) {
        const ns = (neighbors.get(n.id) ?? []).filter((m) => colOf.get(m) !== ci);
        bary.set(n.id, ns.length ? ns.reduce((a, m) => a + rowOf.get(m)!, 0) / ns.length : rowOf.get(n.id)!);
      }
      // Groups move as blocks: order groups by their mean barycenter, then
      // files inside a group, then boxes inside a file.
      const groupBary = meanBy(col, gKey, bary);
      const subBary = meanBy(col, sKey, bary);
      col.sort(
        (a, b) =>
          groupBary.get(gKey.get(a.id)!)! - groupBary.get(gKey.get(b.id)!)! ||
          gKey.get(a.id)!.localeCompare(gKey.get(b.id)!) ||
          subBary.get(sKey.get(a.id)!)! - subBary.get(sKey.get(b.id)!)! ||
          sKey.get(a.id)!.localeCompare(sKey.get(b.id)!) ||
          bary.get(a.id)! - bary.get(b.id)! ||
          a.label.localeCompare(b.label),
      );
      placeColumn(col);
    }
  }

  // ---- Group frames: runs of ≥2 boxes of one group in a column ----
  const runs: { groupId: string; label: string; column: number; first: number; last: number }[] = [];
  columns.forEach((col, ci) => {
    const byRow = [...col].sort((a, b) => rowOf.get(a.id)! - rowOf.get(b.id)!);
    let i = 0;
    while (i < byRow.length) {
      const g = byRow[i].group;
      let j = i;
      while (g && j + 1 < byRow.length && byRow[j + 1].group?.id === g.id) j++;
      if (g && j > i) runs.push({ groupId: g.id, label: g.label, column: ci, first: rowOf.get(byRow[i].id)!, last: rowOf.get(byRow[j].id)! });
      i = j + 1;
    }
  });

  // ---- Routing plan (abstract coordinates: rows for y, columns for x) ----
  const centerIds = new Set(byRegion.center.map((n) => n.id));
  const isCenter = (id: string) => centerIds.has(id);
  const routed = vm.edges.filter((e) => !hidden.has(e.id));
  const degree = new Map<string, number>();
  for (const e of routed) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  // Distinct track groups per gutter, filled in as routes are planned.
  const gutterLoad = new Map<number, Set<string>>();
  // Frames whose interior gutter `g` passes through between channels c0..c1
  // (columns c0..c1-1), ignoring the frames that hold either end.
  const groupOfNode = new Map(vm.nodes.map((n) => [n.id, n.group?.id]));
  const framesCut = (g: number, c0: number, c1: number, s: string, t: string) =>
    runs.filter(
      (r) =>
        r.column >= c0 &&
        r.column < c1 &&
        g > r.first &&
        g <= r.last &&
        r.groupId !== groupOfNode.get(s) &&
        r.groupId !== groupOfNode.get(t),
    ).length;
  const routes: Route[] = routed.map((edge) => {
    const s = edge.source;
    const t = edge.target;
    const cs = colOf.get(s)!;
    const ct = colOf.get(t)!;
    const exitSide: Side = ct < cs ? "left" : "right";
    const entrySide: Side = cs < ct ? "left" : "right";
    const exitChannel = exitSide === "right" ? cs + 1 : cs;
    const entryChannel = entrySide === "left" ? ct : ct + 1;
    let gutter: number | null = null;
    let gutterGroup: string | null = null;
    if (exitChannel !== entryChannel) {
      // Anchor at the busier end so edges sharing it converge into one trunk.
      const ds = degree.get(s) ?? 0;
      const dt = degree.get(t) ?? 0;
      const anchorIsTarget = dt > ds || (dt === ds && (isCenter(t) || !isCenter(s)));
      const anchor = anchorIsTarget ? t : s;
      const other = anchorIsTarget ? s : t;
      const ra = rowOf.get(anchor)!;
      const ro = rowOf.get(other)!;
      const key = `${anchor}|${anchorIsTarget ? "in" : "out"}`;
      // The gutter next to the anchor bundles edges into one trunk; the one
      // next to the other end (or, on the same row, the other side of the
      // anchor) is the alternative when it is less crowded or the first one
      // would cut through another package's frame.
      const near = ro < ra ? ra : ra + 1;
      const far = ro === ra ? ra : ro < ra ? ro + 1 : ro;
      const [c0, c1] = [Math.min(exitChannel, entryChannel), Math.max(exitChannel, entryChannel)];
      const cost = (g: number) => {
        const groups = gutterLoad.get(g) ?? new Set<string>();
        const crowd = groups.has(`${key}|${g}`) ? 0 : groups.size;
        return framesCut(g, c0, c1, s, t) * 100 + crowd + (g === near ? 0 : 0.5);
      };
      gutter = far !== near && cost(far) < cost(near) ? far : near;
      gutterGroup = `${key}|${gutter}`;
      const load = gutterLoad.get(gutter) ?? new Set<string>();
      load.add(gutterGroup);
      gutterLoad.set(gutter, load);
    }
    return {
      edge,
      s,
      t,
      exitSide,
      entrySide,
      exitChannel,
      entryChannel,
      gutter,
      // Edges bound for the same gutter track share one trunk in the exit channel.
      exitGroup: gutterGroup ? `G|${gutterGroup}` : `T|${t}|${entrySide}`,
      entryGroup: `T|${t}|${entrySide}`,
      gutterGroup,
    };
  });
  // Single-channel edges share a trunk at their busier end: fan-in bundles at
  // the target, fan-out at the source.
  for (const r of routes) {
    if (r.gutter !== null) continue;
    const fanOut = (degree.get(r.s) ?? 0) > (degree.get(r.t) ?? 0);
    r.entryGroup = fanOut ? `S|${r.s}|${r.exitSide}|ch` : r.entryGroup;
    r.exitGroup = r.entryGroup;
  }

  // Ports: when a side carries both outgoing and incoming edges, split them.
  const sideUse = new Map<string, { out: boolean; in: boolean }>();
  const mark = (id: string, side: Side, kind: "out" | "in") => {
    const k = `${id}|${side}`;
    const u = sideUse.get(k) ?? { out: false, in: false };
    u[kind] = true;
    sideUse.set(k, u);
  };
  for (const r of routes) {
    mark(r.s, r.exitSide, "out");
    mark(r.t, r.entrySide, "in");
  }
  const portRowOffset = (id: string, side: Side, kind: "out" | "in") => {
    const u = sideUse.get(`${id}|${side}`);
    if (!u || !(u.out && u.in)) return 0;
    return kind === "out" ? -PORT_SPLIT : PORT_SPLIT;
  };

  // Abstract y of a row center / gutter for ordering purposes.
  const rowY = (r: number) => r + 0.5;
  const gutY = (g: number) => g;

  // ---- Channel tracks ----
  type Seg = {
    route: Route;
    group: string;
    lo: number;
    hi: number;
    lowStub: number | null;
    highStub: number | null;
    turn?: { low?: number; high?: number };
  };
  const channelSegs = new Map<number, Seg[]>();
  const addChannelSeg = (ch: number, seg: Seg) => {
    const arr = channelSegs.get(ch) ?? [];
    arr.push(seg);
    channelSegs.set(ch, arr);
  };
  for (const r of routes) {
    const ys = rowY(rowOf.get(r.s)!);
    const yt = rowY(rowOf.get(r.t)!);
    // A stub toward column k-1 is a "low" stub (left), toward column k is "high" (right).
    const stub = (side: Side) => (side === "right" ? "low" : "high");
    if (r.gutter === null) {
      const ch = r.exitChannel;
      const sStub = stub(r.exitSide);
      const tStub = stub(r.entrySide);
      addChannelSeg(ch, {
        route: r,
        group: r.entryGroup,
        lo: Math.min(ys, yt),
        hi: Math.max(ys, yt),
        lowStub: sStub === "low" ? ys : tStub === "low" ? yt : null,
        highStub: sStub === "high" ? ys : tStub === "high" ? yt : null,
      });
      if (sStub === tStub) {
        // Both stubs on one side (same-column edge): record both.
        const segs = channelSegs.get(ch)!;
        const seg = segs[segs.length - 1];
        if (sStub === "low") seg.highStub = null;
        else seg.lowStub = null;
        (seg as any).extraStub = sStub === "low" ? { low: [ys, yt] } : { high: [ys, yt] };
      }
    } else {
      const gy = gutY(r.gutter);
      // The turn into the gutter is a stub too: toward the entry channel.
      const rightward = r.entryChannel > r.exitChannel;
      addChannelSeg(r.exitChannel, {
        route: r,
        group: r.exitGroup,
        lo: Math.min(ys, gy),
        hi: Math.max(ys, gy),
        lowStub: r.exitSide === "right" ? ys : null,
        highStub: r.exitSide === "left" ? ys : null,
        turn: rightward ? { high: gy } : { low: gy },
      });
      addChannelSeg(r.entryChannel, {
        route: r,
        group: r.entryGroup,
        lo: Math.min(yt, gy),
        hi: Math.max(yt, gy),
        lowStub: r.entrySide === "right" ? yt : null,
        highStub: r.entrySide === "left" ? yt : null,
        turn: rightward ? { low: gy } : { high: gy },
      });
    }
  }

  // Each track is as wide as its bundle needs (`trackWidth`), so a busy
  // trunk widens its channel instead of squeezing its edges together.
  const channelTrack = new Map<string, number>(); // `${ch}|${group}` → track center offset
  const channelTracks = new Array(C + 1).fill(0); // total track width per channel
  for (const [ch, segs] of channelSegs) {
    const groups = new Map<string, TrackGroup>();
    for (const s of segs) {
      const g = groups.get(s.group) ?? { key: s.group, lo: Infinity, hi: -Infinity, lowStubs: [], highStubs: [] };
      g.lo = Math.min(g.lo, s.lo);
      g.hi = Math.max(g.hi, s.hi);
      const extra = (s as any).extraStub as { low?: number[]; high?: number[] } | undefined;
      if (s.lowStub !== null) g.lowStubs.push(s.lowStub);
      if (s.highStub !== null) g.highStubs.push(s.highStub);
      if (extra?.low) g.lowStubs.push(...extra.low);
      if (extra?.high) g.highStubs.push(...extra.high);
      if (s.turn?.low !== undefined) g.lowStubs.push(s.turn.low);
      if (s.turn?.high !== undefined) g.highStubs.push(s.turn.high);
      groups.set(s.group, g);
    }
    const ordered = orderGroups([...groups.values()]);
    const edgesIn = new Map<string, Set<string>>();
    for (const s of segs) edgesIn.set(s.group, (edgesIn.get(s.group) ?? new Set()).add(s.route.edge.id));
    let at = 0;
    for (const g of ordered) {
      const w = trackWidth(edgesIn.get(g.key)!.size);
      channelTrack.set(`${ch}|${g.key}`, at + w / 2);
      at += w;
    }
    channelTracks[ch] = at;
  }

  // ---- Geometry: columns and channels ----
  const channelWidth = channelTracks.map((used, k) => {
    const outer = k === 0 || k === C;
    if (used === 0) return outer ? 0 : MIN_CHANNEL;
    return Math.max(outer ? 2 * CHANNEL_PAD : MIN_CHANNEL, used + 2 * CHANNEL_PAD);
  });
  const colX: number[] = [];
  const channelX: number[] = [];
  let x = MARGIN;
  for (let k = 0; k <= C; k++) {
    channelX[k] = x;
    x += channelWidth[k];
    if (k < C) {
      colX[k] = x;
      x += box.width;
    }
  }
  const totalWidth = x + MARGIN;
  const trackX = (ch: number, group: string) => {
    const inner = channelWidth[ch] - 2 * CHANNEL_PAD;
    return channelX[ch] + CHANNEL_PAD + (inner - channelTracks[ch]) / 2 + (channelTrack.get(`${ch}|${group}`) ?? 0);
  };

  // ---- Gutter tracks (need real channel x for stub positions) ----
  const gutterSegs = new Map<number, { group: string; edge: string; lo: number; hi: number; up: number[]; down: number[] }[]>();
  for (const r of routes) {
    if (r.gutter === null) continue;
    const x1 = trackX(r.exitChannel, r.exitGroup);
    const x2 = trackX(r.entryChannel, r.entryGroup);
    const ys = rowY(rowOf.get(r.s)!);
    const yt = rowY(rowOf.get(r.t)!);
    const g = r.gutter;
    const arr = gutterSegs.get(g) ?? [];
    const up: number[] = [];
    const down: number[] = [];
    (ys < g ? up : down).push(x1);
    (yt < g ? up : down).push(x2);
    arr.push({ group: r.gutterGroup!, edge: r.edge.id, lo: Math.min(x1, x2), hi: Math.max(x1, x2), up, down });
    gutterSegs.set(g, arr);
  }
  const gutterTrack = new Map<string, number>();
  const gutterTracks = new Array(rows + 1).fill(0);
  for (const [g, segs] of gutterSegs) {
    const groups = new Map<string, TrackGroup>();
    for (const s of segs) {
      const tg = groups.get(s.group) ?? { key: s.group, lo: Infinity, hi: -Infinity, lowStubs: [], highStubs: [] };
      tg.lo = Math.min(tg.lo, s.lo);
      tg.hi = Math.max(tg.hi, s.hi);
      tg.lowStubs.push(...s.up);
      tg.highStubs.push(...s.down);
      groups.set(s.group, tg);
    }
    const ordered = orderGroups([...groups.values()]);
    const edgesIn = new Map<string, Set<string>>();
    for (const s of segs) edgesIn.set(s.group, (edgesIn.get(s.group) ?? new Set()).add(s.edge));
    let at = 0;
    for (const tg of ordered) {
      const w = trackWidth(edgesIn.get(tg.key)!.size);
      gutterTrack.set(`${g}|${tg.key}`, at + w / 2);
      at += w;
    }
    gutterTracks[g] = at;
  }
  // A frame's label needs room in the gutter above its first box, and its
  // bottom edge a little room in the gutter below its last box. Edge tracks
  // run in the band between.
  const labelRoom = new Array(rows + 1).fill(0);
  const bottomRoom = new Array(rows + 1).fill(0);
  for (const r of runs) {
    labelRoom[r.first] = FRAME_LABEL_H;
    bottomRoom[r.last + 1] = FRAME_PAD + 1;
  }
  const trackBand = gutterTracks.map((used, g) => {
    const outer = g === 0 || g === rows;
    if (used === 0) return outer ? 0 : MIN_GUTTER;
    return Math.max(MIN_GUTTER, used + 2 * GUTTER_PAD);
  });
  const gutterHeight = trackBand.map((h, g) => h + labelRoom[g] + bottomRoom[g]);
  const rowTop: number[] = [];
  const gutterTop: number[] = [];
  let y = MARGIN + 18; // room for region headers
  for (let g = 0; g <= rows; g++) {
    gutterTop[g] = y;
    y += gutterHeight[g];
    if (g < rows) {
      rowTop[g] = y;
      y += box.height;
    }
  }
  const totalHeight = y + MARGIN;
  const trackY = (g: number, group: string) => {
    const inner = trackBand[g] - 2 * GUTTER_PAD;
    return gutterTop[g] + bottomRoom[g] + GUTTER_PAD + Math.max(0, (inner - gutterTracks[g]) / 2) + (gutterTrack.get(`${g}|${group}`) ?? 0);
  };

  // ---- Materialize ----
  const nodes: PositionedNode[] = vm.nodes.map((n) => ({
    id: n.id,
    x: colX[colOf.get(n.id)!],
    y: rowTop[rowOf.get(n.id)!],
    width: box.width,
    height: box.height,
    node: n,
    column: colOf.get(n.id)!,
    row: rowOf.get(n.id)!,
  }));
  const boxOf = new Map(nodes.map((n) => [n.id, n]));
  const port = (id: string, side: Side, kind: "out" | "in"): Point => {
    const b = boxOf.get(id)!;
    return {
      x: side === "right" ? b.x + b.width : b.x,
      y: b.y + b.height / 2 + portRowOffset(id, side, kind),
    };
  };

  const edges: PositionedEdge[] = routes.map((r) => {
    const a = port(r.s, r.exitSide, "out");
    const b = port(r.t, r.entrySide, "in");
    let points: Point[];
    if (r.gutter === null) {
      const tx = trackX(r.exitChannel, r.entryGroup);
      points = [a, { x: tx, y: a.y }, { x: tx, y: b.y }, b];
    } else {
      const x1 = trackX(r.exitChannel, r.exitGroup);
      const x2 = trackX(r.entryChannel, r.entryGroup);
      const gy = trackY(r.gutter, r.gutterGroup!);
      points = [a, { x: x1, y: a.y }, { x: x1, y: gy }, { x: x2, y: gy }, { x: x2, y: b.y }, b];
    }
    return { id: r.edge.id, source: r.s, target: r.t, points: simplify(points), edge: r.edge };
  });

  bundleOffsets(edges, nodes);

  // Hidden edges take the middle of each channel and gutter they need: they
  // only show while their hub is hovered, over dimmed neighbors.
  const channelMid = (ch: number, side: Side) =>
    channelWidth[ch] > 0 ? channelX[ch] + channelWidth[ch] / 2 : channelX[ch] + (side === "right" ? 8 : -8);
  const hiddenEdges: PositionedEdge[] = vm.edges
    .filter((e) => hidden.has(e.id))
    .map((edge) => {
      const cs = colOf.get(edge.source)!;
      const ct = colOf.get(edge.target)!;
      const exitSide: Side = ct < cs ? "left" : "right";
      const entrySide: Side = cs < ct ? "left" : "right";
      const a = port(edge.source, exitSide, "out");
      const b = port(edge.target, entrySide, "in");
      const x1 = channelMid(exitSide === "right" ? cs + 1 : cs, exitSide);
      const x2 = channelMid(entrySide === "left" ? ct : ct + 1, entrySide);
      let points: Point[];
      if (Math.abs(x1 - x2) < 0.5) points = [a, { x: x1, y: a.y }, { x: x1, y: b.y }, b];
      else {
        const g = rowOf.get(edge.target)!;
        const gy = gutterTop[g] + gutterHeight[g] / 2;
        points = [a, { x: x1, y: a.y }, { x: x1, y: gy }, { x: x2, y: gy }, { x: x2, y: b.y }, b];
      }
      return { id: edge.id, source: edge.source, target: edge.target, points: simplify(points), edge };
    });
  const frames: GroupFrame[] = runs.map((r) => {
    const y0 = rowTop[r.first] - FRAME_LABEL_H;
    const y1 = rowTop[r.last] + box.height + FRAME_PAD;
    return {
      id: `${r.column}|${r.groupId}|${r.first}`,
      groupId: r.groupId,
      label: r.label,
      column: r.column,
      x: colX[r.column] - FRAME_PAD,
      y: y0,
      width: box.width + 2 * FRAME_PAD,
      height: y1 - y0,
    };
  });
  return { nodes, edges, width: totalWidth, height: totalHeight, frames, hiddenEdges };
}

/** Mean of `value` over the nodes sharing each key. */
function meanBy(nodes: ViewNode[], keyOf: Map<string, string>, value: Map<string, number>): Map<string, number> {
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  for (const n of nodes) {
    const k = keyOf.get(n.id)!;
    sum.set(k, (sum.get(k) ?? 0) + value.get(n.id)!);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  for (const [k, v] of sum) sum.set(k, v / count.get(k)!);
  return sum;
}

const groupKey = (n: ViewNode) => (n.group ? `g:${n.group.id}` : `n:${n.id}`);
const subgroupKey = (n: ViewNode) => (n.subgroup ? `${groupKey(n)}|${n.subgroup}` : `n:${n.id}`);

/** Drop zero-length segments and collinear middle points. */
function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) dedup.push(p);
  }
  if (dedup.length < 3) return dedup;
  const out = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1];
    const b = dedup[i];
    const c = dedup[i + 1];
    const collinear =
      (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
      (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
    if (!collinear) out.push(b);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
}

/**
 * Edges that share a track coincide exactly. Spread coincident segments
 * 1–2px apart so a bundle reads as a thicker line whose width shows how many
 * edges it carries.
 *
 * The order inside a bundle decides whether its edges cross each other where
 * they peel off. Each bundle starts in the order the turns dictate (an edge
 * that leaves toward the right sits on the right), then adjacent swaps that
 * remove real crossings are kept until none helps.
 */
export function bundleOffsets(edges: Polyline[], boxes: Box[] = []): void {
  type Seg = { edge: number; seg: number; lo: number; hi: number; sortKey: number };
  const horiz = new Map<number, Seg[]>();
  const vert = new Map<number, Seg[]>();
  const centerY = new Map(boxes.map((b) => [b.id, b.y + b.height / 2]));
  const centerX = new Map(boxes.map((b) => [b.id, b.x + b.width / 2]));
  const base = edges.map((e) => e.points.map((p) => ({ ...p })));

  edges.forEach((e, ei) => {
    const last = e.points.length - 2;
    for (let si = 0; si <= last; si++) {
      const a = e.points[si];
      const b = e.points[si + 1];
      // The stubs touching boxes stay on their port so arrows meet the box edge.
      if ((si === 0 || si === last) && e.points.length > 2 && Math.abs(a.y - b.y) < 0.5) continue;
      if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 0.5) {
        const key = Math.round(a.y * 2);
        const arr = horiz.get(key) ?? [];
        const sortKey = (centerX.get(e.source) ?? 0) * 1e4 + (centerX.get(e.target) ?? 0);
        arr.push({ edge: ei, seg: si, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), sortKey });
        horiz.set(key, arr);
      } else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.5) {
        const key = Math.round(a.x * 2);
        const arr = vert.get(key) ?? [];
        const sortKey = (centerY.get(e.source) ?? 0) * 1e4 + (centerY.get(e.target) ?? 0);
        arr.push({ edge: ei, seg: si, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), sortKey });
        vert.set(key, arr);
      }
    }
  });

  // One bundle: the distinct edges on overlapping coincident segments, in order.
  type Item = { edge: number; segs: number[]; rep: number; sortKey: number };
  type Bundle = { vertical: boolean; items: Item[]; gap: number };
  const bundles: Bundle[] = [];
  const collect = (groups: Map<number, Seg[]>, vertical: boolean) => {
    for (const segs of groups.values()) {
      segs.sort((a, b) => a.lo - b.lo);
      let cluster: Seg[] = [];
      let clusterHi = -Infinity;
      const flush = () => {
        const byEdge = new Map<number, Item>();
        for (const s of cluster) {
          const it = byEdge.get(s.edge) ?? { edge: s.edge, segs: [], rep: s.seg, sortKey: s.sortKey };
          it.segs.push(s.seg);
          byEdge.set(s.edge, it);
        }
        if (byEdge.size > 1) {
          const items = [...byEdge.values()].sort(
            (a, b) => compareInBundle(base, a.edge, a.rep, b.edge, b.rep, 0) || a.sortKey - b.sortKey || a.edge - b.edge,
          );
          bundles.push({ vertical, items, gap: bundleGap(items.length) });
        }
        cluster = [];
        clusterHi = -Infinity;
      };
      for (const s of segs) {
        if (cluster.length > 0 && s.lo >= clusterHi - 0.5) flush();
        cluster.push(s);
        clusterHi = Math.max(clusterHi, s.hi);
      }
      flush();
    }
  };
  collect(horiz, false);
  collect(vert, true);

  const offset = edges.map((e) => new Array(Math.max(0, e.points.length - 1)).fill(0));
  const assign = (b: Bundle) => {
    const n = b.items.length;
    b.items.forEach((it, rank) => {
      for (const s of it.segs) offset[it.edge][s] = (rank - (n - 1) / 2) * b.gap;
    });
  };
  bundles.forEach(assign);

  const shaped = (ei: number): Point[] => {
    const pts = base[ei].map((p) => ({ ...p }));
    for (let si = 0; si < pts.length - 1; si++) {
      const d = offset[ei][si];
      if (!d) continue;
      const vertical = Math.abs(base[ei][si].x - base[ei][si + 1].x) < 0.5;
      if (vertical) {
        pts[si].x += d;
        pts[si + 1].x += d;
      } else {
        pts[si].y += d;
        pts[si + 1].y += d;
      }
    }
    return pts;
  };
  const cur = edges.map((_, ei) => shaped(ei));

  // Local search: swap neighbors in a bundle while it removes crossings.
  if (bundles.length) {
    const cost = (i: number, j: number) => {
      let c = 0;
      for (let k = 0; k < cur.length; k++) {
        if (k !== i) c += pairCrossings(cur[i], cur[k]);
        if (k !== j && k !== i) c += pairCrossings(cur[j], cur[k]);
      }
      return c;
    };
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      for (const b of bundles) {
        for (let r = 0; r < b.items.length - 1; r++) {
          const i = b.items[r].edge;
          const j = b.items[r + 1].edge;
          const before = cost(i, j);
          [b.items[r], b.items[r + 1]] = [b.items[r + 1], b.items[r]];
          assign(b);
          cur[i] = shaped(i);
          cur[j] = shaped(j);
          if (cost(i, j) < before) {
            improved = true;
            continue;
          }
          [b.items[r], b.items[r + 1]] = [b.items[r + 1], b.items[r]];
          assign(b);
          cur[i] = shaped(i);
          cur[j] = shaped(j);
        }
      }
      if (!improved) break;
    }
  }

  edges.forEach((e, ei) => {
    e.points = cur[ei];
  });
}

/** Proper crossings between perpendicular segments of two polylines. */
function pairCrossings(a: Point[], b: Point[]): number {
  let c = 0;
  const T = 1e-3;
  for (let i = 0; i < a.length - 1; i++) {
    const p = a[i];
    const q = a[i + 1];
    const aVert = Math.abs(p.x - q.x) < T;
    for (let j = 0; j < b.length - 1; j++) {
      const r = b[j];
      const s = b[j + 1];
      const bVert = Math.abs(r.x - s.x) < T;
      if (aVert === bVert) continue;
      const [v0, v1, h0, h1] = aVert ? [p, q, r, s] : [r, s, p, q];
      const x = v0.x;
      const y = h0.y;
      if (x > Math.min(h0.x, h1.x) + T && x < Math.max(h0.x, h1.x) - T && y > Math.min(v0.y, v1.y) + T && y < Math.max(v0.y, v1.y) - T) c++;
    }
  }
  return c;
}

/**
 * Where segment `s` of a polyline ends on its low or high side (along its
 * axis): the end's position, which way the line turns there (−1 left/up,
 * +1 right/down, 0 for a polyline end) and the segment it turns onto.
 */
function segEnd(pts: Point[], s: number, high: boolean) {
  const vertical = Math.abs(pts[s].x - pts[s + 1].x) < 0.5;
  const along = (p: Point) => (vertical ? p.y : p.x);
  const across = (p: Point) => (vertical ? p.x : p.y);
  const firstIsLow = along(pts[s]) <= along(pts[s + 1]);
  const atFirst = firstIsLow !== high;
  const end = atFirst ? pts[s] : pts[s + 1];
  const nb = atFirst ? pts[s - 1] : pts[s + 2];
  const turn = nb ? Math.sign(Math.round((across(nb) - across(end)) * 100)) : 0;
  return { pos: along(end), turn, next: nb ? (atFirst ? s - 1 : s + 1) : -1 };
}

/**
 * Order two coincident segments across their shared line: negative puts
 * `a` on the low side (left of a vertical bundle, above a horizontal one).
 * The edge that leaves the shared stretch first sits on the side it turns to;
 * two that turn together keep the order their next stretch needs.
 */
function compareInBundle(pts: Point[][], ea: number, sa: number, eb: number, sb: number, depth: number): number {
  for (const high of [false, true]) {
    const a = segEnd(pts[ea], sa, high);
    const b = segEnd(pts[eb], sb, high);
    const aLeavesFirst = high ? a.pos < b.pos - 0.5 : a.pos > b.pos + 0.5;
    const bLeavesFirst = high ? b.pos < a.pos - 0.5 : b.pos > a.pos + 0.5;
    if (aLeavesFirst && a.turn) return a.turn;
    if (bLeavesFirst && b.turn) return -b.turn;
    if (aLeavesFirst || bLeavesFirst) continue;
    if (a.turn !== b.turn) {
      if (a.turn && b.turn) return a.turn - b.turn;
      continue;
    }
    if (!a.turn || depth >= 3 || a.next < 0 || b.next < 0) continue;
    const r = compareInBundle(pts, ea, a.next, eb, b.next, depth + 1);
    if (r) return Math.sign(r) * (high ? -a.turn : a.turn);
  }
  return 0;
}
