// One treemap layout shared by the before and after panes.
//
// Every file gets a single tile sized by √max(before LOC, after LOC), laid out
// once over the union of both sides. Each pane then fills that tile to its own
// size: a file that grew from 100 to 400 lines fills a quarter of its tile on
// the left and all of it on the right, and a file missing on one side leaves
// an empty slot there. Unchanged files therefore sit in exactly the same place
// on both sides. Tiles use √LOC rather than LOC: in a changed-files view a
// 3-line edit matters as much as a 3,000-line one, and it has to stay visible.

import * as d3 from "d3";
import type { ChangeStatus, CompareFile, MetricDelta } from "./types";
import type { FileRow } from "./rows";

export type SideName = "base" | "head";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TileSide {
  loc: number;
  metrics: Record<string, number | null>;
  /** Filled part of the tile: area proportional to this side's LOC. */
  fill: Rect;
}

export interface FileTile {
  kind: "file";
  path: string;
  name: string;
  rect: Rect;
  status: ChangeStatus | "unchanged";
  change?: CompareFile;
  /** null when the file doesn't exist on that side. */
  sides: Record<SideName, TileSide | null>;
}

export interface FolderTile {
  kind: "folder";
  path: string;
  name: string;
  rect: Rect;
  depth: number;
  header: boolean;
}

export interface CompareTreemapLayout {
  files: FileTile[];
  folders: FolderTile[];
}

interface UnionNode {
  name: string;
  path: string;
  children?: UnionNode[];
  file?: FileRow;
}

export const FOLDER_HEADER = 18;

/** Whether a folder box is large enough to carry its label strip. */
export const hasHeader = (r: { x0: number; y0: number; x1: number; y1: number }) =>
  r.y1 - r.y0 > FOLDER_HEADER * 2.5 && r.x1 - r.x0 > 48;
const MIN_WEIGHT = 1;
const MIN_SHARE = 0.008;

function locOf(metrics: Record<string, number | null> | null | undefined): number {
  return Math.max(0, Number(metrics?.loc ?? 0) || 0);
}

function sideMetrics(row: FileRow, side: SideName): Record<string, number | null> | null {
  if (row.change) return side === "base" ? row.change.before : row.change.after;
  return row.metrics ?? null;
}

function buildUnion(rows: FileRow[], rootPath: string): UnionNode {
  const root: UnionNode = { name: rootPath.split("/").pop() || "", path: rootPath, children: [] };
  const folders = new Map<string, UnionNode>([[rootPath, root]]);
  const prefix = rootPath ? `${rootPath}/` : "";
  for (const row of rows) {
    if (rootPath && !row.path.startsWith(prefix)) continue;
    const parts = row.path.slice(prefix.length).split("/");
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = prefix + parts.slice(0, i + 1).join("/");
      let folder = folders.get(path);
      if (!folder) {
        folder = { name: parts[i], path, children: [] };
        folders.set(path, folder);
        parent.children!.push(folder);
      }
      parent = folder;
    }
    parent.children!.push({ name: parts[parts.length - 1], path: row.path, file: row });
  }
  // The root keeps its place (it has no label); chains collapse below it.
  return { ...root, children: root.children!.map(collapseChains) };
}

/** Merge folders whose only child is a folder ("server" + "app" → "server/app"), so labels don't stack. */
function collapseChains(node: UnionNode): UnionNode {
  if (!node.children) return node;
  let cur = node;
  let name = node.name;
  for (;;) {
    const only = cur.children?.length === 1 ? cur.children[0] : null;
    if (!only || !only.children) break;
    name = name ? `${name}/${only.name}` : only.name;
    cur = only;
  }
  const merged = cur === node ? node : { ...cur, name };
  return { ...merged, children: merged.children!.map(collapseChains) };
}

/** Shrink a rect to `fraction` of its area, keeping its aspect and top-left corner. */
export function fillRect(rect: Rect, fraction: number): Rect {
  const k = Math.sqrt(Math.max(0, Math.min(1, fraction)));
  return { x0: rect.x0, y0: rect.y0, x1: rect.x0 + (rect.x1 - rect.x0) * k, y1: rect.y0 + (rect.y1 - rect.y0) * k };
}

export function layoutCompareTreemap(
  rows: FileRow[],
  size: { width: number; height: number },
  rootPath = ""
): CompareTreemapLayout {
  const union = buildUnion(rows, rootPath);
  const larger = (row: FileRow) => Math.max(locOf(sideMetrics(row, "base")), locOf(sideMetrics(row, "head")));
  // Every changed file must stay visible, so tiny files get a floor relative
  // to the whole view instead of rounding away to nothing.
  const weightOf = (loc: number) => Math.sqrt(Math.max(loc, MIN_WEIGHT));
  const total = rows.reduce((sum, r) => sum + weightOf(larger(r)), 0);
  const floor = Math.max(weightOf(0), total * MIN_SHARE);
  const hierarchy = d3
    .hierarchy<UnionNode>(union, (n) => n.children)
    .sum((n) => (n.file ? Math.max(weightOf(larger(n.file)), floor) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.data.path.localeCompare(b.data.path));

  const root = d3
    .treemap<UnionNode>()
    .size([size.width, size.height])
    .paddingOuter(3)
    // Small folders give up their label strip so their files stay visible.
    .paddingTop((n) => (n.depth === 0 ? 3 : hasHeader(n) ? FOLDER_HEADER : 2))
    .paddingInner(2)
    .round(true)
    .tile(d3.treemapBinary)(hierarchy);

  const files: FileTile[] = [];
  const folders: FolderTile[] = [];
  for (const node of root.descendants()) {
    const rect = { x0: node.x0, y0: node.y0, x1: node.x1, y1: node.y1 };
    const row = node.data.file;
    if (!row) {
      if (node.depth > 0)
        folders.push({ kind: "folder", path: node.data.path, name: node.data.name, rect, depth: node.depth, header: hasHeader(rect) });
      continue;
    }
    const tileLoc = Math.max(larger(row), MIN_WEIGHT);
    const side = (name: SideName): TileSide | null => {
      const status = row.change?.status;
      if ((name === "base" && status === "added") || (name === "head" && status === "removed")) return null;
      const metrics = sideMetrics(row, name) ?? {};
      const loc = locOf(metrics);
      // Fill = this side's share of the larger side's LOC.
      return { loc, metrics, fill: fillRect(rect, Math.max(loc, MIN_WEIGHT) / tileLoc) };
    };
    files.push({
      kind: "file",
      path: row.path,
      name: row.name,
      rect,
      status: row.change?.status ?? "unchanged",
      change: row.change,
      sides: { base: side("base"), head: side("head") },
    });
  }
  return { files, folders };
}

/** The selected metric's delta on a tile, when the file changed. */
export function tileDelta(tile: FileTile, metric: string): MetricDelta | undefined {
  return tile.change?.deltas[metric];
}
