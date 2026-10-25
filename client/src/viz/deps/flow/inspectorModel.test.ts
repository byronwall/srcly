import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.route-graph.json";
import type { RouteGraphResult } from "../../../dataflow/contract.generated";
import { routeGraphToViewModel } from "./adapter";
import { nodeDetails, routeOverview } from "./inspectorModel";

const graph = fixture as unknown as RouteGraphResult;
const m = routeGraphToViewModel(graph);
const id = (label: string) => m.vm.nodes.find((n) => n.label === label)!.id;

describe("route overview", () => {
  it("sums the route up: counts, gaps with locations, origins with how many sites each reaches", () => {
    const o = routeOverview(graph, m, "/root");
    expect(o.pathPattern).toBe("/records");
    expect(o.counts).toMatchObject({ occurrences: 7, boundaries: 3, terminals: 18, origins: 4, handoffs: 3, folded: 0 });
    expect(o.gaps.length).toBe(graph.gaps.length);
    for (const g of o.gaps) expect(g.reason).toBeTruthy();
    const viewer = o.origins.find((x) => x.label === "createResource(loadViewer)")!;
    expect(viewer.reaches).toBe(3);
    expect(viewer.roles).toBe("resource");
    expect(o.origins.find((x) => x.label.startsWith("fetch"))!.roles).toContain("fetch");
  });
});

describe("node details", () => {
  it("lists what renders a component, what it renders, and what is inside its frame", () => {
    const d = nodeDetails(m, id("RecordTable"))!;
    expect(d.mark).toBe("component");
    expect(d.detail).toBe("RecordTable.tsx");
    expect(d.flowsIn.map((r) => `${r.kind} ${r.label}`)).toEqual(["rendered by Show"]);
    expect(d.flowsOut.map((r) => r.label).sort()).toEqual(["Records", "Show"]);
    expect(d.flowsOut.every((r) => r.kind === "renders")).toBe(true);
    expect(d.inside.shown).toBe(2);
    expect(d.inside.hidden).toBe(0);
  });

  it("shows a handoff into a component from its origin, with the proof status", () => {
    const d = nodeDetails(m, id("ViewerCard"))!;
    const handoff = d.flowsIn.find((r) => r.kind === "handoff")!;
    expect(handoff.label).toBe("createResource(loadViewer)");
    expect(handoff.mark).toBe("origin");
    expect(handoff.status).toBe("proven");
  });

  it("gives an origin no upstream and its handoffs downstream", () => {
    const d = nodeDetails(m, id("createResource(loadViewer)"))!;
    expect(d.flowsIn).toEqual([]);
    expect(d.flowsOut.every((r) => r.kind === "handoff")).toBe(true);
    expect(d.flowsOut.length).toBe(3);
  });

  it("counts what a folded frame hides", () => {
    const small = routeGraphToViewModel(graph, { budget: 8 });
    const folded = small.vm.nodes.find((n) => n.expandable)!;
    const d = nodeDetails(small, folded.id)!;
    expect(d.inside.hidden).toBeGreaterThan(0);
    expect(d.inside.shown).toBe(0);
  });

  it("is null for a box that is not drawn", () => {
    const small = routeGraphToViewModel(graph, { budget: 8 });
    const hiddenLeaf = graph.nodes.find((n) => !small.vm.nodes.some((v) => v.id === n.id))!;
    expect(nodeDetails(small, hiddenLeaf.id)).toBeNull();
  });
});
