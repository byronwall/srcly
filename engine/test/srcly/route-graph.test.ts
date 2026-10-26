import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FlowNode, RouteGraphResult } from "../../src/srcly/contracts/route-graph";
import { routeGraphOp, routeSurfaceOp } from "../../src/srcly/ops/route-graph";
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

  it("marks partial only the boxes that own a located gap, never the whole route", () => {
    // /records is a partial route: its gaps stop at external response bodies
    // in data/*.ts, outside every drawn box, so they belong to the route box.
    // The slice also runs past its work budget (it follows `response.json()`
    // into the records validator); that gap sits at a render slot, which is
    // the one other box it marks. Every component box stays proven.
    expect(graph().status).toBe("partial");
    const partial = graph().nodes.filter((node) => node.status === "partial");
    expect(partial[0]).toMatchObject({ kind: "route", reason: "incomplete-surface" });
    const inside = (node: FlowNode, at: { file: string; line: number }) => node.file === at.file && node.span.startLine <= at.line && at.line <= node.span.endLine;
    for (const node of partial.slice(1)) expect(graph().gaps.some((gap) => gap.location && inside(node, gap.location)), node.label).toBe(true);
    expect(graph().nodes.filter((node) => node.kind === "occurrence").every((node) => node.status === "proven")).toBe(true);
    const status = new Map(graph().nodes.map((node) => [node.id, node.status]));
    for (const edge of graph().edges.filter((item) => item.kind === "render")) expect(edge.status).toBe(status.get(edge.target));
  });

  it("draws the same boxes from the route file alone as the surface, before any evidence", () => {
    const surface = routeSurfaceOp(session, { route: "/records" });
    expect(surface.phase).toBe("surface");
    expect(surface.outcome).toBe("partial");
    expect(surface.origins).toEqual([]);
    expect(surface.gaps).toEqual([]);
    expect(surface.edges.every((edge) => edge.kind === "render")).toBe(true);
    // The complete graph draws the same occurrence, control and terminal boxes, by id and parent.
    const backbone = (nodes: FlowNode[]) => nodes.filter((node) => node.kind !== "origin" && node.kind !== "frontier").map((node) => [node.id, node.kind, node.parent]);
    expect(backbone(surface.nodes)).toEqual(backbone(graph().nodes));
    expect(graph().phase).toBe("complete");
    // The route box cannot claim proof before the slice is walked.
    expect(surface.nodes.find((node) => node.kind === "route")).toMatchObject({ status: "partial", reason: "evidence-pending" });
    expect(() => routeSurfaceOp(session, { route: "/nope" })).toThrowError(expect.objectContaining({ code: "not-found" }));
  });

  it("refuses an unknown route by name", () => {
    expect(() => routeGraphOp(session, { route: "/nope" })).toThrowError(expect.objectContaining({ code: "not-found" }));
  });
});
