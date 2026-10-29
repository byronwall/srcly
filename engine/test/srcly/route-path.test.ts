import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { routeGraphOp } from "../../src/srcly/ops/route-graph";
import { routePathOp } from "../../src/srcly/ops/route-path";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";
import { solidRoute } from "./engine-process";

const compact = fileURLToPath(new URL("../../examples/compact-field-proof", import.meta.url));

function sessionFor(root: string) {
  const source = path.join(root, "src");
  return createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
}

describe("routePath explains a lit edge in order (M4, T16)", () => {
  it("walks a handoff from the viewer resource to a render slot, step by step, and agrees with the edge", () => {
    const session = sessionFor(solidRoute);
    const graph = routeGraphOp(session, { route: "/records" });
    const origin = graph.origins.find((item) => item.label === "createResource(loadViewer)")!;
    const lit = routeGraphOp(session, { route: "/records", source: origin.elementId });
    // The viewer's three handoffs; the records' reach their slots through `createMemo`'s callbacks, which the framework model proves.
    const handoffs = lit.edges.filter((edge) => edge.kind === "handoff" && edge.source === origin.nodeId);
    expect(handoffs.length).toBe(3);
    expect(lit.edges.filter((edge) => edge.kind === "handoff" && edge.source !== origin.nodeId).every((edge) => edge.status === "proven")).toBe(true);
    for (const edge of handoffs) {
      const result = routePathOp(session, { route: "/records", source: origin.elementId, edge: edge.id });
      expect(result.edge).toMatchObject({ id: edge.id, kind: "handoff", status: edge.status, source: edge.source });
      expect(result.outcome).toBe(edge.status === "proven" ? "ok" : "partial");
      expect(result.rows[0]).toMatchObject({ kind: "input", label: "createResource(loadViewer)", status: "proven" });
      expect(result.rows.at(-1)!.kind).toBe("terminal");
      // Every step after the first carries the relation that reached it.
      expect(result.rows.slice(1).every((row) => row.relationId !== null && row.proof.length === 1)).toBe(true);
      expect(result.frontier).toBeNull();
    }
    const slot = handoffs.map((edge) => routePathOp(session, { route: "/records", source: origin.elementId, edge: edge.id })).find((result) => result.rows.at(-1)!.file === "src/components/ViewerCard.tsx")!;
    expect(slot.rows.map((row) => row.label)).toEqual(["createResource(loadViewer)", "viewer()", "viewer()", "ViewerCard", "ViewerCard", slot.rows.at(-1)!.label]);
  }, 60_000);

  it("walks a field edge from a file origin to its consumer, names the field, and stops a frontier edge where the proof ends", () => {
    const session = sessionFor(compact);
    const graph = routeGraphOp(session, { route: "/projects" });
    const origin = graph.origins.find((item) => item.label.startsWith("readFile("))!;
    const lit = routeGraphOp(session, { route: "/projects", source: origin.elementId });
    const fields = lit.edges.filter((edge) => edge.kind === "field" && edge.status === "proven");
    expect(fields.map((edge) => edge.label).sort()).toEqual(["projects[*].id", "projects[*].name", "projects[*].ownerName"]);
    const owner = fields.find((edge) => edge.label === "projects[*].ownerName")!;
    const explained = routePathOp(session, { route: "/projects", source: origin.elementId, edge: owner.id });
    expect(explained.edge).toMatchObject({ kind: "field", label: "projects[*].ownerName", status: "proven", source: owner.source });
    expect(explained.outcome).toBe("ok");
    expect(explained.rows[0]).toMatchObject({ kind: "input", file: "src/routes/api/projects.ts" });
    // Every step after the origin is one accepted transfer, from the resource read to the field in the component body.
    expect(explained.rows.length).toBeGreaterThan(8);
    expect(explained.rows.slice(1).every((row) => row.status === "proven" && row.proof.length >= 1)).toBe(true);
    expect(explained.rows.map((row) => row.line)).toContain(30); // <ProjectDetails project={current()} />
    expect(explained.rows.at(-1)).toMatchObject({ kind: "terminal", label: "props.project.ownerName", file: "src/routes/projects.tsx", line: 13 });
    // The id field goes through the find predicate: a transform step on the way.
    const idEdge = fields.find((edge) => edge.label === "projects[*].id")!;
    expect(routePathOp(session, { route: "/projects", source: origin.elementId, edge: idEdge.id }).rows.some((row) => row.kind === "transform")).toBe(true);
    const frontierEdge = lit.edges.find((edge) => edge.kind === "field" && edge.status === "partial")!;
    const stopped = routePathOp(session, { route: "/projects", source: origin.elementId, edge: frontierEdge.id });
    expect(stopped.outcome).toBe("partial");
    expect(stopped.frontier).toMatchObject({ reason: "partial-proof" });
    expect(stopped.rows.at(-1)).toMatchObject({ kind: "boundary", reason: "partial-proof" });
  }, 60_000);

  it("never guesses: an edge the totality does not carry is not-found, and field edges need the origin", () => {
    const session = sessionFor(solidRoute);
    expect(() => routePathOp(session, { route: "/records", edge: "nope" })).toThrowError(expect.objectContaining({ code: "not-found" }));
    expect(() => routePathOp(session, { route: "/records" })).toThrowError(expect.objectContaining({ code: "invalid-request" }));
  }, 60_000);
});
