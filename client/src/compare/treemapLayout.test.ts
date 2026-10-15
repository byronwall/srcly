import { describe, expect, it } from "vitest";
import { collectFiles } from "./rows";
import { fillRect, layoutCompareTreemap } from "./treemapLayout";
import type { CompareFile, TreeNode } from "./types";

const change = (path: string, status: CompareFile["status"], before: number | null, after: number | null): CompareFile => ({
  path,
  status,
  additions: 0,
  deletions: 0,
  analyzed: true,
  before: before === null ? null : { loc: before, complexity: 2 },
  after: after === null ? null : { loc: after, complexity: 5 },
  deltas: {},
});

const area = (r: { x0: number; y0: number; x1: number; y1: number }) => (r.x1 - r.x0) * (r.y1 - r.y0);

describe("compare treemap layout", () => {
  const rows = collectFiles(
    [
      change("src/grew.ts", "modified", 100, 400),
      change("src/new.ts", "added", null, 50),
      change("src/old.ts", "removed", 80, null),
      change("lib/empty.py", "added", null, 0),
    ],
    new Map<string, TreeNode>(),
    false
  );
  const layout = layoutCompareTreemap(rows, { width: 800, height: 500 });
  const tile = (path: string) => layout.files.find((f) => f.path === path)!;

  it("gives each file one tile, sized by its larger side (√LOC)", () => {
    expect(layout.files).toHaveLength(4);
    expect(area(tile("src/grew.ts").rect)).toBeGreaterThan(area(tile("src/old.ts").rect));
    // Zero-LOC files still get a (small) slot.
    expect(area(tile("lib/empty.py").rect)).toBeGreaterThan(0);
    expect(layout.folders.map((f) => f.path).sort()).toEqual(["lib", "src"]);
  });

  it("fills the tile to each side's own size and leaves absent sides empty", () => {
    const grew = tile("src/grew.ts");
    expect(grew.sides.head!.fill).toEqual(grew.rect);
    expect(area(grew.sides.base!.fill) / area(grew.rect)).toBeCloseTo(0.25, 1);
    expect(tile("src/new.ts").sides.base).toBeNull();
    expect(tile("src/old.ts").sides.head).toBeNull();
    expect(grew.sides.head!.metrics.complexity).toBe(5);
  });

  it("zooms into a folder", () => {
    const zoomed = layoutCompareTreemap(rows, { width: 800, height: 500 }, "src");
    expect(zoomed.files.map((f) => f.path).sort()).toEqual(["src/grew.ts", "src/new.ts", "src/old.ts"]);
  });

  it("fillRect keeps the corner and aspect", () => {
    expect(fillRect({ x0: 10, y0: 10, x1: 110, y1: 60 }, 0.25)).toEqual({ x0: 10, y0: 10, x1: 60, y1: 35 });
  });
});

describe("folder chains", () => {
  it("merge single-child folders into one labeled box", () => {
    const rows = collectFiles(
      [change("server/app/services/deps/a.py", "modified", 10, 20), change("server/app/run.py", "modified", 5, 5)],
      new Map<string, TreeNode>(),
      false
    );
    const { folders } = layoutCompareTreemap(rows, { width: 800, height: 500 });
    expect(folders.map((f) => f.name).sort()).toEqual(["server/app", "services/deps"]);
  });
});
