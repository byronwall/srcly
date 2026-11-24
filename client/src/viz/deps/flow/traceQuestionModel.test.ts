import { describe, expect, it } from "vitest";
import type { AnchorGraphResult, RouteGraphResult, RoutePathResult } from "../../../dataflow/contract.generated";
import sample from "../../../../../engine/test/srcly/__fixtures__/solid-route.anchor-graph.json";
import routeSample from "../../../../../server/tests/snapshots/fake-engine.routeGraph.ok.json";
import pathSample from "../../../../../server/tests/snapshots/fake-engine.routePath.ok.json";
import returned from "../../../../../engine/test/srcly/__fixtures__/fpr-returned.anchor-graph.json";
import opaque from "../../../../../engine/test/srcly/__fixtures__/fpr-opaque.anchor-graph.json";
import titleDraft from "../../../../../engine/test/srcly/__fixtures__/fpr-title.anchor-graph.json";
import tagsDraft from "../../../../../engine/test/srcly/__fixtures__/fpr-tags.anchor-graph.json";
import shared from "../../../../../engine/test/srcly/__fixtures__/fpr-shared.anchor-graph.json";
import owner from "../../../../../engine/test/srcly/__fixtures__/fpr-owner.anchor-graph.json";
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

// Real anchor graphs from engine/examples/value-flow-basics/src/field-producers.tsx (`pnpm capture-anchor-graph`).
const graphOf = (json: unknown) => json as AnchorGraphResult;

describe("the field's producer on the question card", () => {
  it("names a returned literal, its returning object, and the read", () => {
    const q = anchorQuestion(graphOf(returned));
    expect(q.fieldRead?.span.startLine).toBe(16);
    expect(q.producer).toMatchObject({ field: "title", producer: { text: '"LOADED_TITLE"', span: { startLine: 12 } }, handoff: { kind: "return", object: { span: { startLine: 12 } } }, laterWrites: [] });
    expect(q.boundary).toBeNull();
  });

  it("keeps a store's first value apart from its later write", () => {
    const q = anchorQuestion(graphOf(titleDraft));
    expect(q.producer).toMatchObject({ producer: { text: "props.note.title", span: { startLine: 28 } }, handoff: { kind: "initialization" } });
    expect(q.producer!.laterWrites.map((w) => [w.text, w.span.startLine])).toEqual([["event.currentTarget.value", 30]]);
  });

  it("gives the same rendered field different witnesses when its initial value comes from another field", () => {
    const title = anchorQuestion(graphOf(titleDraft)).producer!;
    const tags = anchorQuestion(graphOf(tagsDraft)).producer!;
    expect(tags.producer.text).toBe('props.note.tags.join(" / ")');
    expect(tags.producer.span).not.toEqual(title.producer.span);
    expect(JSON.stringify(title)).not.toContain("tags");
  });

  it("leaves a shared component's callers apart until one is chosen", () => {
    const q = anchorQuestion(graphOf(shared));
    expect(q.producer?.producer.span.startLine).toBe(40);
    expect(q.callers.map((c) => [c.text, c.span.startLine])).toEqual([["note={alpha}", 48], ["note={beta}", 49]]);
    expect(JSON.stringify(q)).not.toMatch(/ALPHA_TITLE|BETA_TITLE/);
  });

  it("stops at a signature-only call by name, with no producer", () => {
    const q = anchorQuestion(graphOf(opaque));
    expect(q.producer).toBeNull();
    expect(q.boundary).toMatchObject({ text: 'externalNote("KEY")', span: { startLine: 22 } });
  });

  it("names a fallback packed as the field, with no other handoff", () => {
    expect(anchorQuestion(graphOf(owner)).producer).toMatchObject({ producer: { text: 'props.owner ?? "Unknown"' }, handoff: { kind: "field" } });
  });

  it("claims nothing when the engine names two first values, or none proven", () => {
    const graph = structuredClone(graphOf(returned));
    graph.producers = [...graph.producers, { ...graph.producers[0], nodeId: graph.anchor.elementId! }];
    expect(anchorQuestion(graph)).toMatchObject({ producer: null, alternatives: [{ span: { startLine: 12 } }, { span: { startLine: 16 } }] });
    graph.producers = [{ ...graph.producers[0], status: "partial" }];
    expect(anchorQuestion(graph).producer).toBeNull();
    expect(anchorQuestion({ ...graphOf(returned), direction: "forward" }).producer).toBeNull();
  });
});
