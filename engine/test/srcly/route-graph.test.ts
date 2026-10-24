import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FlowNode, RouteGraphResult } from "../../src/srcly/contracts/route-graph";
import { routeGraphOp } from "../../src/srcly/ops/route-graph";
import { createEngineSession } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";
import { solidRoute } from "./engine-process";

const session = createEngineSession({ root: solidRoute, source: path.join(solidRoute, "src"), tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
let cached: RouteGraphResult | null = null;
const graph = () => (cached ??= routeGraphOp(session, { route: "/records" }));
const byLabel = (label: string, kind?: FlowNode["kind"]) => graph().nodes.filter((node) => node.label === label && (!kind || node.kind === kind));
const labelOf = (id: string | null) => graph().nodes.find((node) => node.id === id)?.label;

describe("routeGraph on solid-route", () => {
  it("roots the hierarchy at the route and names its generation", () => {
    const roots = graph().nodes.filter((node) => node.parent === null);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ kind: "route", label: "/records", file: "src/routes/records.tsx", line: 15 });
    expect(graph().generation).toBe(1);
    expect(graph().programHash).toMatch(/^[0-9a-f]{16}$/);
  }, 60_000);

  it("has one RouteFrame occurrence that owns the route's children", () => {
    const [frame] = byLabel("RouteFrame", "occurrence");
    expect(byLabel("RouteFrame", "occurrence")).toHaveLength(1);
    expect(labelOf(frame.parent)).toBe("/records");
    const owned = graph().nodes.filter((node) => node.parent === frame.id).map((node) => node.label).sort();
    expect(owned).toEqual(["Show", "Solid route fixture", "ViewerCard", "props.title"]);
    // The records and summary sit in RouteFrame's Show, so RouteFrame owns them through it.
    const show = graph().nodes.find((node) => node.parent === frame.id && node.label === "Show")!;
    expect(graph().nodes.filter((node) => node.parent === show.id).map((node) => node.label).sort()).toEqual(["Loading records...", "RecordSummary", "RecordTable"]);
  });

  it("draws MetricCard as one definition with two occurrences", () => {
    const cards = byLabel("MetricCard", "occurrence");
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((card) => card.detail))).toEqual(new Set(["MetricCard.tsx"]));
    expect(cards.map((card) => card.line).sort()).toEqual([7, 8]);
    expect(new Set(cards.map((card) => labelOf(card.parent)))).toEqual(new Set(["RecordSummary"]));
  });

  it("makes For in RecordTable a collection control node", () => {
    const [forNode] = byLabel("For", "control");
    expect(forNode.detail).toBe("collection");
    expect(forNode.file).toBe("src/components/RecordTable.tsx");
    expect(graph().nodes.filter((node) => node.parent === forNode.id).map((node) => node.label)).toEqual(["RecordRow"]);
  });

  it("only draws render edges from a node's parent, and lists the pickable origins", () => {
    const parent = new Map(graph().nodes.map((node) => [node.id, node.parent]));
    for (const edge of graph().edges.filter((item) => item.kind === "render")) expect(parent.get(edge.target)).toBe(edge.source);
    expect(graph().origins.map((origin) => origin.label).sort()).toEqual([
      "createResource(loadRecords)",
      "createResource(loadViewer)",
      "fetch(\"/records.json\")",
      "fetch(\"/viewer.json\")",
    ]);
    expect(graph().edges.some((edge) => edge.kind === "field")).toBe(false);
  });

  it("refuses an unknown route by name", () => {
    expect(() => routeGraphOp(session, { route: "/nope" })).toThrowError(expect.objectContaining({ code: "not-found" }));
  });
});
