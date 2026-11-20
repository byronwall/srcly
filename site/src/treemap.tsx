import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3-hierarchy';
import { For } from 'solid-js';
import tree from './data/tree.json';

/** One node of `data/tree.json`: name, LOC, max CCN (absent = N/A), children for folders. */
export type TreeNode = { n: string; l: number; c?: number; k?: TreeNode[] };
export const sourceTree = tree as TreeNode;

/**
 * Srcly's attention ramp (client/src/viz/treemap/utils/colors.ts, TREEMAP_RAMP), sampled at
 * 17 points with the app's Lab interpolation, so a tile here matches a tile in the app.
 */
const RAMP = ['#bfdbfe', '#cae0fb', '#d5e4f9', '#dfe9f6', '#e9eef3', '#f2e7cb', '#f7e0a4', '#fbda7b', '#fcd34d', '#fdc349', '#fdb344', '#fca340', '#fb923c', '#fb8a4b', '#fa8259', '#f97a65', '#f87171'];

/** Complexity's catalog stops: 0 is fine, 10 the midpoint, 50 needs attention. */
export function rampPosition(ccn: number) {
  return ccn <= 10 ? Math.max(0, ccn) / 20 : Math.min(1, 0.5 + (ccn - 10) / 80);
}
export function rampColor(ccn: number | undefined) {
  return ccn === undefined ? undefined : RAMP[Math.round(rampPosition(ccn) * 16)];
}

/** Find a folder or file by its repo path, such as `client/src/viz`. */
export function nodeAt(path: string): TreeNode | undefined {
  let node: TreeNode | undefined = sourceTree;
  for (const part of path.split('/').filter(Boolean)) node = node?.k?.find(child => child.n === part);
  return node;
}

type Tile = { x: number; y: number; w: number; h: number; name: string; depth: number; folder: boolean; ccn?: number; label: boolean; path: string };

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
        name: node.data.n, depth: node.depth, folder: open, ccn: node.data.c,
        label: w > 56 && h > (open ? 44 : 22),
        path: node.ancestors().reverse().slice(1).map(item => item.data.n).join('/'),
      });
    }
    node.children?.forEach(visit);
  };
  visit(laid);
  return tiles;
}

/** A static, real treemap of Srcly's own source: area is LOC, color is max complexity, hatching is N/A. */
export function SourceTreemap(props: { width: number; height: number; depth: number; root?: string; class?: string }) {
  const tiles = layout(props.width, props.height, props.depth, props.root);
  return <div class={`source-treemap ${props.class ?? ''}`} style={{ 'aspect-ratio': `${props.width} / ${props.height}`, '--strip': String((17 / props.width) * 100) }} aria-hidden="true">
    <For each={tiles}>{tile => <div
      classList={{ tile: true, folder: tile.folder, na: tile.ccn === undefined }}
      style={{
        left: `${tile.x}%`, top: `${tile.y}%`, width: `${tile.w}%`, height: `${tile.h}%`,
        '--fill': rampColor(tile.ccn),
      }}
      data-path={tile.path}
    >{tile.label ? <span>{tile.name}{tile.folder ? '/' : ''}</span> : null}</div>}</For>
  </div>;
}
