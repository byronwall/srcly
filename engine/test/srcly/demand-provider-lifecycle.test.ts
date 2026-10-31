import { describe, expect, it } from "vitest";
import { DeferredMap } from "../../src/analysis/deferred-map";
import { LazyEvidenceRelationProvider } from "../../src/analysis/evidence-relation-provider";
import { CompactRelationIndex } from "../../src/analysis/program-evidence-connector-index";
import { ProgramFactIndex } from "../../src/analysis/program-fact-index";
import { compactFactFromElement } from "../../src/analysis/program-evidence-compact-facts";
import type { ProgramElement } from "../../src/analysis/program-evidence";
import { emptyProgramEvidenceCollectionStats } from "../../src/analysis/program-evidence-collector-instrumentation";
import type { ProgramElement } from "../../src/analysis/program-evidence";
import { ProgramEvidenceRelationFrontierLoader } from "../../src/analysis/program-evidence-relation-loading";
import type { RelationRecipe } from "../../src/analysis/program-evidence-relation-loading";

function recipe(id: string, to: string): RelationRecipe {
  return {
    id,
    from: "origin",
    to,
    kind: "references",
    evidence: [],
    proof: { kind: "ast-node", detail: id, locations: [] },
    confidence: "proven",
    sequence: 0,
  };
}

function frontier(recipes: readonly RelationRecipe[], revision: number) {
  return {
    recipes,
    revision,
    relationIndexCount: recipes.length * 2,
    sourceFilesVisited: 0,
    astUnitsVisited: 0,
    partitionsVisited: 0,
    recipesExamined: recipes.length,
    collectorStats: emptyProgramEvidenceCollectionStats(0),
  };
}

function element(id: string): ProgramElement {
  const location = { file: "src/page.ts", line: 1, column: 1, span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } };
  return {
    id,
    kind: "value",
    operationKind: null,
    label: "value",
    expression: "value",
    location,
    symbolId: null,
    typeId: null,
    module: null,
    definitionId: null,
    ownerId: null,
    attributes: {},
    componentBinding: null,
    confidence: "proven",
    proof: { kind: "ast-node", detail: "fixture", locations: [location] },
  };
}

describe("demand provider lifecycle", () => {
  it("looks up a known ID without materializing all, and falls back once for an unknown ID", () => {
    const expected = element("program-element:eager-id");
    const eager = new ProgramFactIndex([expected], []);
    const fact = eager.facts[0];
    let knownAllCalls = 0;
    const known = new ProgramFactIndex([fact], [], () => expected, {
      file: () => {},
      all: () => { knownAllCalls += 1; },
    });
    expect(known.getFact(fact.id)).toEqual(fact);
    expect(known.getElement(fact.id)).toBe(expected);
    expect(knownAllCalls).toBe(0);

    let allCalls = 0;
    const lazy = new ProgramFactIndex([], [], () => expected, {
      file: () => {},
      all: () => { allCalls += 1; lazy.addFacts([fact]); },
    });
    expect(lazy.getFact(fact.id)).toEqual(fact);
    expect(lazy.getInstrumentation().hydratedElementCount).toBe(0);
    expect(lazy.getElement(fact.id)).toBe(expected);
    expect(lazy.getFact("program-element:missing")).toBeUndefined();
    expect(lazy.getElement("program-element:missing")).toBeUndefined();
    expect(lazy.facts).toEqual([fact]);
    expect(lazy.roleCandidates("none")).toEqual([]);
    expect(lazy.kindCandidates("value")).toHaveLength(1);
    expect(allCalls).toBe(1);
  });

  it("refreshes a cached frontier after the relation index grows", () => {
    let loads = 0;
    const first = recipe("first", "target-1");
    const later = recipe("later", "target-2");
    const provider = new LazyEvidenceRelationProvider(new ProgramFactIndex([], []), {
      load: () => ++loads === 1 ? frontier([first], 1) : frontier([first, later], 2),
    });

    expect(provider.getRelations("origin", "forward").map((relation) => relation.id)).toEqual(["first"]);
    expect(provider.getRelations("origin", "forward").map((relation) => relation.id)).toEqual(["first", "later"]);
  });

  it("skips warm frontier loads but refreshes cached relations when its revision changes", () => {
    let loads = 0;
    let revision = 1;
    const first = recipe("first", "target-1");
    const later = recipe("later", "target-2");
    const provider = new LazyEvidenceRelationProvider(new ProgramFactIndex([], []), {
      currentRevision: () => revision,
      load: () => {
        loads += 1;
        return frontier(revision === 1 ? [first] : [first, later], revision);
      },
    });

    expect(provider.getRelations("origin", "forward").map((relation) => relation.id)).toEqual(["first"]);
    expect(loads).toBe(1);
    expect(provider.getRelations("origin", "forward").map((relation) => relation.id)).toEqual(["first"]);
    expect(loads).toBe(1);

    revision = 2;
    expect(provider.getRelations("origin", "forward").map((relation) => relation.id)).toEqual(["first", "later"]);
    expect(loads).toBe(2);
  });

  it("advances the source frontier revision when facts are added", () => {
    const facts = new ProgramFactIndex([], []);
    const loader = new ProgramEvidenceRelationFrontierLoader(facts, new CompactRelationIndex());
    const revision = loader.currentRevision();
    const element: ProgramElement = {
      id: "value:a.ts:1",
      kind: "value",
      operationKind: null,
      label: "value",
      expression: "value",
      location: { file: "src/a.ts", line: 1, column: 1, span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 6 } },
      symbolId: null,
      typeId: null,
      module: null,
      definitionId: null,
      ownerId: null,
      attributes: {},
      componentBinding: null,
      confidence: "proven",
      proof: { kind: "ast-node", detail: "fixture", locations: [] },
    };

    facts.addFacts([compactFactFromElement(element)]);
    expect(loader.currentRevision()).toBe(revision + 1);
  });

  it("marks a provider unusable after a failed frontier load", () => {
    const provider = new LazyEvidenceRelationProvider(new ProgramFactIndex([], []), {
      load: () => { throw new Error("cancelled during collection"); },
    });

    expect(() => provider.getRelations("origin", "forward")).toThrow("cancelled during collection");
    expect(provider.isPoisoned).toBe(true);
    expect(() => provider.getRelations("origin", "forward")).toThrow("recreate it before querying");
  });

  it("reports failures from lazy fact preparation to the session", () => {
    let failed = false;
    const facts = new ProgramFactIndex([], ["src/page.ts"], undefined, {
      file: () => { failed = true; throw new Error("cancelled while preparing facts"); },
      all: () => { failed = true; throw new Error("cancelled while preparing facts"); },
    });
    const provider = new LazyEvidenceRelationProvider(facts, [], [], {}, undefined, () => failed);

    expect(() => provider.facts.fileCandidates("src/page.ts")).toThrow("cancelled while preparing facts");
    expect(provider.isPoisoned).toBe(true);
  });

  it("keeps a deferred loader when it throws before completing", () => {
    const values = new DeferredMap<string, string>();
    let attempts = 0;
    values.defer("key", () => {
      attempts += 1;
      if (attempts === 1) throw new Error("cancelled");
      values.set("key", "ready");
    });

    expect(() => values.get("key")).toThrow("cancelled");
    expect(values.get("key")).toBe("ready");
    expect(attempts).toBe(2);
  });

  it("reports cumulative demand collection without counting a cached frontier twice", () => {
    const facts = new ProgramFactIndex([], []);
    const collectorStats = emptyProgramEvidenceCollectionStats(0);
    const demandStats = { collectionElapsedMs: 0, partitionsVisited: 0, sourceFilesVisited: 0, astUnitsVisited: 0, collectorStats };
    let collected = false;
    const loader = new ProgramEvidenceRelationFrontierLoader(facts, new CompactRelationIndex(), {
      prepare: () => {
        if (collected) return;
        collected = true;
        demandStats.collectionElapsedMs = 4;
        demandStats.partitionsVisited = 1;
        demandStats.sourceFilesVisited = 1;
        demandStats.astUnitsVisited = 3;
        collectorStats.sourceFilesVisited = 1;
        collectorStats.astUnitsVisited = 3;
        collectorStats.phases.nodes.calls = 1;
        collectorStats.phases.nodes.elapsedMs = 2;
      },
      gaps: () => [],
      getDemandStats: () => demandStats,
    });
    const provider = new LazyEvidenceRelationProvider(facts, loader, [], { collectionTimeMs: 5 });

    provider.getRelations("origin", "forward");
    const first = provider.getInstrumentation();
    expect(first.collectionTimeMs).toBe(9);
    expect(first.deferredCollection.phases.nodes).toMatchObject({ calls: 1, elapsedMs: 2 });
    expect(first.totalExpansionPartitionsVisited).toBe(1);
    expect(first.lastExpansionPartitionsVisited).toBe(1);
    expect(first.lastExpansionSourceFilesVisited).toBe(1);

    provider.getRelations("origin", "forward");
    const repeated = provider.getInstrumentation();
    expect(repeated.collectionTimeMs).toBe(9);
    expect(repeated.deferredCollection.phases.nodes).toMatchObject({ calls: 1, elapsedMs: 2 });
    expect(repeated.totalExpansionPartitionsVisited).toBe(1);
    expect(repeated.lastExpansionPartitionsVisited).toBe(0);
  });
});
