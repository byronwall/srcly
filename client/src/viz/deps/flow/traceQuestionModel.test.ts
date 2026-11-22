import { describe, expect, it } from "vitest";
import type { AnchorGraphResult, RouteGraphResult, RoutePathResult } from "../../../dataflow/contract.generated";
import sample from "../../../../../engine/test/srcly/__fixtures__/solid-route.anchor-graph.json";
import routeSample from "../../../../../server/tests/snapshots/fake-engine.routeGraph.ok.json";
import pathSample from "../../../../../server/tests/snapshots/fake-engine.routePath.ok.json";
import { anchorQuestion, matchingRoutePath, routeQuestion } from "./traceQuestionModel";

const real = sample as AnchorGraphResult;
const route = routeSample as RouteGraphResult;
const edgePath = pathSample as RoutePathResult;
const anchorId = real.anchor.elementId;
const direct = real.edges.find((e) => e.target === anchorId && e.kind === "field-input")!;

describe("the raw expression witness", () => {
  it("shows the exact read and the whole-object handoff, not sibling fields lifted into ancestry", () => {
    expect(real.nodes.some((node) => node.field === "team")).toBe(true);
    const question = anchorQuestion(real);
    expect(question.expression).toBe("props.viewer?.name");
    expect(question.fieldRead?.span).toEqual({ startLine: 6, startColumn: 21, endLine: 6, endColumn: 39 });
    expect(question.context).toMatchObject({ file: "src/routes/records.tsx", span: { startLine: 30, startColumn: 19, endLine: 30, endColumn: 36 } });
    expect(JSON.stringify(question)).not.toContain("team");
  });

  it("does not mistake a structural, assumed or differently located witness for the exact read", () => {
    const graphWith = (edge: typeof direct) => ({ ...real, edges: real.edges.map((e) => e === direct ? edge : e) });
    const misleading = [
      { ...direct, status: "structural" as const },
      { ...direct, label: "team" },
      { ...direct, proof: [...direct.proof, { ...direct.proof[0], kind: "external-call" }] },
      { ...direct, proof: [{ ...direct.proof[0], kind: "resource-boundary" }] },
      { ...direct, proof: [{ ...direct.proof[0], locations: [{ ...direct.proof[0].locations[0], file: "src/data/viewer.ts" }] }] },
      { ...direct, proof: [] },
      { ...direct, target: direct.source },
    ];
    for (const edge of misleading) expect(anchorQuestion(graphWith(edge)).fieldRead).toBeNull();
    // A direct witness is still useful even where the overall trace is partial.
    const partial: AnchorGraphResult = { ...real, outcome: "partial", coverage: { ...real.coverage, budget: { ...real.coverage.budget, exhausted: true } } };
    expect(anchorQuestion(partial)).toMatchObject({ fieldRead: { file: real.anchor.file }, stop: "evidence budget exhausted" });
    expect(anchorQuestion({ ...real, outcome: "stale", reason: "stale-generation" })).toMatchObject({ fieldRead: null, stop: "stale-generation" });
  });

  it("does not infer a localized handoff from a proven edge whose witness points somewhere else", () => {
    const graph = structuredClone(real);
    const edge = graph.edges.find((e) => e.target === direct.source && e.kind === "component-prop-binding")!;
    edge.proof = edge.proof.map((p) => ({ ...p, locations: p.locations.filter((l) => l.file === real.anchor.file) }));
    expect(anchorQuestion(graph)).toMatchObject({ fieldRead: { file: real.anchor.file }, context: null });
  });
});

describe("route evidence scope", () => {
  it("labels pending surface evidence and accepts only an edge explanation for that exact result", () => {
    expect(routeQuestion({ ...route, phase: "surface", selectedSource: null })).toMatchObject({ tracing: true, origin: null });
    const matching = { ...edgePath, route: { key: route.route.key, pathPattern: route.route.pathPattern }, generation: route.generation, programHash: route.programHash };
    expect(matchingRoutePath(route, matching.edge.id, matching)).toBe(matching);
    expect(matchingRoutePath(route, "other", matching)).toBeNull();
    expect(matchingRoutePath(route, matching.edge.id, { ...matching, generation: route.generation + 1 })).toBeNull();
    expect(matchingRoutePath(route, matching.edge.id, { ...matching, programHash: "different" })).toBeNull();
    expect(matchingRoutePath(route, matching.edge.id, { ...matching, route: { ...matching.route, key: "other" } })).toBeNull();
  });
});
