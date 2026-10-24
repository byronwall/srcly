import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.route-graph.json";
import type { RouteGraphResult } from "../../../dataflow/contract.generated";
import { routeGraphToViewModel } from "./adapter";
import { FLOW_MARK_ORDER, FLOW_MARKS, humanizeDetail, isFlowMark, MARK_OF_KIND } from "./marks";

const graph = fixture as unknown as RouteGraphResult;

describe("flow marks", () => {
  it("gives every engine node kind a mark, and the legend lists every mark once", () => {
    const kinds: RouteGraphResult["nodes"][number]["kind"][] = ["route", "occurrence", "control", "origin", "field", "terminal", "frontier"];
    for (const kind of kinds) expect(isFlowMark(MARK_OF_KIND[kind]), kind).toBe(true);
    expect([...FLOW_MARK_ORDER].sort()).toEqual(Object.keys(FLOW_MARKS).sort());
    // Anchor graphs reuse the route's accent for the anchor and the frontier's warning for a boundary.
    expect(Object.values(FLOW_MARKS).every((m) => /^#[0-9a-f]{6}$/.test(m.color))).toBe(true);
    expect(new Set(Object.values(FLOW_MARKS).map((m) => m.color)).size).toBeGreaterThanOrEqual(6);
  });

  it("is not a mark for the import graph's symbol kinds", () => {
    expect(isFlowMark("function")).toBe(false);
    expect(isFlowMark(undefined)).toBe(false);
  });

  it("says the engine's kind words the way the box does", () => {
    expect(humanizeDetail("jsx-text")).toBe("JSX text");
    expect(humanizeDetail("control-flow · true")).toBe("control flow · true");
    expect(humanizeDetail("fetch · network")).toBe("fetch · network");
    expect(humanizeDetail(null)).toBeUndefined();
  });
});

describe("boxes carry their kind, status and repetition", () => {
  const { vm } = routeGraphToViewModel(graph);
  const byLabel = (label: string) => vm.nodes.find((n) => n.label === label)!;

  it("marks and tints each box by kind", () => {
    expect(byLabel("/records")).toMatchObject({ symbolKind: "route", tint: FLOW_MARKS.route.color });
    expect(byLabel("RecordTable")).toMatchObject({ symbolKind: "component", tint: FLOW_MARKS.component.color });
    expect(byLabel("For")).toMatchObject({ symbolKind: "control", tint: FLOW_MARKS.control.color });
    expect(byLabel("createResource(loadViewer)")).toMatchObject({ symbolKind: "origin", tint: FLOW_MARKS.origin.color });
    expect(vm.nodes.filter((n) => n.symbolKind === "terminal").every((n) => n.tint === FLOW_MARKS.terminal.color)).toBe(true);
  });

  it("carries the proof status on every box and the repetition as a badge, not in the note", () => {
    // /records is a partial route whose two gaps sit in data/*.ts, outside
    // every component box: only the route box carries the partial status.
    const partial = vm.nodes.filter((n) => n.status !== "proven");
    expect(partial.map((n) => n.label)).toEqual(["/records"]);
    expect(partial[0].status).toBe("partial");
    const conditional = vm.nodes.filter((n) => n.repetition === "conditional");
    expect(conditional.length).toBeGreaterThan(0);
    expect(conditional.every((n) => !n.note?.includes("conditional"))).toBe(true);
    const single = graph.nodes.filter((n) => n.repetition === "single").map((n) => n.id);
    expect(vm.nodes.filter((n) => single.includes(n.id)).every((n) => n.repetition === undefined)).toBe(true);
  });

  it("spells out terminal kinds in the subtitle", () => {
    const subtitles = vm.nodes.filter((n) => n.symbolKind === "terminal").map((n) => n.subtitle ?? "");
    expect(subtitles.some((s) => s.startsWith("JSX text · "))).toBe(true);
    expect(subtitles.some((s) => s.startsWith("render expression · "))).toBe(true);
    expect(subtitles.some((s) => s.includes("jsx-text"))).toBe(false);
  });

  it("keeps a frontier's hatched outline under the frontier mark", () => {
    const origin = graph.nodes.find((n) => n.kind === "origin")!;
    const frontier: RouteGraphResult["nodes"][number] = {
      ...origin,
      id: "frontier:1",
      kind: "frontier",
      label: "records[*].id",
      detail: "stops · partial-proof",
      parent: graph.nodes.find((n) => n.label === "RecordTable")!.id,
      status: "partial",
      reason: "partial-proof",
    };
    const { vm: withFrontier } = routeGraphToViewModel({ ...graph, nodes: [...graph.nodes, frontier] });
    expect(withFrontier.nodes.find((n) => n.id === "frontier:1")).toMatchObject({ symbolKind: "frontier", outline: "hatched", status: "partial", note: "partial · partial-proof" });
  });
});
