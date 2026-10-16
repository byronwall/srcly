import { describe, expect, it } from "vitest";
import { quadrantPresets } from "../../utils/metricsStore";
import {
  assignQuadrant,
  axisMax,
  buildPoints,
  forward,
  groupByQuadrant,
  inverse,
  logTicks,
  snapCutoff,
  unavailableReason,
  type QuadrantPreset,
  type ScatterNode,
} from "./quadrants";

const preset = (id: string): QuadrantPreset => {
  const found = quadrantPresets().find((p) => p.id === id);
  if (!found) throw new Error(`no preset ${id}`);
  return found;
};

const file = (name: string, metrics: Record<string, unknown>, children: ScatterNode[] = []): ScatterNode => ({
  name,
  path: `/r/${name}`,
  type: "file",
  metrics,
  children,
});
const fn = (name: string, metrics: Record<string, unknown>, kind = "function"): ScatterNode => ({
  name,
  path: `/r/a.tsx::${name}`,
  type: "function",
  kind,
  start_line: 1,
  metrics,
});
const root = (...children: ScatterNode[]): ScatterNode => ({ name: "r", path: "/r", type: "folder", metrics: {}, children });
const names = (points: { node: ScatterNode }[]) => points.map((p) => p.node.name);

describe("catalog presets", () => {
  it("serves the four presets with named quadrants and absolute cut-offs", () => {
    expect(quadrantPresets().map((p) => p.label)).toEqual(["Activity", "Blast radius", "Component weight", "Comment noise"]);
    const activity = preset("activity");
    expect([activity.x.id, activity.y.id]).toEqual(["complexity", "commit_count"]);
    expect(activity.quadrants.map((q) => q.name)).toEqual(["Hot mess", "Sleeping giant", "Busy, fine", "Quiet"]);
    expect(preset("blast_radius").quadrants[0].name).toBe("Load-bearing tangle");
    expect(preset("component_weight").cohorts).toEqual(["component"]);
    expect(preset("comment_noise").x.scale).toBe("linear");
  });
});

describe("assignQuadrant", () => {
  it("counts a value at the cut-off as high", () => {
    expect(assignQuadrant(10, 5, 10, 5)).toBe("high_both");
    expect(assignQuadrant(9.9, 5, 10, 5)).toBe("high_y");
    expect(assignQuadrant(10, 4.9, 10, 5)).toBe("high_x");
    expect(assignQuadrant(0, 0, 10, 5)).toBe("low_both");
  });
});

describe("buildPoints + groupByQuadrant", () => {
  it("plots measured files, counts N/A, and moves points with the cut-offs", () => {
    const tree = root(
      file("hot.ts", { complexity: 40, commit_count: 12 }),
      file("giant.ts", { complexity: 30, commit_count: 1 }),
      file("busy.ts", { complexity: 2, commit_count: 9 }),
      file("quiet.ts", { complexity: 0, commit_count: 0 }),
      file("doc.md", { complexity: null, commit_count: 3 }),
      file("new.ts", { complexity: 12 })
    );
    const { points, na } = buildPoints(tree, preset("activity"), "file", null);
    expect(na).toBe(2);
    const groups = groupByQuadrant(points, 10, 5);
    expect(names(groups.high_both)).toEqual(["hot.ts"]);
    expect(names(groups.high_x)).toEqual(["giant.ts"]);
    expect(names(groups.high_y)).toEqual(["busy.ts"]);
    expect(names(groups.low_both)).toEqual(["quiet.ts"]);

    // Dragging both cut-offs down to 1 pulls everything but the zero into "Hot mess".
    const dragged = groupByQuadrant(points, 1, 1);
    expect(names(dragged.high_both)).toEqual(["hot.ts", "giant.ts", "busy.ts"]);
  });

  it("sorts each quadrant furthest past the cut-offs first", () => {
    const tree = root(
      file("a.ts", { complexity: 11, commit_count: 6 }),
      file("b.ts", { complexity: 50, commit_count: 6 }),
      file("c.ts", { complexity: 20, commit_count: 30 })
    );
    const { points } = buildPoints(tree, preset("activity"), "file", null);
    expect(names(groupByQuadrant(points, 10, 5).high_both)).toEqual(["c.ts", "b.ts", "a.ts"]);
  });

  it("joins fan-in by absolute path for files only", () => {
    const tree = root(file("core.ts", { complexity: 15 }), file("leaf.ts", { complexity: 2 }), file("x.css", {}));
    const fanIn = new Map([["/r/core.ts", 9], ["/r/leaf.ts", 0]]);
    const { points, na } = buildPoints(tree, preset("blast_radius"), "file", fanIn);
    expect(na).toBe(1);
    const groups = groupByQuadrant(points, 10, 5);
    expect(names(groups.high_both)).toEqual(["core.ts"]);
    expect(names(groups.low_both)).toEqual(["leaf.ts"]);
  });

  it("plots components only for component weight", () => {
    const tree = root(
      file("a.tsx", { component_loc: 300, component_hook_count: 12 }, [
        fn("Dashboard", { component_loc: 300, component_hook_count: 12 }),
        fn("helper", { component_loc: null, complexity: 3 }),
        fn("Row", { component_loc: 20, component_hook_count: 0 }),
      ])
    );
    const { points } = buildPoints(tree, preset("component_weight"), "component", null);
    const groups = groupByQuadrant(points, 150, 5);
    expect(names(groups.high_both)).toEqual(["Dashboard"]);
    expect(names(groups.low_both)).toEqual(["Row"]);
  });

  it("derives comment ratio as comments per code line", () => {
    const tree = root(
      file("a.py", { loc: 20, comment_lines: 12, complexity: 2 }, [fn("explain", { loc: 10, comment_lines: 8, complexity: 1 })]),
      file("empty.py", { loc: 0, comment_lines: 4, complexity: 0 })
    );
    const files = buildPoints(tree, preset("comment_noise"), "file", null);
    expect(files.points.map((p) => p.x)).toEqual([0.6]);
    expect(files.na).toBe(1);
    const fns = buildPoints(tree, preset("comment_noise"), "function", null);
    expect(names(groupByQuadrant(fns.points, 0.15, 10).high_x)).toEqual(["explain"]);
  });
});

describe("unavailableReason", () => {
  it("names the missing data source", () => {
    expect(unavailableReason(preset("activity"), 0, { activity: { status: "na", reason: "Not a Git repository" }, fanIn: null }))
      .toBe("No Git history: Not a Git repository");
    expect(unavailableReason(preset("blast_radius"), 0, { fanIn: new Map() })).toMatch(/^No import graph/);
    expect(unavailableReason(preset("blast_radius"), 0, { fanIn: null, fanInLoading: true })).toBe("");
    expect(unavailableReason(preset("component_weight"), 0, { fanIn: null })).toMatch(/^No TSX components/);
    expect(unavailableReason(preset("activity"), 3, { fanIn: null })).toBe("");
  });
});

describe("scales and cut-offs", () => {
  it("log axis keeps zero and round-trips", () => {
    expect(forward("log", 0)).toBe(0);
    expect(inverse("log", forward("log", 99))).toBeCloseTo(99);
    expect(forward("linear", 0.4)).toBe(0.4);
  });

  it("axis max always clears the cut-off", () => {
    expect(axisMax([1, 2], 10)).toBe(20);
    expect(axisMax([1, 200], 10)).toBe(200);
  });

  it("log ticks step 1-2-5", () => {
    expect(logTicks(60)).toEqual([0, 1, 2, 5, 10, 20, 50]);
  });

  it("snaps dragged cut-offs to readable values", () => {
    expect(snapCutoff(preset("activity").x, 12.6)).toBe(13);
    expect(snapCutoff(preset("activity").x, 0.2)).toBe(1);
    expect(snapCutoff(preset("comment_noise").x, 0.2345)).toBe(0.23);
  });
});
