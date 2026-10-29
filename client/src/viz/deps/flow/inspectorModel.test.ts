import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.route-graph.json";
import type { RouteGraphResult } from "../../../dataflow/contract.generated";
import { routeGraphToViewModel } from "./adapter";
import anchorFixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.anchor-graph.json";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import { anchorGraphToViewModel } from "./anchorAdapter";
import { anchorOverview, groupGaps, markOfBox, nodeDetails, routeOverview } from "./inspectorModel";

const graph = fixture as unknown as RouteGraphResult;
const m = routeGraphToViewModel(graph);
const id = (label: string) => m.vm.nodes.find((n) => n.label === label)!.id;

describe("route overview", () => {
  it("sums the route up: counts, gaps with locations, origins with how many sites each reaches", () => {
    const o = routeOverview(graph, m, "/root");
    expect(o.pathPattern).toBe("/records");
    expect(o.counts).toMatchObject({ occurrences: 7, boundaries: 3, terminals: 18, origins: 4, handoffs: 3, folded: 0 });
    expect(o.gaps.reduce((a, g) => a + g.places.length, 0)).toBe(graph.gaps.length);
    for (const g of o.gaps) expect(g.title).toBeTruthy();
    const viewer = o.origins.find((x) => x.label === "createResource(loadViewer)")!;
    expect(viewer.reaches).toBe(3);
    expect(viewer.roles).toBe("resource");
    expect(o.origins.find((x) => x.label.startsWith("fetch"))!.roles).toContain("fetch");
  });
});

describe("route gaps", () => {
  const at = (file: string, line: number) => ({ file, line, column: 1, span: { startLine: line, startColumn: 1, endLine: line, endColumn: 2 } });
  it("says each kind of gap once, in plain words, with its count, names and places", () => {
    const gaps = [
      ...Array.from({ length: 3 }, (_, i) => ({ reason: "budget-exhausted", label: "Element limit reached before Text.", location: at("a.tsx", i + 1) })),
      { reason: "budget-exhausted", label: "Terminal limit reached before Text.", location: at("a.tsx", 9) },
      { reason: "external-code", label: "The Box definition is outside the route source scope.", location: at("b.tsx", 4) },
      { reason: "external-code", label: "The Stack definition is outside the route source scope.", location: at("b.tsx", 5) },
      { reason: "missing-provider", label: "No Provider occurrence reaches context consumer x.", location: null },
    ];
    const groups = groupGaps(gaps as RouteGraphResult["gaps"], "/root");
    expect(groups.map((g) => [g.title, g.places.length])).toEqual([
      ["Not drawn: past the size limit", 4],
      ["Library components, not opened", 2],
      ["No Provider occurrence reaches context consumer x.", 1],
    ]);
    expect(groups[1].names).toEqual(["Box", "Stack"]);
    expect(groups[1].places[0]).toEqual({ label: "Box", file: "b.tsx", absPath: "/root/b.tsx", line: 4 });
    expect(groups.every((g) => !/route source scope|compiler-backed/.test(g.title + g.hint))).toBe(true);
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


describe("anchor overview and details", () => {
  const anchorGraph = anchorFixture as unknown as AnchorGraphResult;
  const am = anchorGraphToViewModel(anchorGraph);

  it("sums an anchor graph up: the expression, its type, the direction, the counts, origins and terminals", () => {
    const o = anchorOverview(anchorGraph);
    expect(o.text).toBe("props.viewer?.name");
    expect(o.kind).toBe("property read");
    expect(o.direction).toBe("both");
    expect(o.counts.origins).toBe(o.origins.length);
    expect(o.origins.map((x) => x.label)).toContain("createResource(loadViewer)");
    expect(o.origins[0].roles).toBe("resource");
    expect(o.terminals.length).toBe(o.counts.terminals);
    expect(o.coverage.budget.limit).toBeGreaterThan(0);
  });

  it("lists where the trace stops, grouped by reason in plain words, the most common first", () => {
    expect(anchorOverview(anchorGraph).stops).toEqual([]);
    const at = anchorGraph.nodes.find((n) => n.kind === "anchor")!;
    const stop = (id: string, label: string, reason: string) => ({ ...at, id, kind: "frontier" as const, label, reason, line: 9 });
    const o = anchorOverview({ ...anchorGraph, nodes: [...anchorGraph.nodes, stop("f1", "size", "unbound-read"), stop("f2", "label", "unbound-read"), stop("f3", "Math.max", "external-code")] });
    expect(o.stops.map((g) => [g.word, g.rows.map((r) => r.label)])).toEqual([
      ["binding not traced", ["size", "label"]],
      ["external code", ["Math.max"]],
    ]);
    expect(o.stops[0].hint).toMatch(/not traced/);
    expect(o.stops[0].rows[0]).toMatchObject({ id: "f1", line: 9 });
  });

  it("lists the steps an assumed trace takes on trust, once per call, and the canvas marks those edges", () => {
    expect(anchorOverview(anchorGraph).assumed).toEqual([]);
    const [first, second, ...rest] = anchorGraph.edges;
    const location = { file: "src/routes/records.tsx", line: 12, column: 3, span: { startLine: 12, startColumn: 3, endLine: 12, endColumn: 20 } };
    const assumedProof = { kind: "external-call" as const, detail: "Assumed: name.trim has no source to read, so its value is taken to derive from this receiver.", locations: [location], status: "partial" as const };
    const edges = [{ ...first, status: "partial" as const, proof: [...first.proof, assumedProof] }, { ...second, status: "partial" as const, proof: [assumedProof] }, ...rest];
    const assumed = { ...anchorGraph, outcome: "assumed" as const, edges };
    const o = anchorOverview(assumed);
    expect(o.outcome).toBe("assumed");
    expect(o.assumed).toEqual([{ id: first.target, label: "name.trim", detail: assumedProof.detail, file: location.file, line: 12 }]);
    const view = anchorGraphToViewModel(assumed).vm.edges;
    expect(view.find((e) => e.id === first.id)?.assumed).toBe(true);
    expect(view.filter((e) => e.assumed).every((e) => e.id === first.id || e.id === second.id)).toBe(true);
    expect(anchorGraphToViewModel(anchorGraph).vm.edges.some((e) => e.assumed)).toBe(false);
  });

  it("details an anchor graph's box with the engine's kind words and its flows", () => {
    const anchor = anchorGraph.nodes.find((n) => n.kind === "anchor")!;
    const d = nodeDetails(am, anchor.id)!;
    expect(d.mark).toBe("anchor");
    expect(markOfBox(anchor)).toBe("anchor");
    expect(d.detail).toBe("property read");
    expect(d.flowsIn.length).toBeGreaterThan(0);
    expect(d.flowsOut.length).toBeGreaterThan(0);
    expect(d.inside).toEqual({ shown: 0, hidden: 0, wrappers: 0 });
    const origin = anchorGraph.nodes.find((n) => n.kind === "origin")!;
    expect(nodeDetails(am, origin.id)!.flowsIn).toEqual([]);
  });
});
