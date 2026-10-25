import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.route-graph.json";
import type { RouteGraphResult } from "../../../dataflow/contract.generated";
import type { ViewEdge } from "../viewModel";
import { routeGraphToViewModel } from "./adapter";
import { reachFrom } from "./reach";

const graph = fixture as unknown as RouteGraphResult;
const { vm, notFlow } = routeGraphToViewModel(graph);
const id = (label: string) => vm.nodes.find((n) => n.label === label)!.id;
const labels = (ids: Set<string>) => [...ids].map((i) => vm.nodes.find((n) => n.id === i)?.label).sort();
const reach = (seed: string, mode?: "both" | "up" | "down", edges = vm.edges) => reachFrom({ edges }, seed, mode, { exclude: notFlow });

describe("reach from a box", () => {
  it("lights the render chain above a component strongly and what it renders lightly", () => {
    const r = reach(id("RecordTable"));
    expect(labels(r.strong.nodes)).toEqual(expect.arrayContaining(["/records", "RouteFrame", "Show", "RecordTable"]));
    // In `both`, the seed's own render edges are strong too: its direct children.
    expect(labels(r.strong.nodes)).toContain("Records");
    expect(labels(r.light.nodes)).toContain("RecordRow");
    expect(r.light.nodes.has(id("ViewerCard"))).toBe(false);
    expect(r.strong.nodes.has(id("ViewerCard"))).toBe(false);
    expect(r.counts.up).toBe(3);
    expect(r.counts.down).toBeGreaterThan(2);
  });

  it("follows a handoff upstream to the origin that is proven to reach a box", () => {
    const r = reach(id("ViewerCard"), "up");
    expect(labels(r.strong.nodes)).toContain("createResource(loadViewer)");
    expect(r.light.nodes.size).toBe(0);
    // The route owns the origin but nothing flows from the route into it.
    expect(r.strong.edges.size).toBe(r.counts.up);
  });

  it("walks only downstream in `down`, with nothing above an origin", () => {
    const r = reach(id("createResource(loadViewer)"), "down");
    expect(r.strong.nodes).toEqual(new Set([id("createResource(loadViewer)")]));
    expect(labels(r.light.nodes)).toContain("ViewerCard");
    expect(r.counts.up).toBe(0);
    expect(reach(id("createResource(loadViewer)"), "up").counts.up).toBe(0);
  });

  it("stops at a non-proven edge and names the box beyond it a frontier", () => {
    const partial: ViewEdge = { id: "handoff:x", source: id("fetch(\"/records.json\")"), target: id("RecordTable"), weight: 1, faint: true, symbols: [], style: "handoff" };
    const r = reach(id("RecordTable"), "up", [...vm.edges, partial]);
    expect(r.frontier.has(id("fetch(\"/records.json\")"))).toBe(true);
    expect(r.strong.nodes.has(id("fetch(\"/records.json\")"))).toBe(false);
    expect(r.strong.edges.has("handoff:x")).toBe(false);
    expect(r.counts.frontier).toBe(1);
  });

  it("never keeps a box in two tiers", () => {
    for (const n of vm.nodes) {
      const r = reach(n.id);
      for (const l of r.light.nodes) expect(r.strong.nodes.has(l)).toBe(false);
      for (const f of r.frontier) expect(r.strong.nodes.has(f) || r.light.nodes.has(f)).toBe(false);
    }
  });
});
