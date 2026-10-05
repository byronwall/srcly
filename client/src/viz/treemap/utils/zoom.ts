import type { TreemapTile } from "./hitTest";

/** Map the old and new canvases through their shared hierarchy tile. */
export function zoomTransforms(
  previous: TreemapTile[],
  next: TreemapTile[],
  width: number,
  height: number
): { incoming: string; outgoing: string } | null {
  const oldPath = previous[0]?.data?.path;
  const newPath = next[0]?.data?.path;
  if (!oldPath || !newPath || oldPath === newPath || width <= 0 || height <= 0) return null;

  const target = previous.find((node) => node.data?.path === newPath);
  const origin = next.find((node) => node.data?.path === oldPath);
  const tile = target ?? origin;
  if (!tile) return null;
  const sx = (tile.x1 - tile.x0) / width;
  const sy = (tile.y1 - tile.y0) / height;
  if (sx <= 0 || sy <= 0) return null;

  const intoTile = `translate(${tile.x0}px, ${tile.y0}px) scale(${sx}, ${sy})`;
  const fromTile = `translate(${-tile.x0 / sx}px, ${-tile.y0 / sy}px) scale(${1 / sx}, ${1 / sy})`;
  return target
    ? { incoming: intoTile, outgoing: fromTile }
    : { incoming: fromTile, outgoing: intoTile };
}
