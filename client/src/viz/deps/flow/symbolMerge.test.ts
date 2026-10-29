import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/symbol-graph.anchor-graph.json";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import { anchorGraphToViewModel } from "./anchorAdapter";

// Captured from engine/examples/symbol-graph by `cd engine && pnpm capture-anchor-graph`:
// forward from the `/notes/[id]` route component, `NotePage`.
const graph = fixture as unknown as AnchorGraphResult;
const everyFrame = graph.nodes.filter((n) => n.kind === "scope").map((n) => n.id);
const symbols = anchorGraphToViewModel(graph, { expanded: everyFrame });
const steps = anchorGraphToViewModel(graph, { expanded: everyFrame, model: "steps" });
const scopeOf = (label: string) => graph.nodes.find((n) => n.kind === "scope" && n.label === label)!.id;

describe("one box per symbol", () => {
  it("draws every read of the resource as one box: the binding, its accessor calls, its fields and its Match test", () => {
    const route = scopeOf("NotePage");
    const reads = graph.nodes.filter((n) => n.parent === route && n.symbol?.startsWith("note@"));
    expect(reads.map((n) => n.label)).toEqual(expect.arrayContaining(["[note]", "note", "note()", "error", "note.error"]));
    const boxes = new Set(reads.map((n) => symbols.shownAs.get(n.id)));
    expect(boxes.size).toBe(1);
    const box = symbols.vm.nodes.find((n) => n.id === [...boxes][0])!;
    expect(box).toMatchObject({ label: "note", memberCount: reads.length });
    expect(box.note).toContain("error");
  });

  it("names the edge out of a symbol by the field read along it", () => {
    const n = graph.nodes.find((x) => x.label === "n" && x.elementKind === "parameter")!;
    const box = symbols.shownAs.get(n.id)!;
    const labels = symbols.vm.edges.filter((e) => e.source === box).map((e) => e.label);
    expect(labels.join(" ")).toContain("title");
  });

  it("keeps bindings of the same name apart: `id` in the route, the resource callback and the server", () => {
    const ids = graph.nodes.filter((n) => n.kind !== "scope" && n.label === "id" && n.elementKind === "parameter");
    expect(new Set(ids.map((n) => symbols.shownAs.get(n.id))).size).toBe(ids.length);
  });

  it("keeps a box with no symbol, and every end, its own box", () => {
    // Never into a symbol's box; at most into a box that repeats its place.
    const label = new Map(symbols.vm.nodes.map((b) => [b.id, b.label]));
    for (const n of graph.nodes) if (n.kind !== "scope" && n.kind !== "frontier" && !n.symbol) expect(label.get(symbols.shownAs.get(n.id)!)).toBe(n.label);
    const ends = graph.nodes.filter((n) => n.kind === "terminal" && !n.symbol);
    expect(ends.every((n) => symbols.vm.nodes.some((b) => b.id === n.id))).toBe(true);
  });

  it("cuts the route's boxes by a quarter or more against one box per step", () => {
    expect(symbols.vm.nodes.length).toBeLessThanOrEqual(Math.round(steps.vm.nodes.length * 0.75));
  });
});
