import type * as d3 from "d3";

export type TreemapTile = d3.HierarchyRectangularNode<any>;
export type TileHitIndex = Map<number, TreemapTile[]>;

const HIT_CELL_SIZE = 16;

export function getVisibleTiles(
  nodes: TreemapTile[],
  width: number,
  height: number,
  minSize: number
): TreemapTile[] {
  return nodes.filter((node) => {
    const nodeWidth = node.x1 - node.x0;
    const nodeHeight = node.y1 - node.y0;
    return (
      nodeWidth >= minSize &&
      nodeHeight >= minSize &&
      node.x1 > 0 &&
      node.y1 > 0 &&
      node.x0 < width &&
      node.y0 < height
    );
  });
}

export function buildTileHitIndex(
  nodes: TreemapTile[],
  width: number,
  height: number
): TileHitIndex {
  const index: TileHitIndex = new Map();
  const columns = Math.ceil(width / HIT_CELL_SIZE);

  for (const node of nodes) {
    if (node.depth === 0) continue;
    const minX = Math.max(0, Math.floor(node.x0 / HIT_CELL_SIZE));
    const maxX = Math.min(columns - 1, Math.floor((node.x1 - 1) / HIT_CELL_SIZE));
    const minY = Math.max(0, Math.floor(node.y0 / HIT_CELL_SIZE));
    const maxY = Math.min(
      Math.ceil(height / HIT_CELL_SIZE) - 1,
      Math.floor((node.y1 - 1) / HIT_CELL_SIZE)
    );

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = y * columns + x;
        const candidates = index.get(key);
        if (candidates) candidates.push(node);
        else index.set(key, [node]);
      }
    }
  }

  for (const candidates of index.values()) {
    candidates.sort((a, b) => b.depth - a.depth);
  }
  return index;
}

export function findTileAt(
  index: TileHitIndex,
  x: number,
  y: number,
  width: number
): TreemapTile | null {
  const columns = Math.ceil(width / HIT_CELL_SIZE);
  const candidates = index.get(
    Math.floor(y / HIT_CELL_SIZE) * columns + Math.floor(x / HIT_CELL_SIZE)
  );
  if (!candidates) return null;

  return (
    candidates.find(
      (node) => x >= node.x0 && x < node.x1 && y >= node.y0 && y < node.y1
    ) ?? null
  );
}
