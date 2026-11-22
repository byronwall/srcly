import { describe, expect, it } from "vitest";
import { parseLocation, toSearch } from "../navigation/location";
import { ADDED_FILL, tileLook } from "./colors";
import { folderLabel } from "./labels";
import { bandRect, flooredWeights, layoutEdits, MIN_TILE_AREA, MIN_TILE_SIDE } from "./layout";
import { samplePayload } from "./sample";
import type { LensChunk } from "./types";
import { DEFAULT_LENS, parseLens, serializeLens, type LensState } from "./urlState";

const chunk = (over: Partial<LensChunk>): LensChunk => ({
  id: "a.ts::f",
  path: "a.ts",
  kind: "function",
  name: "f",
  startLine: 1,
  endLine: 9,
  status: "modified",
  match: "exact",
  added: 1,
  deleted: 0,
  netAdded: 1,
  netDeleted: 0,
  touches: [],
  firstTouched: null,
  lastTouched: null,
  metrics: { complexity: { before: 4, after: 9 } },
  measured: true,
  buckets: [],
  fileClass: "code",
  hunks: [],
  ...over,
});

const area = (r: { x0: number; y0: number; x1: number; y1: number }) => (r.x1 - r.x0) * (r.y1 - r.y0);

describe("only-edits packing", () => {
  it("raises small values to one floor and leaves large ones alone", () => {
    const w = flooredWeights([1, 1, 2000], 100_000, 1_000);
    expect(w[2]).toBe(2000);
    expect(w[0]).toBe(w[1]);
    // The floor is 1% of the total it helps make: 2000 / 98.
    expect(w[0]).toBeCloseTo(2000 / 98, 3);
  });

  it("gives every weight the same share when the floors do not all fit", () => {
    expect(flooredWeights([1, 5, 400], 3_000, 1_500)).toEqual([400, 400, 400]);
  });

  it("keeps a one-line edit clickable beside a 2,000-line one, in the same file", () => {
    const big = chunk({ id: "src/worker.ts::retryJob", path: "src/worker.ts", name: "retryJob", added: 1500, deleted: 500 });
    const small = chunk({ id: "src/worker.ts::parseArgs", path: "src/worker.ts", name: "parseArgs", added: 1, deleted: 0 });
    const other = chunk({ id: "docs/a.md::## Use", path: "docs/a.md", name: "## Use", added: 1, deleted: 1 });
    const layout = layoutEdits([big, small, other], { width: 1000, height: 600 });
    const tile = (id: string) => layout.chunks.find((t) => t.chunk.id === id)!;
    for (const t of layout.chunks) {
      expect(area(t.rect)).toBeGreaterThan(MIN_TILE_AREA * 0.6);
      expect(Math.min(t.rect.x1 - t.rect.x0, t.rect.y1 - t.rect.y0)).toBeGreaterThanOrEqual(MIN_TILE_SIDE);
    }
    expect(area(tile(big.id).rect)).toBeGreaterThan(area(tile(small.id).rect) * 20);
    expect(layout.groups.map((g) => `${g.kind}:${g.path}`).sort()).toEqual(["file:docs/a.md", "file:src/worker.ts", "folder:docs", "folder:src"]);
  });

  it("collapses a group in place and zooms to a scope", () => {
    const chunks = samplePayload({ path: "/repo", window: "branch", mode: "touched" }).chunks;
    const size = { width: 1200, height: 700 };
    const open = layoutEdits(chunks, size);
    const folded = layoutEdits(chunks, size, "", new Set(["server/tests"]));
    const rect = (l: typeof open, path: string) => l.groups.find((g) => g.path === path)!.rect;
    expect(rect(folded, "server/tests")).toEqual(rect(open, "server/tests"));
    expect(rect(folded, "client/src")).toEqual(rect(open, "client/src"));
    expect(folded.chunks.some((t) => t.chunk.path.startsWith("server/tests/"))).toBe(false);
    expect(folded.groups.find((g) => g.path === "server/tests")!.chunkIds.length).toBeGreaterThan(3);

    const zoomed = layoutEdits(chunks, size, "server/app/routers");
    expect(new Set(zoomed.chunks.map((t) => t.chunk.path))).toEqual(new Set(["server/app/routers/scans.py"]));
  });

  it("places a band by its lines and keeps a one-line band visible", () => {
    const tile = { x0: 0, y0: 0, x1: 100, y1: 204 };
    expect(bandRect(tile, 101, 150, 200)).toEqual({ x0: 2, y0: 102, x1: 98, y1: 152 });
    const thin = bandRect(tile, 2000, 2000, 2000);
    expect(thin.y1 - thin.y0).toBe(4);
    expect(thin.y1).toBe(202);
  });
});

describe("folder labels", () => {
  it("reads like `5 edited / 43 files · mostly tests`", () => {
    expect(folderLabel({ edited: 5, total: 43, classes: ["test", "test", "test", "code", "docs"] })).toBe("5 edited / 43 files · mostly tests");
  });
  it("names no class for code, or without a majority", () => {
    expect(folderLabel({ edited: 3, total: 60, classes: ["code", "code", "test"] })).toBe("3 edited / 60 files");
    expect(folderLabel({ edited: 2, total: 9, classes: ["test", "docs"] })).toBe("2 edited / 9 files");
  });
  it("leaves the total out when the scan does not know it", () => {
    expect(folderLabel({ edited: 1, total: null, classes: ["config"] })).toBe("1 edited · mostly config");
    expect(folderLabel({ edited: 1, total: 1, classes: ["code"] })).toBe("1 edited / 1 file");
  });
});

describe("URL state", () => {
  const state: LensState = { ...DEFAULT_LENS, window: "custom", mode: "net", layout: "repo", commit: "WORKTREE", chunk: "src/a b.ts::Foo.bar", base: "main", head: "feat/x", since: "2026-11-19T00:00:00.000Z", until: "", metric: "loc", color: "now" };

  it("survives the trip through the location's query string", () => {
    const search = toSearch({ repo: "/r", at: "src", view: "changes", changes: serializeLens(state) }, "?compare=a..b");
    const loc = parseLocation(search);
    expect(loc.view).toBe("changes");
    expect(parseLens(loc.changes)).toEqual(state);
    expect(new URLSearchParams(search).get("compare")).toBe("a..b");
  });

  it("keeps the default view a bare URL and drops its parameters in other views", () => {
    expect(serializeLens(DEFAULT_LENS)).toBe("");
    expect(parseLens(undefined)).toEqual(DEFAULT_LENS);
    expect(toSearch({ repo: "/r", at: "", view: "treemap", changes: serializeLens(state) }, "?cw=7d&cs=x")).toBe("?repo=%2Fr");
  });

  it("ignores custom refs outside a custom window, and unknown values", () => {
    expect(parseLens("cw=7d&cbase=main&cm=sideways&cl=grid&clens=sideways")).toEqual({ ...DEFAULT_LENS, window: "7d" });
  });
});

describe("tile state under a lens", () => {
  const delta = { metric: "complexity", color: "delta" } as const;
  const now = { metric: "complexity", color: "now" } as const;

  it("colors a modified chunk by its value or its change", () => {
    expect(tileLook(chunk({}), delta)).toMatchObject({ state: "value", value: 5 });
    expect(tileLook(chunk({}), now)).toMatchObject({ state: "value", value: 9 });
    // A pure rename is a move with no change, not an improvement.
    expect(tileLook(chunk({ status: "moved", match: "renamed-file", metrics: { complexity: { before: 5, after: 5 } } }), delta)).toMatchObject({ state: "moved", value: 0 });
  });

  it("gives an added chunk its own fill in a delta lens and its value in a now lens", () => {
    const added = chunk({ status: "added", match: "none", metrics: { complexity: { before: null, after: 12 } } });
    expect(tileLook(added, delta)).toEqual({ state: "added", fill: ADDED_FILL, value: null });
    expect(tileLook(added, now)).toMatchObject({ state: "added", value: 12 });
  });

  it("never draws a missing value as a number", () => {
    const cases = [
      chunk({ measured: false, metrics: {}, naReason: "config" }),
      chunk({ metrics: { loc: { before: 3, after: 4 } } }), // measured, but not for this metric
      chunk({ match: "uncertain", metrics: { complexity: { before: null, after: 4 } } }),
    ];
    for (const c of cases) expect(tileLook(c, delta)).toMatchObject({ state: "not-measured", value: null });
    expect(tileLook(chunk({ status: "deleted", metrics: { complexity: { before: 4, after: null } } }), now)).toMatchObject({ state: "deleted", value: null });
    expect(tileLook(chunk({ status: "reverted", metrics: { complexity: { before: 2, after: 2 } } }), delta)).toMatchObject({ state: "reverted", value: null });
  });
});

describe("the sample payload", () => {
  it("covers every status, kind and match, and drops reverted work in net mode", () => {
    const touched = samplePayload({ path: "/repo", window: "branch", mode: "touched" });
    const all = <K extends keyof LensChunk>(key: K) => [...new Set(touched.chunks.map((c) => c[key]))].sort();
    expect(all("status")).toEqual(["added", "deleted", "modified", "moved", "reverted"]);
    expect(all("kind")).toEqual(["class", "file", "function", "heading", "range"]);
    expect(all("match")).toEqual(["exact", "moved", "none", "renamed-file", "uncertain"]);
    const net = samplePayload({ path: "/repo", window: "branch", mode: "net" });
    expect(net.chunks.some((c) => c.status === "reverted")).toBe(false);
    expect(net.chunks.every((c) => c.touches.length === 0)).toBe(true);
  });
});
