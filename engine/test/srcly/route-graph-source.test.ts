import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RouteGraphResult } from "../../src/srcly/contracts/route-graph";
import { routeGraphOp } from "../../src/srcly/ops/route-graph";
import { createEngineSession } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";
import { solidRoute } from "./engine-process";

const compact = fileURLToPath(new URL("../../examples/compact-field-proof", import.meta.url));
const sessionFor = (root: string) => createEngineSession({ root, source: path.join(root, "src"), tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
const label = (graph: RouteGraphResult, id: string) => graph.nodes.find((node) => node.id === id)?.label;
const ownerChain = (graph: RouteGraphResult, id: string) => {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const out: string[] = [];
  for (let n = byId.get(id); n; n = n.parent ? byId.get(n.parent) : undefined) out.push(n.label);
  return out;
};

describe("routeGraph with a selected origin", () => {
  const solid = sessionFor(solidRoute);
  const base = routeGraphOp(solid, { route: "/records" });
  const origin = (prefix: string) => base.origins.find((item) => item.label.startsWith(prefix))!.nodeId;

  it("lights the viewer origin's proven destinations inside ViewerCard only", () => {
    const graph = routeGraphOp(solid, { route: "/records", source: origin("createResource(loadViewer)") });
    expect(graph.selectedSource).toBe(origin("createResource(loadViewer)"));
    expect(graph.destinations.length).toBeGreaterThan(0);
    for (const id of graph.destinations) expect(ownerChain(graph, id)).toContain("ViewerCard");
  }, 60_000);

  it("never lights ViewerCard from the records origin, and names why field lineage is unavailable", () => {
    const graph = routeGraphOp(solid, { route: "/records", source: origin("createResource(loadRecords)") });
    for (const id of graph.destinations) expect(ownerChain(graph, id)).not.toContain("ViewerCard");
    // At srcly-port-base the records walk stops at selectVisibleRecords's return,
    // and exact field lineage starts only at a filesystem origin.
    expect(graph.destinations).toEqual([]);
    expect(graph.lineage).toMatchObject({ status: "unavailable", fields: 0 });
    expect(graph.lineage?.unavailableReason).toMatch(/filesystem origin/);
  }, 60_000);

  it("draws field edges to the proven terminals and a frontier where a field stops (compact fixture)", () => {
    const session = sessionFor(compact);
    const plain = routeGraphOp(session, { route: "/projects" });
    const readFile = plain.origins.find((item) => item.label.startsWith("readFile"))!;
    const graph = routeGraphOp(session, { route: "/projects", source: readFile.nodeId });
    const fields = graph.edges.filter((edge) => edge.kind === "field" && edge.status === "proven");
    expect(fields.map((edge) => edge.label).sort()).toEqual(["projects[*].id", "projects[*].name", "projects[*].ownerName"]);
    for (const edge of fields) {
      expect(edge.source).toBe(readFile.nodeId);
      expect(graph.destinations).toContain(edge.target);
      // A field rendered through a component prop lands on that occurrence.
      expect(["terminal", "occurrence"]).toContain(graph.nodes.find((node) => node.id === edge.target)?.kind);
    }
    expect(fields.map((edge) => `${edge.label} -> ${label(graph, edge.target)}`).sort()).toEqual([
      "projects[*].id -> ProjectLink",
      "projects[*].name -> PageHeader",
      "projects[*].ownerName -> ProjectDetails",
    ]);
    const frontiers = graph.nodes.filter((node) => node.kind === "frontier");
    expect(frontiers).toHaveLength(1);
    expect(frontiers[0].reason).toBe("partial-proof");
    expect(graph.lineage).toMatchObject({ status: "partial", fields: 3, frontiers: 1 });
  }, 60_000);

  it("refuses an unknown source by name", () => {
    expect(() => routeGraphOp(solid, { route: "/records", source: "program-element:nope" })).toThrowError(expect.objectContaining({ code: "not-found" }));
  });
});
