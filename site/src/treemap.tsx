import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3-hierarchy';
import { For } from 'solid-js';
import tree from './data/tree.json';
import catalog from './data/catalog.json';

/**
 * One node of `data/tree.json`: name, LOC, then max complexity (c), commits in 90 days (m)
 * and findings (f). An absent value is N/A. Folders have children (k).
 */
export type TreeNode = { n: string; l: number; c?: number; m?: number; f?: number; k?: TreeNode[] };
export const sourceTree = tree as TreeNode;

/** The signals the page can color by, with the catalog's stops and rollup. */
export type MapMetric = { key: 'c' | 'm' | 'f'; id: string; label: string; unit: string; domain: [number, number, number]; perFile: boolean };
export const MAP_METRICS: MapMetric[] = ([['c', 'complexity', 'CCN'], ['m', 'commit_count', 'commits'], ['f', 'finding_count', 'findings']] as const).map(([key, id, unit]) => {
  const def = catalog.metrics.find(metric => metric.id === id)!;
  return { key, id, label: id === 'complexity' ? 'Complexity' : def.label, unit, domain: def.color_domain as [number, number, number], perFile: def.color_per_file };
});

/**
 * Srcly's attention ramp (client/src/viz/treemap/utils/colors.ts, TREEMAP_RAMP), sampled at
 * 17 points with the app's Lab interpolation, so a tile here matches a tile in the app.
 */
const RAMP = ['#bfdbfe', '#cae0fb', '#d5e4f9', '#dfe9f6', '#e9eef3', '#f2e7cb', '#f7e0a4', '#fbda7b', '#fcd34d', '#fdc349', '#fdb344', '#fca340', '#fb923c', '#fb8a4b', '#fa8259', '#f97a65', '#f87171'];

/** Where a value sits on the ramp: the catalog's [fine, midpoint, look here] map to 0, 0.5 and 1. */
function rampPosition(value: number, [low, mid, high]: [number, number, number]) {
  if (value <= mid) return Math.max(0, (value - low) / (mid - low)) / 2;
  return Math.min(1, 0.5 + (value - mid) / (high - mid) / 2);
}
export function rampColor(value: number | undefined, domain: [number, number, number] = MAP_METRICS[0].domain) {
  return value === undefined ? undefined : RAMP[Math.round(rampPosition(value, domain) * 16)];
}

/** Find a folder or file by its repo path, such as `client/src/viz`. */
export function nodeAt(path: string): TreeNode | undefined {
  let node: TreeNode | undefined = sourceTree;
  for (const part of path.split('/').filter(Boolean)) node = node?.k?.find(child => child.n === part);
  return node;
}

export type Tile = { x: number; y: number; w: number; h: number; name: string; depth: number; folder: boolean; label: boolean; path: string; node: TreeNode; files: number };

/** A tile's color for a metric. A folder colors sums such as commits by their average per file, like the app. */
export function tileColor(tile: Tile, metric: MapMetric) {
  const value = tile.node[metric.key];
  if (value === undefined) return undefined;
  return rampColor(metric.perFile && tile.files > 1 ? value / tile.files : value, metric.domain);
}

/** Lay the tree out in a `width` × `height` box; tiles are in percent of that box. */
export function layout(width: number, height: number, maxDepth: number, from = ''): Tile[] {
  const root = hierarchy(nodeAt(from) ?? sourceTree, node => node.k?.length ? node.k : undefined)
    .sum(node => (node.k?.length ? 0 : node.l))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const laid = treemap<TreeNode>().tile(treemapSquarify.ratio(1.2)).size([width, height]).round(false)
    .paddingOuter(2).paddingInner(1)
    .paddingTop(node => (node.depth > 0 && node.depth < maxDepth && (node.x1 - node.x0) > 56 && (node.y1 - node.y0) > 44 ? 17 : 2))(root);
  const tiles: Tile[] = [];
  const fits = (node: HierarchyRectangularNode<TreeNode>) => node.depth <= maxDepth && node.x1 - node.x0 >= 3 && node.y1 - node.y0 >= 3;
  const visit = (node: HierarchyRectangularNode<TreeNode>) => {
    if (!fits(node)) return;
    const w = node.x1 - node.x0;
    const h = node.y1 - node.y0;
    // A folder whose children are all too small to draw is filled like a file.
    const open = !!node.children?.some(fits);
    if (node.depth > 0) {
      tiles.push({
        x: (node.x0 / width) * 100, y: (node.y0 / height) * 100, w: (w / width) * 100, h: (h / height) * 100,
        name: node.data.n, depth: node.depth, folder: open, node: node.data, files: node.leaves().length,
        label: w > 56 && h > (open ? 44 : 22),
        path: [from, ...node.ancestors().reverse().slice(1).map(item => item.data.n)].filter(Boolean).join('/'),
      });
    }
    node.children?.forEach(visit);
  };
  visit(laid);
  return tiles;
}

/**
 * A real treemap of Srcly's own source: area is LOC, color is the chosen metric, hatching is N/A.
 * Static HTML that the browser can recolor; `onHover` reports the tile under the pointer.
 */
export function SourceTreemap(props: { width: number; height: number; depth: number; root?: string; class?: string; metric?: () => MapMetric; onHover?: (tile: Tile | undefined) => void }) {
  const tiles = layout(props.width, props.height, props.depth, props.root);
  const metric = () => props.metric?.() ?? MAP_METRICS[0];
  const pick = (event: Event) => {
    const index = (event.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i;
    props.onHover?.(index === undefined ? undefined : tiles[Number(index)]);
  };
  return <div class={`source-treemap ${props.class ?? ''}`} style={{ 'aspect-ratio': `${props.width} / ${props.height}`, '--strip': String((17 / props.width) * 100) }}
    aria-hidden="true" onPointerOver={pick} onPointerDown={pick} onPointerLeave={() => props.onHover?.(undefined)}>
    <For each={tiles}>{(tile, i) => <div
      classList={{ tile: true, folder: tile.folder, na: tile.node[metric().key] === undefined }}
      style={{ left: `${tile.x}%`, top: `${tile.y}%`, width: `${tile.w}%`, height: `${tile.h}%`, '--fill': tileColor(tile, metric()) }}
      data-i={i()}
    >{tile.label ? <span>{tile.name}{tile.folder ? '/' : ''}</span> : null}</div>}</For>
  </div>;
}
