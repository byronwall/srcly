import { describe, expect, it } from "vitest";
import type { DependencyGraphContract } from "./contract";
import { buildIndex } from "./hierarchy";
import { buildMetricsIndex, formatLoc, nodeMetrics, stripSegments, symbolMetrics, viewContents, viewMetrics, type MetricsNode } from "./metrics";
import { buildViewModel } from "./viewModel";

const ROOT = "/repo";
const tree: MetricsNode = {
  name: "repo",
  path: ROOT,
  type: "folder",
  metrics: { loc: 900, complexity: 12 },
  children: [
    {
      name: "server",
      path: `${ROOT}/server`,
      type: "folder",
      metrics: { loc: 840, complexity: 12 },
      children: [
        {
          name: "pipeline.py",
          path: `${ROOT}/server/pipeline.py`,
          type: "file",
          metrics: { loc: 640, complexity: 12 },
          children: [
            { name: "run", path: `${ROOT}/server/pipeline.py::run`, type: "function", metrics: { loc: 120, complexity: 9 } },
            { name: "Step (interface)", path: `${ROOT}/server/pipeline.py::Step (interface)`, type: "function", metrics: { loc: 14 } },
            { name: "(class) Runner", path: `${ROOT}/server/pipeline.py::(class) Runner`, type: "function", metrics: { loc: 60 } },
          ],
        },
        { name: "util.py", path: `${ROOT}/server/util.py`, type: "file", metrics: { loc: 200, complexity: 3 } },
      ],
    },
  ],
};

describe("treemap metrics join", () => {
  const index = buildMetricsIndex(tree);

  it("finds folders and files by absolute path", () => {
    expect(nodeMetrics(index, `${ROOT}/server/pipeline.py`)?.loc).toBe(640);
    expect(nodeMetrics(index, `${ROOT}/server`)?.loc).toBe(840);
  });

  it("misses paths the treemap doesn't have (filtered or excluded), and scopes", () => {
    expect(nodeMetrics(index, `${ROOT}/server/gone.py`)).toBeUndefined();
    expect(nodeMetrics(index, undefined)).toBeUndefined();
    expect(nodeMetrics(undefined, `${ROOT}/server/pipeline.py`)).toBeUndefined();
    expect(index.has(`${ROOT}/server/pipeline.py::run`)).toBe(false);
  });

  it("finds a symbol among its file's scopes, with or without a kind suffix", () => {
    expect(symbolMetrics(index, `${ROOT}/server/pipeline.py`, "run")?.loc).toBe(120);
    expect(symbolMetrics(index, `${ROOT}/server/pipeline.py`, "Step")?.loc).toBe(14);
    expect(symbolMetrics(index, `${ROOT}/server/pipeline.py`, "Runner")?.loc).toBe(60);
    expect(symbolMetrics(index, `${ROOT}/server/pipeline.py`, "missing")).toBeUndefined();
  });

  it("joins metrics onto view boxes, leaving unmatched boxes out", () => {
    const g: DependencyGraphContract = {
      root: "",
      nodes: [
        { id: "", kind: "folder", name: "repo", parent: null, absPath: ROOT },
        { id: "server", kind: "folder", name: "server", parent: "", path: "server", absPath: `${ROOT}/server` },
        { id: "server/pipeline.py", kind: "file", name: "pipeline.py", parent: "server", path: "server/pipeline.py", absPath: `${ROOT}/server/pipeline.py` },
        { id: "server/pipeline.py#run", kind: "symbol", name: "run", parent: "server/pipeline.py" },
        { id: "server/util.py", kind: "file", name: "util.py", parent: "server", path: "server/util.py", absPath: `${ROOT}/server/util.py` },
        { id: "server/new.py", kind: "file", name: "new.py", parent: "server", path: "server/new.py", absPath: `${ROOT}/server/new.py` },
      ],
      edges: [
        { source: "server/util.py", target: "server/pipeline.py#run" },
        { source: "server/new.py", target: "server/pipeline.py#run" },
      ],
    };
    const graph = buildIndex(g);
    const vm = buildViewModel(graph, { focusId: "server/pipeline.py", budget: 48 });
    const byLabel = (label: string) => vm.nodes.find((n) => n.label === label)!.id;
    const m = viewMetrics(graph, vm.nodes, index);
    expect(m.get(byLabel("run"))?.loc).toBe(120);
    expect(m.get(byLabel("util.py"))?.loc).toBe(200);
    expect(m.has(byLabel("new.py"))).toBe(false);
    expect(viewMetrics(graph, vm.nodes, undefined).size).toBe(0);
  });

  it("lists a folder box's children largest first, from the treemap", () => {
    const graph = buildIndex({
      root: "",
      nodes: [
        { id: "", kind: "folder", name: "repo", parent: null, absPath: ROOT },
        { id: "server", kind: "folder", name: "server", parent: "", path: "server", absPath: `${ROOT}/server` },
        { id: "server/util.py", kind: "file", name: "util.py", parent: "server", path: "server/util.py", absPath: `${ROOT}/server/util.py` },
        { id: "server/pipeline.py", kind: "file", name: "pipeline.py", parent: "server", path: "server/pipeline.py", absPath: `${ROOT}/server/pipeline.py` },
        { id: "client", kind: "folder", name: "client", parent: "", path: "client", absPath: `${ROOT}/client` },
        { id: "client/a.ts", kind: "file", name: "a.ts", parent: "client", path: "client/a.ts", absPath: `${ROOT}/client/a.ts` },
      ],
      edges: [
        { source: "client/a.ts", target: "server/util.py" },
        { source: "server/util.py", target: "server/pipeline.py" },
      ],
    });
    const vm = buildViewModel(graph, { focusId: "", budget: 2 });
    const contents = viewContents(graph, vm.nodes, index);
    const server = vm.nodes.find((n) => n.graphId === "server")!;
    expect(contents.get(server.id)?.map((c) => [c.name, c.loc])).toEqual([
      ["pipeline.py", 640],
      ["util.py", 200],
    ]);
    // Files and folders the treemap doesn't have get no contents.
    expect([...contents.keys()]).toEqual([server.id]);
  });

  it("splits a contents strip by LOC, folding slivers into one tail segment", () => {
    const item = (name: string, loc: number) => ({ name, kind: "file" as const, loc, metrics: {} });
    const segs = stripSegments([item("a", 600), item("b", 380), item("c", 10), item("d", 10)], 100);
    expect(segs.map((s) => [s.item?.name ?? `+${s.rest?.length}`, Math.round(s.x), Math.round(s.w)])).toEqual([
      ["a", 0, 60],
      ["b", 60, 38],
      ["+2", 98, 2],
    ]);
    expect(stripSegments([], 100)).toEqual([]);
  });

  it("formats LOC compactly", () => {
    expect(formatLoc(840)).toBe("840 LOC");
    expect(formatLoc(4100)).toBe("4.1k LOC");
    expect(formatLoc(4000)).toBe("4k LOC");
    expect(formatLoc(12345)).toBe("12k LOC");
  });
});
