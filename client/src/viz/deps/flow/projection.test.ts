// Projection checks (from srcly#153): what the canvas draws and lights keeps
// each anchor's own witnesses. The graphs are the engine's real output for
// `two-call-identity-helper.tsx` and `returns-other-argument.tsx`
// (`engine/test/srcly/projection-fixtures.test.ts` writes them).
import { describe, expect, it } from "vitest";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import graphs from "./__fixtures__/projection-anchors.json";
import { anchorGraphToViewModel } from "./anchorAdapter";
import { anchorsToViewModel } from "./multiAnchorAdapter";
import { reachFrom } from "./reach";
import type { FlowViewModel } from "./adapter";

const [a, b, first, second] = graphs as unknown as AnchorGraphResult[];
const anchorOf = (graph: AnchorGraphResult) => graph.nodes.find((n) => n.kind === "anchor")!.id;
const terminalsOf = (graph: AnchorGraphResult) => graph.nodes.filter((n) => n.kind === "terminal").map((n) => n.id);
/** The terminals reach lights from one anchor's box. */
function reached(model: FlowViewModel, graph: AnchorGraphResult, all: AnchorGraphResult[]): string[] {
  const reach = reachFrom(model.vm, anchorOf(graph), "down");
  const ends = new Set(all.flatMap(terminalsOf));
  return [...reach.strong.nodes, ...reach.light.nodes].filter((id) => ends.has(id)).sort();
}

describe("merged anchors keep each trace's own witnesses", () => {
  it("PW01: two calls of one helper each reach only their own slot, alone and merged both ways", () => {
    expect(reached(anchorGraphToViewModel(a), a, [a, b])).toEqual(terminalsOf(a));
    expect(reached(anchorGraphToViewModel(b), b, [a, b])).toEqual(terminalsOf(b));
    for (const pair of [[a, b], [b, a]]) {
      const { model, shared } = anchorsToViewModel(pair);
      // The helper's boxes are drawn once, shared by both traces.
      expect(shared.size).toBeGreaterThan(0);
      expect(reached(model, a, [a, b])).toEqual(terminalsOf(a));
      expect(reached(model, b, [a, b])).toEqual(terminalsOf(b));
    }
  });

  it("PW03: the argument pick never returns still has no slot, merged with the one it returns", () => {
    const slot = terminalsOf(second);
    for (const pair of [[first, second], [second, first]]) {
      const { model } = anchorsToViewModel(pair);
      expect(reached(model, first, [first, second])).toEqual(terminalsOf(first));
      expect(reached(model, first, [first, second])).not.toContain(slot[0]);
      expect(reached(model, second, [first, second])).toEqual(slot);
    }
  });
});

describe("merged anchors walk each trace on its own witness", () => {
  const box = (id: string, kind = "value") =>
    ({ id, label: id, kind, elementKind: kind === "terminal" ? "render-terminal" : "call", side: "down", parent: null, file: "src/f.tsx", absPath: "/f.tsx", line: 1, span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 }, status: "proven", detail: null, note: null, reason: null }) as unknown as AnchorGraphResult["nodes"][number];
  const edge = (id: string, source: string, target: string, status: "proven" | "partial") => ({ id, source, target, kind: "references", status, proof: [], label: null });
  const trace = (text: string, nodes: AnchorGraphResult["nodes"], edges: ReturnType<typeof edge>[]) => ({ ...a, anchor: { ...a.anchor, text }, nodes, edges }) as unknown as AnchorGraphResult;
  // A proves x → y only partly and goes on to t; B proves x → y outright.
  const traceA = trace("a", [box("x", "anchor"), box("y"), box("t", "terminal")], [edge("e1", "x", "y", "partial"), edge("e2", "y", "t", "proven")]);
  const traceB = trace("b", [box("x", "anchor"), box("y")], [edge("e3", "x", "y", "proven")]);

  it("never lets one trace's proof carry another trace past its own stop", () => {
    for (const pair of [[traceA, traceB], [traceB, traceA]]) {
      const { model } = anchorsToViewModel(pair);
      const reach = reachFrom(model.vm, "x", "down");
      // B reaches y on its own proof; only A goes on to t, and A stops at y.
      expect(reach.light.nodes.has("t") || reach.strong.nodes.has("t")).toBe(false);
      expect([...reach.strong.nodes, ...reach.light.nodes]).toContain("y");
    }
  });

  it("gives every drawn edge its own id", () => {
    const { model } = anchorsToViewModel([traceA, traceB]);
    expect(new Set(model.vm.edges.map((e) => e.id)).size).toBe(model.vm.edges.length);
  });
});

describe("PW05: a folded reference still stands for its chain", () => {
  const box = (id: string, label: string, line: number, kind = "value", elementKind = "value") =>
    ({ id, label, kind, elementKind, side: "down", parent: null, file: "src/f.tsx", absPath: "/f.tsx", line, span: { startLine: line, startColumn: 1, endLine: line, endColumn: 2 }, status: "proven", detail: null, note: null, reason: null }) as unknown as AnchorGraphResult["nodes"][number];
  const proof = (kind: string) => ({ kind, detail: kind, status: "proven" as const, locations: [] });
  const graph = (status: "proven" | "partial") =>
    ({
      ...a,
      nodes: [box("v", "x", 1, "anchor"), box("r", "x", 2), box("t", "x", 3, "terminal", "render-terminal")],
      edges: [
        { id: "e1", source: "v", target: "r", kind: "references", status, proof: [proof("compiler-symbol")], label: null },
        { id: "e2", source: "r", target: "t", kind: "render-terminal", status: "proven", proof: [proof("jsx-tag")], label: null },
      ],
    }) as unknown as AnchorGraphResult;

  it("folds a proven reference and keeps its proof on the edge it leaves", () => {
    const { vm } = anchorGraphToViewModel(graph("proven"));
    expect(vm.nodes.map((n) => n.id)).not.toContain("r");
    const shown = vm.edges.find((e) => e.source === "v" && e.target === "t")!;
    expect(shown.proof?.map((p) => p.kind)).toEqual(["compiler-symbol", "jsx-tag"]);
  });

  it("keeps a partial reference drawn, so the path shows the step that is not proven", () => {
    const { vm } = anchorGraphToViewModel(graph("partial"));
    expect(vm.nodes.map((n) => n.id)).toContain("r");
    expect(vm.edges.find((e) => e.source === "v" && e.target === "r")?.faint).toBe(true);
  });
});
