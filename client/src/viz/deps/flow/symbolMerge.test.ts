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

  it("keeps every origin, end, boundary and stop its own box", () => {
    const own = graph.nodes.filter((n) => ["origin", "terminal", "boundary", "frontier", "control"].includes(n.kind) && !n.symbol);
    expect(own.length).toBeGreaterThan(0);
    // Its own box, or the box that repeats its place exactly.
    const raw = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const n of own) expect(raw.get(symbols.shownAs.get(n.id)!)?.label).toBe(n.label);
  });

  it("folds an unnamed step into the edge that skips it, named by what the step does", () => {
    const call = graph.nodes.find((n) => n.label === "fetchNote(id)")!;
    expect(symbols.vm.nodes.some((n) => n.id === call.id)).toBe(false);
    expect(symbols.vm.edges.some((e) => e.label?.includes("fetchNote()"))).toBe(true);
    // Every drawn edge joins two drawn boxes, and keeps the proof of each step it skips.
    const ids = new Set(symbols.vm.nodes.map((n) => n.id));
    for (const e of symbols.vm.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    expect(symbols.vm.edges.some((e) => (e.proof?.length ?? 0) > 1)).toBe(true);
  });

  it("draws state a framework call made as state: the resource, the store and the memo", () => {
    const states = symbols.vm.nodes.filter((n) => n.symbolKind === "state").map((n) => n.label);
    expect(states).toEqual(expect.arrayContaining(["note", "draft", "label"]));
  });

  it("cuts the route's boxes by a quarter or more against one box per step", () => {
    expect(symbols.vm.nodes.length).toBeLessThanOrEqual(Math.round(steps.vm.nodes.length * 0.75));
  });
});
