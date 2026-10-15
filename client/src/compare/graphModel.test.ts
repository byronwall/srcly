import { describe, expect, it } from "vitest";
import type { DependencyGraphContract } from "../viz/deps/contract";
import { countNodeCrossings } from "../viz/deps/geometry";
import { layoutViewSync } from "../viz/deps/layout";
import { buildCompareGraph, DEFAULT_GRAPH_OPTIONS, edgeStateOn } from "./graphModel";
import type { CompareFile, ComparePayload } from "./types";

function graph(files: string[], edges: [string, string][], tests: string[] = []): DependencyGraphContract {
  return {
    root: "",
    nodes: [
      { id: "", kind: "folder", name: "root", parent: null },
      ...files.map((f) => ({ id: f, kind: "file" as const, name: f, parent: "", isTest: tests.includes(f) })),
      { id: "src/hub.ts#use", kind: "symbol", name: "use", parent: "src/hub.ts" },
    ],
    edges: edges.map(([source, target]) => ({ source, target })),
  };
}

const file = (path: string, status: CompareFile["status"], oldPath?: string): CompareFile => ({
  path,
  status,
  oldPath,
  additions: 1,
  deletions: 1,
  analyzed: true,
  before: null,
  after: null,
  deltas: {},
});

function payload(files: CompareFile[], base: DependencyGraphContract, head: DependencyGraphContract): ComparePayload {
  return {
    format: 1,
    repo: { root: "/r", name: "r" },
    base: { ref: "a", sha: "a", label: "a", subject: "", filesTotal: 0, scanSeconds: 0, cached: true },
    head: { ref: "b", sha: "b", label: "b", subject: "", filesTotal: 0, scanSeconds: 0, cached: true },
    metrics: [],
    files,
    edges: { added: [], removed: [] },
    summary: {} as ComparePayload["summary"],
    graphs: { base, head },
  };
}

const users = Array.from({ length: 8 }, (_, i) => `app/user${i}.ts`);

describe("compare graph model", () => {
  const base = graph(
    ["src/a.ts", "src/b.ts", "src/old.ts", "src/hub.ts", "lib/dep.ts", "src/a.test.ts", ...users],
    [
      ["src/a.ts", "src/old.ts"],
      ["src/a.ts", "lib/dep.ts"],
      ["src/a.test.ts", "src/a.ts"],
      ...users.map((u) => [u, "src/hub.ts#use"] as [string, string]),
    ],
    ["src/a.test.ts"]
  );
  const head = graph(
    ["src/a.ts", "src/b.ts", "src/new.ts", "src/hub.ts", "lib/dep.ts", "src/a.test.ts", ...users],
    [
      ["src/a.ts", "src/new.ts"],
      ["src/a.ts", "lib/dep.ts"],
      ["src/b.ts", "src/a.ts"],
      ["src/a.test.ts", "src/a.ts"],
      ...users.map((u) => [u, "src/hub.ts"] as [string, string]),
    ],
    ["src/a.test.ts"]
  );
  const p = payload(
    [file("src/a.ts", "modified"), file("src/new.ts", "renamed", "src/old.ts"), file("src/b.ts", "modified"), file("src/hub.ts", "modified")],
    base,
    head
  );
  const model = buildCompareGraph(p);
  const node = (title: string) => model.vm.nodes.find((n) => n.title === title)!;
  const edge = (s: string, t: string) => model.vm.edges.find((e) => e.id === `${node(s).id}->${node(t).id}`);

  it("puts changed files in the center and unchanged neighbors on the sides", () => {
    expect(node("src/a.ts").region).toBe("center");
    expect(node("lib/dep.ts").region).toBe("out");
    // Unchanged tests stay hidden by default.
    expect(model.vm.nodes.some((n) => n.title === "src/a.test.ts")).toBe(false);
  });

  it("follows renames so a moved import is unchanged, and marks added edges", () => {
    const moved = edge("src/a.ts", "src/new.ts")!;
    expect(model.edgeCounts.get(moved.id)).toEqual({ both: 1, base: 0, head: 0 });
    const added = edge("src/b.ts", "src/a.ts")!;
    expect(edgeStateOn(model.edgeCounts.get(added.id)!, "head")).toBe("added");
    expect(edgeStateOn(model.edgeCounts.get(added.id)!, "base")).toBe("hidden");
  });

  it("folds many unchanged importers of one changed file into a 'used by' node", () => {
    expect(model.hubbed).toBe(8);
    const hub = model.vm.nodes.find((n) => n.graphId === "usedby:src/hub.ts")!;
    expect(hub).toMatchObject({ region: "in", memberCount: 8, label: "8 files" });
    expect(model.vm.nodes.filter((n) => n.title.startsWith("app/user"))).toHaveLength(0);
  });

  it("rolls neighbors up by folder past the side budget", () => {
    const tight = buildCompareGraph(p, { ...DEFAULT_GRAPH_OPTIONS, hubThreshold: 99, maxSide: 2 });
    const left = tight.vm.nodes.filter((n) => n.region === "in");
    expect(left.length).toBeLessThanOrEqual(2);
    expect(left.some((n) => n.kind === "folder" && n.memberCount === 8)).toBe(true);
  });

  it("keeps rolling up past levels where nothing merges", () => {
    const deps = ["a/x/one.ts", "b/y/two.ts", "c/z/three.ts", "a/q/four.ts"];
    const g = graph(["src/a.ts", ...deps], deps.map((d) => ["src/a.ts", d] as [string, string]));
    const m = buildCompareGraph(payload([file("src/a.ts", "modified")], g, g), { ...DEFAULT_GRAPH_OPTIONS, maxSide: 3 });
    const right = m.vm.nodes.filter((n) => n.region === "out");
    expect(right.map((n) => n.title).sort()).toEqual(["a", "b", "c"]);
  });

  it("disambiguates boxes that share a name", () => {
    const g = graph(["src/a.ts", "x/util.ts", "y/util.ts"], [["src/a.ts", "x/util.ts"], ["src/a.ts", "y/util.ts"]]);
    const m = buildCompareGraph(payload([file("src/a.ts", "modified")], g, g));
    expect(m.vm.nodes.filter((n) => n.region === "out").map((n) => n.label).sort()).toEqual(["x/util.ts", "y/util.ts"]);
  });

  it("lays out once with no edge passing through a box", () => {
    const layout = layoutViewSync(model.vm, { aspectRatio: 1.6 });
    expect(layout.nodes).toHaveLength(model.vm.nodes.length);
    expect(countNodeCrossings(layout.edges, layout.nodes).count).toBe(0);
  });
});
