import { boundsOf, type Box, type Point, type Polyline } from "./geometry";
import type { Region, ViewEdge, ViewModel, ViewNode } from "./viewModel";

// Grid + channel layout.
//
// Boxes sit in a global grid of columns and rows (every box is the same size).
// Edges never enter a cell: they leave a box sideways into the vertical channel
// next to its column, run along the channel, and — when they need to cross
// other columns — travel through a horizontal gutter between rows. Rows are
// aligned across columns, so gutters are free from end to end. Edges heading
// to the same box share a track, which `bundleOffsets` spreads 1–2px apart.

export const NODE_WIDTH = 196;
export const NODE_HEIGHT = 40;
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
/** Spacing between parallel edges inside a bundle. */
const BUNDLE_GAP = 1.75;
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
}

export interface LayoutOptions {
  /** Viewport width / height, used to pack columns to the screen. */
  aspectRatio: number;
  /** Viewport size in px; defaults to 1600 wide at the given aspect ratio. */
  viewport?: { width: number; height: number };
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
const COL_PITCH = NODE_WIDTH + MIN_CHANNEL + 12;
const ROW_PITCH = NODE_HEIGHT + MIN_GUTTER + 4;
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
      const width = cols * COL_PITCH + 40;
      const height = tallest * ROW_PITCH + 40;
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
  let y = 0;
  let width = 0;
  for (const comp of comps) {
    const share = comp.nodes.length / total;
    const sub = layoutComponent(comp, {
      aspectRatio: viewport.width / Math.max(80, viewport.height * share),
      viewport: { width: viewport.width, height: Math.max(80, viewport.height * share) },
    });
    const top = Math.min(...sub.nodes.map((n) => n.y));
    const dy = y - top + 18;
    for (const n of sub.nodes) nodes.push({ ...n, y: n.y + dy });
    for (const e of sub.edges) edges.push({ ...e, points: e.points.map((p) => ({ x: p.x, y: p.y + dy })) });
    for (const f of sub.frames ?? []) frames.push({ ...f, y: f.y + dy });
    const label = commonFolder(comp.nodes);
    if (label) groups.push({ label, x: Math.min(...sub.nodes.map((n) => n.x)), y: y + 8 });
    y += sub.height - top + COMPONENT_GAP;
    width = Math.max(width, sub.width);
  }
  return { nodes, edges, width, height: y, groups, frames };
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
  );
  let best: { layout: ViewLayout; rank: number } | null = null;
  for (const packing of ranked.slice(0, vm.nodes.length > 32 ? 2 : MAX_TRIES)) {
    const [inCols, centerCols, outCols] = regions.map((lvls, r) =>
      foldLevels(lvls, packing.folds[r]).flatMap((g) => chunk(g, packing.rows)),
    );
    inCols.reverse();
    const layout = placeAndRoute(vm, byRegion, [...inCols, ...centerCols, ...outCols], packing.rows);
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

  // ---- Routing plan (abstract coordinates: rows for y, columns for x) ----
  const centerIds = new Set(byRegion.center.map((n) => n.id));
  const isCenter = (id: string) => centerIds.has(id);
  const degree = new Map<string, number>();
  for (const e of vm.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const routes: Route[] = vm.edges.map((edge) => {
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
      gutter = ro < ra ? ra : ra + 1;
      gutterGroup = `${anchor}|${anchorIsTarget ? "in" : "out"}|${gutter}`;
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
    const u = sideUse.get(`${id}|${side}`)!;
    if (!(u.out && u.in)) return 0;
    return kind === "out" ? -PORT_SPLIT : PORT_SPLIT;
  };

  // Abstract y of a row center / gutter for ordering purposes.
  const rowY = (r: number) => r + 0.5;
  const gutY = (g: number) => g;

  // ---- Channel tracks ----
  type Seg = { route: Route; group: string; lo: number; hi: number; lowStub: number | null; highStub: number | null };
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
      addChannelSeg(r.exitChannel, {
        route: r,
        group: r.exitGroup,
        lo: Math.min(ys, gy),
        hi: Math.max(ys, gy),
        lowStub: r.exitSide === "right" ? ys : null,
        highStub: r.exitSide === "left" ? ys : null,
      });
      addChannelSeg(r.entryChannel, {
        route: r,
        group: r.entryGroup,
        lo: Math.min(yt, gy),
        hi: Math.max(yt, gy),
        lowStub: r.entrySide === "right" ? yt : null,
        highStub: r.entrySide === "left" ? yt : null,
      });
    }
  }

  const channelTrack = new Map<string, number>(); // `${ch}|${group}` → track index
  const channelTracks = new Array(C + 1).fill(0);
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
      groups.set(s.group, g);
    }
    const ordered = orderGroups([...groups.values()]);
    ordered.forEach((g, i) => channelTrack.set(`${ch}|${g.key}`, i));
    channelTracks[ch] = ordered.length;
  }

  // ---- Geometry: columns and channels ----
  const channelWidth = channelTracks.map((n, k) => {
    const outer = k === 0 || k === C;
    if (n === 0) return outer ? 0 : MIN_CHANNEL;
    return Math.max(outer ? 2 * CHANNEL_PAD : MIN_CHANNEL, n * TRACK + 2 * CHANNEL_PAD);
  });
  const colX: number[] = [];
  const channelX: number[] = [];
  let x = MARGIN;
  for (let k = 0; k <= C; k++) {
    channelX[k] = x;
    x += channelWidth[k];
    if (k < C) {
      colX[k] = x;
      x += NODE_WIDTH;
    }
  }
  const totalWidth = x + MARGIN;
  const trackX = (ch: number, group: string) => {
    const n = channelTracks[ch];
    const i = channelTrack.get(`${ch}|${group}`) ?? 0;
    const inner = channelWidth[ch] - 2 * CHANNEL_PAD;
    const used = (n - 1) * TRACK;
    return channelX[ch] + CHANNEL_PAD + (inner - used) / 2 + i * TRACK;
  };

  // ---- Gutter tracks (need real channel x for stub positions) ----
  const gutterSegs = new Map<number, { group: string; lo: number; hi: number; up: number[]; down: number[] }[]>();
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
    arr.push({ group: r.gutterGroup!, lo: Math.min(x1, x2), hi: Math.max(x1, x2), up, down });
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
    ordered.forEach((tg, i) => gutterTrack.set(`${g}|${tg.key}`, i));
    gutterTracks[g] = ordered.length;
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
  // A frame's label needs room in the gutter above its first box, and its
  // bottom edge a little room in the gutter below its last box. Edge tracks
  // run in the band between.
  const labelRoom = new Array(rows + 1).fill(0);
  const bottomRoom = new Array(rows + 1).fill(0);
  for (const r of runs) {
    labelRoom[r.first] = FRAME_LABEL_H;
    bottomRoom[r.last + 1] = FRAME_PAD + 1;
  }
  const trackBand = gutterTracks.map((n, g) => {
    const outer = g === 0 || g === rows;
    if (n === 0) return outer ? 0 : MIN_GUTTER;
    return Math.max(MIN_GUTTER, n * TRACK + 2 * GUTTER_PAD);
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
      y += NODE_HEIGHT;
    }
  }
  const totalHeight = y + MARGIN;
  const trackY = (g: number, group: string) => {
    const n = gutterTracks[g];
    const i = gutterTrack.get(`${g}|${group}`) ?? 0;
    const inner = trackBand[g] - 2 * GUTTER_PAD;
    const used = (n - 1) * TRACK;
    return gutterTop[g] + bottomRoom[g] + GUTTER_PAD + Math.max(0, (inner - used) / 2) + i * TRACK;
  };

  // ---- Materialize ----
  const nodes: PositionedNode[] = vm.nodes.map((n) => ({
    id: n.id,
    x: colX[colOf.get(n.id)!],
    y: rowTop[rowOf.get(n.id)!],
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
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
  const frames: GroupFrame[] = runs.map((r) => {
    const y0 = rowTop[r.first] - FRAME_LABEL_H;
    const y1 = rowTop[r.last] + NODE_HEIGHT + FRAME_PAD;
    return {
      id: `${r.column}|${r.groupId}|${r.first}`,
      groupId: r.groupId,
      label: r.label,
      column: r.column,
      x: colX[r.column] - FRAME_PAD,
      y: y0,
      width: NODE_WIDTH + 2 * FRAME_PAD,
      height: y1 - y0,
    };
  });
  return { nodes, edges, width: totalWidth, height: totalHeight, frames };
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
 */
export function bundleOffsets(edges: Polyline[], boxes: Box[] = []): void {
  type Seg = { edge: number; seg: number; lo: number; hi: number; sortKey: number };
  const horiz = new Map<number, Seg[]>();
  const vert = new Map<number, Seg[]>();
  const centerY = new Map(boxes.map((b) => [b.id, b.y + b.height / 2]));
  const centerX = new Map(boxes.map((b) => [b.id, b.x + b.width / 2]));

  edges.forEach((e, ei) => {
    const last = e.points.length - 2;
    for (let si = 0; si <= last; si++) {
      // The stubs touching boxes stay on their port so arrows meet the box edge.
      if ((si === 0 || si === last) && e.points.length > 2) {
        const a = e.points[si];
        const b = e.points[si + 1];
        if (Math.abs(a.y - b.y) < 0.5) continue;
      }
      const a = e.points[si];
      const b = e.points[si + 1];
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

  const dy = edges.map((e) => new Array(Math.max(0, e.points.length - 1)).fill(0));
  const dx = edges.map((e) => new Array(Math.max(0, e.points.length - 1)).fill(0));

  const assign = (groups: Map<number, Seg[]>, target: number[][]) => {
    for (const segs of groups.values()) {
      segs.sort((a, b) => a.lo - b.lo);
      let cluster: Seg[] = [];
      let clusterHi = -Infinity;
      const flush = () => {
        const edgesInCluster = [...new Set(cluster.map((s) => s.edge))];
        if (edgesInCluster.length > 1) {
          const order = [...cluster].sort((a, b) => a.sortKey - b.sortKey || a.edge - b.edge);
          const rank = new Map<number, number>();
          for (const s of order) if (!rank.has(s.edge)) rank.set(s.edge, rank.size);
          const n = rank.size;
          const gap = Math.min(BUNDLE_GAP, 8 / n);
          for (const s of cluster) target[s.edge][s.seg] = (rank.get(s.edge)! - (n - 1) / 2) * gap;
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
  assign(horiz, dy);
  assign(vert, dx);

  edges.forEach((e, ei) => {
    const pts = e.points.map((p) => ({ ...p }));
    for (let si = 0; si < e.points.length - 1; si++) {
      if (dy[ei][si]) {
        pts[si].y += dy[ei][si];
        pts[si + 1].y += dy[ei][si];
      }
      if (dx[ei][si]) {
        pts[si].x += dx[ei][si];
        pts[si + 1].x += dx[ei][si];
      }
    }
    e.points = pts;
  });
}
