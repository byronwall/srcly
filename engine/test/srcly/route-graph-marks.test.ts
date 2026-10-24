import { describe, expect, it } from "vitest";
import type { FlowNode } from "../../src/srcly/contracts/route-graph";
import { markPartialBoxes } from "../../src/srcly/ops/route-graph";

type Marks = Parameters<typeof markPartialBoxes>;
type Surface = Marks[2];
type Definitions = Marks[4];
type Gaps = Marks[3]["gaps"];

// markPartialBoxes on hand-made boxes: the rule, apart from any fixture.
const span = (startLine: number, startColumn: number, endLine: number, endColumn: number) => ({ startLine, startColumn, endLine, endColumn });
const at = (file: string, line: number, column: number) => ({ file, line, column, span: span(line, column, line, column + 1) });
const box = (id: string, kind: FlowNode["kind"], file: string, s: FlowNode["span"], parent: string | null = "route"): FlowNode => ({
  id, kind, label: id, detail: null, parent, file, absPath: `/${file}`, line: s.startLine, span: s, status: "proven", collapsedByDefault: false, repetition: null, external: false, reason: null,
});
const definitions = new Map([
  ["def:Card", { id: "def:Card", external: false, declaration: { file: "Card.tsx", line: 1, column: 1, span: span(1, 1, 20, 2) } }],
  ["def:Ext", { id: "def:Ext", external: true, declaration: null }],
]) as unknown as Definitions;
const surface = (overrides: Record<string, unknown> = {}) => ({
  status: "complete",
  omissions: [],
  occurrences: [
    { id: "occ:Card", definitionId: "def:Card" },
    { id: "occ:Ext", definitionId: "def:Ext" },
  ],
  ...overrides,
}) as unknown as Surface;

describe("markPartialBoxes", () => {
  const draw = () => [
    box("route", "route", "route.tsx", span(1, 1, 30, 2), null),
    box("occ:Card", "occurrence", "route.tsx", span(10, 3, 10, 40)),
    box("occ:Ext", "occurrence", "route.tsx", span(12, 3, 12, 20)),
    box("ctl:Show", "control", "route.tsx", span(14, 3, 18, 10)),
    box("term:text", "terminal", "route.tsx", span(15, 5, 15, 12), "ctl:Show"),
    box("origin", "origin", "route.tsx", span(5, 1, 5, 30)),
  ];

  it("leaves every box proven when nothing is marked", () => {
    const nodes = draw();
    markPartialBoxes(nodes, "route", surface(), { gaps: [] }, definitions);
    expect(nodes.every((n) => n.status === "proven" && n.reason === null)).toBe(true);
  });

  it("gives a located gap to the deepest box whose span contains it", () => {
    const nodes = draw();
    const gaps = [{ source: "evidence-slice", reason: "unproven-handoff", location: at("route.tsx", 15, 7) }] as unknown as Gaps;
    markPartialBoxes(nodes, "route", surface(), { gaps }, definitions);
    expect(nodes.find((n) => n.id === "term:text")).toMatchObject({ status: "partial", reason: "unproven-handoff" });
    expect(nodes.find((n) => n.id === "ctl:Show")!.status).toBe("proven");
    expect(nodes.find((n) => n.id === "route")!.status).toBe("proven");
  });

  it("marks every occurrence of a component when the mark sits in its declaration", () => {
    const nodes = [...draw(), box("occ:Card2", "occurrence", "route.tsx", span(20, 3, 20, 40))];
    const omissions = [{ reason: "budget-exhausted", locations: [at("Card.tsx", 8, 4)] }];
    const occurrences = [...surface().occurrences, { id: "occ:Card2", definitionId: "def:Card" } as Surface["occurrences"][number]];
    markPartialBoxes(nodes, "route", surface({ omissions, occurrences }), { gaps: [] }, definitions);
    expect(nodes.find((n) => n.id === "occ:Card")).toMatchObject({ status: "partial", reason: "budget-exhausted" });
    expect(nodes.find((n) => n.id === "occ:Card2")).toMatchObject({ status: "partial", reason: "budget-exhausted" });
    expect(nodes.find((n) => n.id === "route")!.status).toBe("proven");
  });

  it("prefers a drawn box inside the declaration over the declaration itself", () => {
    const nodes = [...draw(), box("term:inCard", "terminal", "Card.tsx", span(8, 1, 8, 30), "occ:Card")];
    const omissions = [{ reason: "budget-exhausted", locations: [at("Card.tsx", 8, 4)] }];
    markPartialBoxes(nodes, "route", surface({ omissions }), { gaps: [] }, definitions);
    expect(nodes.find((n) => n.id === "term:inCard")!.status).toBe("partial");
    expect(nodes.find((n) => n.id === "occ:Card")!.status).toBe("proven");
  });

  it("sends an unlocated or unmatched mark to the route box, and never to an origin", () => {
    const nodes = draw();
    const gaps = [
      { source: "evidence-slice", reason: "external-code", location: at("data.ts", 4, 26) },
      { source: "route-selection", reason: "ambiguous", location: at("route.tsx", 15, 7) },
      { source: "evidence-slice", reason: "identity-lost", location: null },
      { source: "evidence-slice", reason: "unproven-handoff", location: at("route.tsx", 5, 3) },
    ] as unknown as Gaps;
    markPartialBoxes(nodes, "route", surface(), { gaps }, definitions);
    expect(nodes.find((n) => n.id === "route")).toMatchObject({ status: "partial", reason: "external-code" });
    expect(nodes.find((n) => n.id === "term:text")!.status).toBe("proven");
    expect(nodes.find((n) => n.id === "origin")!.status).toBe("proven");
  });

  it("marks the route box when the surface itself is incomplete", () => {
    const nodes = draw();
    markPartialBoxes(nodes, "route", surface({ status: "partial" }), { gaps: [] }, definitions);
    expect(nodes.find((n) => n.id === "route")).toMatchObject({ status: "partial", reason: "incomplete-surface" });
    expect(nodes.filter((n) => n.status === "partial")).toHaveLength(1);
  });
});
