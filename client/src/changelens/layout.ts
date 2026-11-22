// The two maps of the Changes view.
//
// Only edits: folder → file → chunk, area by changed lines with a floor in
// pixels, so a one-line edit can still be clicked. A collapsed group keeps
// its area and draws as one tile, so collapsing never moves its neighbours.
//
// Show in repo: folder → file, area by file LOC. An edited file carries one
// band per chunk, placed by the chunk's lines.

import * as d3 from "d3";
import { FOLDER_HEADER, hasHeader, type Rect } from "../compare/treemapLayout";
import type { LensChunk, LensFile } from "./types";

export interface Size {
  width: number;
  height: number;
}

export interface GroupTile {
  /** `pool`: a file's smaller chunks drawn as one tile. */
  kind: "folder" | "file" | "pool";
  /** Repo-relative path of the folder or file. */
  path: string;
  /** Label: a collapsed chain reads `server/app/services`. */
  name: string;
  rect: Rect;
  depth: number;
  /** Large enough to carry its label strip. */
  header: boolean;
  collapsed: boolean;
  /** Every chunk under the group. */
  chunkIds: string[];
}

export interface ChunkTile {
  chunk: LensChunk;
  rect: Rect;
}

export interface EditsLayout {
  groups: GroupTile[];
  chunks: ChunkTile[];
}

/** Smallest chunk tile, in px²: about 44 × 24, enough for a pointer and a short name. */
export const MIN_TILE_AREA = 1050;

/** Narrowest chunk tile, in px. A floor on area alone can leave a 2px strip beside a large sibling. */
export const MIN_TILE_SIDE = 16;

/**
 * `values` raised to a floor, so no tile gets less than `minArea` of an
 * `area` px² map. The floor solves `floor = share × Σ max(v, floor)`: with the
 * `k` smallest values raised, `floor = share × rest / (1 − share × k)`.
 * When there is no room for every floor, all weights come out equal.
 */
export function flooredWeights(values: number[], area: number, minArea: number): number[] {
  if (!values.length || area <= 0) return values.map(() => 1);
  const share = minArea / area;
  const sorted = [...values].sort((a, b) => a - b);
  let rest = sorted.reduce((sum, v) => sum + v, 0);
  let floor = 0;
  for (let k = 0; k < sorted.length; k++) {
    // Raise the k smallest; stop when the next value already clears the floor.
    floor = share * k < 1 ? (share * rest) / (1 - share * k) : Infinity;
    if (floor <= sorted[k]) break;
    rest -= sorted[k];
    if (k === sorted.length - 1) floor = sorted[k];
  }
  return values.map((v) => Math.max(v, floor, 1e-6));
}

interface TreeNode<T> {
  name: string;
  path: string;
  kind: "folder" | "file" | "pool" | "leaf";
  children?: TreeNode<T>[];
  leaf?: T;
  weight?: number;
}

/** True when `path` is `scope` or inside it. */
export const inScope = (path: string, scope: string) => !scope || path === scope || path.startsWith(`${scope}/`);

function folderTree<T>(scope: string, files: { path: string; node: TreeNode<T> }[]): TreeNode<T> {
  const root: TreeNode<T> = { name: scope.split("/").pop() ?? "", path: scope, kind: "folder", children: [] };
  const folders = new Map<string, TreeNode<T>>([[scope, root]]);
  const prefix = scope ? `${scope}/` : "";
  for (const file of files) {
    if (file.path === scope) return { ...root, children: [file.node] };
    const parts = file.path.slice(prefix.length).split("/");
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = prefix + parts.slice(0, i + 1).join("/");
      let folder = folders.get(path);
      if (!folder) {
        folder = { name: parts[i], path, kind: "folder", children: [] };
        folders.set(path, folder);
        parent.children!.push(folder);
      }
      parent = folder;
    }
    parent.children!.push(file.node);
  }
  return { ...root, children: root.children!.map(collapseChains) };
}

/** Merge a folder whose only child is a folder (`server` + `app` → `server/app`), so labels don't stack. */
function collapseChains<T>(node: TreeNode<T>): TreeNode<T> {
  if (node.kind !== "folder") return node;
  let cur = node;
  let name = node.name;
  for (;;) {
    const only = cur.children?.length === 1 ? cur.children[0] : null;
    if (!only || only.kind !== "folder") break;
    name = `${name}/${only.name}`;
    cur = only;
  }
  return { ...cur, name, children: cur.children!.map(collapseChains) };
}

function leavesOf<T>(node: TreeNode<T>): T[] {
  if (node.leaf !== undefined) return [node.leaf];
  return (node.children ?? []).flatMap(leavesOf);
}

const weightOf = <T,>(node: TreeNode<T>): number => node.weight ?? (node.children ?? []).reduce((sum, c) => sum + weightOf(c), 0);

function squarify<T>(root: TreeNode<T>, size: Size, inner: number, tile: typeof d3.treemapBinary = d3.treemapSquarify) {
  const hierarchy = d3
    .hierarchy(root, (n) => n.children)
    .sum((n) => (n.children ? 0 : (n.weight ?? 0)))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.data.path.localeCompare(b.data.path));
  return d3
    .treemap<TreeNode<T>>()
    .size([size.width, size.height])
    .paddingOuter(3)
    // A small group gives up its label strip so its tiles stay visible.
    .paddingTop((n) => (n.depth === 0 ? 3 : hasHeader(n) ? FOLDER_HEADER : 2))
    .paddingInner(inner)
    .round(true)
    .tile(tile)(hierarchy);
}

/**
 * Widen the leaves that came out narrower than `MIN_TILE_SIDE`: grow their
 * weight and lay out again, a few times. It runs on the open tree, so a
 * collapsed group keeps the area its tiles had.
 */
function settleSides<T>(tree: TreeNode<T>, size: Size) {
  for (let pass = 0; pass < 6; pass++) {
    let grew = false;
    for (const node of squarify(tree, size, 2).leaves()) {
      const side = Math.min(node.x1 - node.x0, node.y1 - node.y0);
      if ((node.data.kind !== "leaf" && node.data.kind !== "pool") || side >= MIN_TILE_SIDE) continue;
      node.data.weight = (node.data.weight ?? 0) * Math.min(4, (MIN_TILE_SIDE + 1) / Math.max(side, 1));
      grew = true;
    }
    if (!grew) return;
  }
}

const rectOf = (n: { x0: number; y0: number; x1: number; y1: number }): Rect => ({ x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1 });

/**
 * Only edits. `scope` is the folder or file the map is zoomed to ("" for the
 * repo); `collapsed` holds the paths of the groups drawn as one tile.
 */
export function layoutEdits(
  chunks: LensChunk[],
  size: Size,
  scope = "",
  collapsed: ReadonlySet<string> = new Set(),
  pooled: ReadonlySet<string> = new Set(),
  minArea = MIN_TILE_AREA
): EditsLayout {
  const shown = chunks.filter((c) => inScope(c.path, scope));
  if (!shown.length || size.width <= 0 || size.height <= 0) return { groups: [], chunks: [] };
  // The floor applies to what is drawn: each open chunk, and each pool as one tile with its chunks' lines.
  // Group strips and padding take a share of the map, so aim the floor a little high.
  const lines = (c: LensChunk) => c.added + c.deleted;
  const poolLines = new Map<string, number>();
  const poolCount = new Map<string, number>();
  for (const c of shown)
    if (pooled.has(c.id)) {
      poolLines.set(c.path, (poolLines.get(c.path) ?? 0) + lines(c));
      poolCount.set(c.path, (poolCount.get(c.path) ?? 0) + 1);
    }
  const open = shown.filter((c) => !pooled.has(c.id));
  const floored = flooredWeights([...open.map(lines), ...poolLines.values()], size.width * size.height * 0.8, minArea);
  const openWeight = new Map(open.map((c, i) => [c.id, floored[i]]));
  const poolWeight = new Map([...poolLines.keys()].map((path, i) => [path, floored[open.length + i]]));
  const weights = shown.map((c) => openWeight.get(c.id) ?? (poolWeight.get(c.path)! * (lines(c) + 1)) / (poolLines.get(c.path)! + poolCount.get(c.path)!));
  const byFile = new Map<string, TreeNode<LensChunk>>();
  const pools = new Map<string, TreeNode<LensChunk>>();
  shown.forEach((chunk, i) => {
    let file = byFile.get(chunk.path);
    if (!file) byFile.set(chunk.path, (file = { name: chunk.path.split("/").pop() ?? chunk.path, path: chunk.path, kind: "file", children: [] }));
    const leaf: TreeNode<LensChunk> = { name: chunk.name, path: chunk.id, kind: "leaf", leaf: chunk, weight: weights[i] };
    if (!pooled.has(chunk.id)) return void file.children!.push(leaf);
    let pool = pools.get(chunk.path);
    if (!pool) {
      pools.set(chunk.path, (pool = { name: "more", path: poolPath(chunk.path), kind: "pool", children: [] }));
      file.children!.push(pool);
    }
    pool.children!.push(leaf);
  });
  const tree = folderTree(scope, [...byFile].map(([path, node]) => ({ path, node })));
  const ids = new Map<string, string[]>();
  // A collapsed group becomes one leaf with the weight of everything under it.
  // A pool, or a group the user collapsed, becomes one leaf with the weight of everything under it.
  // Pools fold before the sides settle, so a pool is widened as one tile; collapsed groups fold after,
  // so collapsing keeps the area the open tiles had.
  const fold = (node: TreeNode<LensChunk>, which: (n: TreeNode<LensChunk>) => boolean): TreeNode<LensChunk> => {
    if (node.kind === "leaf" || !node.children) return node;
    if (!ids.has(node.path)) ids.set(node.path, leavesOf(node).map((c) => c.id));
    if (which(node) && node.path !== scope) return { ...node, children: undefined, weight: weightOf(node) };
    return { ...node, children: node.children.map((c) => fold(c, which)) };
  };
  const withPools = fold(tree, (n) => n.kind === "pool");
  settleSides(withPools, size);
  const laid = squarify(fold(withPools, (n) => collapsed.has(n.path)), size, 2);

  const groups: GroupTile[] = [];
  const tiles: ChunkTile[] = [];
  for (const node of laid.descendants()) {
    const rect = rectOf(node);
    const data = node.data;
    if (data.kind === "leaf") tiles.push({ chunk: data.leaf!, rect });
    else if (node.depth > 0)
      groups.push({ kind: data.kind, path: data.path, name: data.name, rect, depth: node.depth, header: hasHeader(rect), collapsed: !data.children, chunkIds: ids.get(data.path) ?? [] });
  }
  return { groups, chunks: tiles };
}

/** Open chunk tiles the map aims for, per px² of map: room for a name and a value in each. */
export const TILE_BUDGET_AREA = MIN_TILE_AREA * 7;

/** Path of the tile that pools a file's smaller chunks. */
export const poolPath = (file: string) => `${file}#more`;

/**
 * The chunks to pool into one "N more" tile per file, so a window with
 * hundreds of chunks stays readable. The chunks with the most churn stay
 * open, up to the map's budget; a file keeps a pool only for two or more.
 * Files in `expanded` pool nothing, and chunks in `keep` (ones the user selected) stay open.
 */
export function pooledChunks(chunks: LensChunk[], size: Size, scope = "", expanded: ReadonlySet<string> = new Set(), keep: ReadonlySet<string> = new Set()): Set<string> {
  const shown = chunks.filter((c) => inScope(c.path, scope));
  const budget = Math.max(12, Math.floor((size.width * size.height) / TILE_BUDGET_AREA));
  if (shown.length <= budget) return new Set();
  const ranked = [...shown].sort((a, b) => b.added + b.deleted - (a.added + a.deleted) || a.id.localeCompare(b.id));
  const byFile = new Map<string, string[]>();
  for (const c of ranked.slice(budget)) if (!expanded.has(c.path) && !keep.has(c.id)) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c.id]);
  return new Set([...byFile.values()].filter((ids) => ids.length > 1).flat());
}

// --- Show in repo -----------------------------------------------------------------

/** A file or folder of the repo map, with repo-relative paths. */
export interface RepoNode {
  name: string;
  path: string;
  loc: number;
  children?: RepoNode[];
}

export interface RepoFileTile {
  path: string;
  name: string;
  rect: Rect;
  loc: number;
  /** Set when the window edited the file. */
  file?: LensFile;
  bands: ChunkTile[];
}

export interface RepoLayout {
  folders: GroupTile[];
  files: RepoFileTile[];
}

/** The repo map's input when no scan tree is loaded: the edited files only, by `loc`. */
export function repoTreeFromFiles(files: LensFile[]): RepoNode {
  const nodes = files.filter((f) => f.loc !== null).map((f) => ({ path: f.path, node: { name: f.path.split("/").pop() ?? f.path, path: f.path, kind: "leaf" as const, leaf: f.loc ?? 0 } }));
  const strip = (n: TreeNode<number>): RepoNode => ({ name: n.name, path: n.path, loc: n.leaf ?? 0, ...(n.children ? { children: n.children.map(strip) } : {}) });
  return strip(folderTree<number>("", nodes));
}

/** The node at `scope`, or the root when the tree does not hold it. */
function findScope(node: RepoNode, scope: string): RepoNode {
  if (!scope || node.path === scope) return node;
  for (const child of node.children ?? []) if (inScope(scope, child.path)) return findScope(child, scope);
  return node;
}

/** Thinnest band drawn, so a one-line chunk in a long file can still be seen and clicked. */
export const MIN_BAND = 4;

/** The slice of a file tile that holds lines `start`…`end` of a file `lines` long. */
export function bandRect(tile: Rect, start: number, end: number, lines: number): Rect {
  const inset = 2;
  const top = tile.y0 + inset;
  const height = Math.max(0, tile.y1 - tile.y0 - inset * 2);
  const total = Math.max(lines, end, 1);
  const size = Math.min(height, Math.max(MIN_BAND, ((end - start + 1) / total) * height));
  const y0 = Math.min(top + ((start - 1) / total) * height, top + height - size);
  return { x0: tile.x0 + inset, y0, x1: tile.x1 - inset, y1: y0 + size };
}

export function layoutRepo(tree: RepoNode, files: LensFile[], chunks: LensChunk[], size: Size, scope = ""): RepoLayout {
  if (size.width <= 0 || size.height <= 0) return { folders: [], files: [] };
  const edited = new Map(files.map((f) => [f.path, f]));
  const byPath = new Map<string, LensChunk[]>();
  for (const c of chunks) byPath.set(c.path, [...(byPath.get(c.path) ?? []), c]);
  const toNode = (n: RepoNode): TreeNode<RepoNode> =>
    n.children ? { name: n.name, path: n.path, kind: "folder", children: n.children.map(toNode) } : { name: n.name, path: n.path, kind: "leaf", leaf: n, weight: Math.max(n.loc, 1) };
  const root = findScope(tree, scope);
  // A file scope is one leaf: wrap it so the treemap has a root above it.
  const top = toNode(root.children ? root : { name: "", path: "", loc: root.loc, children: [root] });
  const laid = squarify({ ...top, children: top.children!.map(collapseChains) }, size, 1);

  const out: RepoLayout = { folders: [], files: [] };
  for (const node of laid.descendants()) {
    const rect = rectOf(node);
    const data = node.data;
    if (data.kind !== "leaf") {
      if (node.depth > 0) out.folders.push({ kind: "folder", path: data.path, name: data.name, rect, depth: node.depth, header: hasHeader(rect), collapsed: false, chunkIds: [] });
      continue;
    }
    if (rect.x1 - rect.x0 < 2 || rect.y1 - rect.y0 < 2) continue;
    const mine = byPath.get(data.path) ?? [];
    const lines = Math.max(data.leaf!.loc, ...mine.map((c) => c.endLine));
    out.files.push({
      path: data.path,
      name: data.name,
      rect,
      loc: data.leaf!.loc,
      file: edited.get(data.path),
      bands: mine.map((chunk) => ({ chunk, rect: bandRect(rect, chunk.startLine, chunk.endLine, lines) })),
    });
  }
  return out;
}

/** The tile nearest to `from` in the direction of an arrow key; null at the edge. */
export function neighbour<T extends { rect: Rect }>(tiles: readonly T[], from: T, key: string): T | null {
  const [dx, dy] = key === "ArrowLeft" ? [-1, 0] : key === "ArrowRight" ? [1, 0] : key === "ArrowUp" ? [0, -1] : key === "ArrowDown" ? [0, 1] : [0, 0];
  if (!dx && !dy) return null;
  const mid = (r: Rect) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
  const [fx, fy] = mid(from.rect);
  let best: T | null = null;
  let bestCost = Infinity;
  for (const tile of tiles) {
    if (tile === from) continue;
    const [x, y] = mid(tile.rect);
    const along = (x - fx) * dx + (y - fy) * dy;
    if (along <= 0.5) continue;
    const across = Math.abs((x - fx) * dy) + Math.abs((y - fy) * dx);
    // Prefer a tile straight ahead over a nearer one off to the side.
    const cost = along + across * 2.5;
    if (cost < bestCost) [best, bestCost] = [tile, cost];
  }
  return best;
}
