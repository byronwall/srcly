import { describe, expect, it } from "vitest";
import * as d3 from "d3";
import {
  buildTileHitIndex,
  findTileAt,
  getVisibleTiles,
} from "./hitTest";

function makeTree() {
  const root = d3.hierarchy({
    name: "repo",
    type: "folder",
    children: [
      {
        name: "src",
        type: "folder",
        children: [
          { name: "App.tsx", type: "file", children: [] },
          { name: "tiny.ts", type: "file", children: [] },
        ],
      },
    ],
  });
  const [folder] = root.children!;
  const [app, tiny] = folder.children!;
  Object.assign(root, { x0: 0, y0: 0, x1: 100, y1: 80 });
  Object.assign(folder, { x0: 0, y0: 0, x1: 100, y1: 80 });
  Object.assign(app, { x0: 0, y0: 0, x1: 70, y1: 80 });
  Object.assign(tiny, { x0: 72, y0: 0, x1: 74, y1: 2 });
  return { root, folder, app, tiny };
}

describe("treemap canvas hit testing", () => {
  it("returns the deepest visible tile at a point", () => {
    const { root, folder, app } = makeTree();
    const tiles = getVisibleTiles(root.descendants() as any, 100, 80, 4);
    const index = buildTileHitIndex(tiles, 100, 80);

    expect(findTileAt(index, 20, 30, 100)).toBe(app);
    expect(findTileAt(index, 90, 30, 100)).toBe(folder);
  });

  it("culls tiles below the paint threshold", () => {
    const { root, app, tiny } = makeTree();
    const tiles = getVisibleTiles(root.descendants() as any, 100, 80, 4);
    const index = buildTileHitIndex(tiles, 100, 80);

    expect(tiles).not.toContain(tiny);
    expect(findTileAt(index, 73, 1, 100)).toBe(root.children![0]);
    expect(tiles).toContain(app);
  });
});
