// Python evidence behind the engine's fact index. `engine/python/srcly_pyfacts.py`
// reads the program with `ast` and mypy and prints compact facts; this module
// expands them into the collector's raw ProgramElement / ProgramRelation shape
// and serves them through the same EvidenceRelationProvider interface the
// TypeScript provider implements, so the slice walk, `anchorGraph` and
// `valueFlow` read Python facts exactly as they read TypeScript ones.
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import type { EvidenceProviderInstrumentation, EvidenceRelationProvider } from "../../analysis/evidence-relation-provider";
import { instrumentationSnapshot, readMemorySnapshot, type InstrumentationState } from "../../analysis/evidence-relation-provider-instrumentation";
import type { ProgramElement, ProgramElementKind, ProgramEvidenceGap, ProgramEvidenceLocation, ProgramProof, ProgramProofKind, ProgramRelation, ProgramRelationKind } from "../../analysis/program-evidence";
import { emptyProgramEvidenceCollectionStats } from "../../analysis/program-evidence-collector-instrumentation";
import { ProgramFactIndex } from "../../analysis/program-fact-index";
import type { SliceDirection } from "../../analysis/scope-seam";
import type { Span } from "../selection";

type Span4 = [number, number, number, number];
type WireProof = { k: string; d: string; f?: number; s?: Span4 };

/** One element on the wire: kind, file index, span, label, proof; the rest only when set. */
export type WireElement = {
  k: string;
  /** The kind in the id when it differs from `k` (a return's id is `return` whatever its kind). */
  ik?: string;
  f: number;
  s: Span4;
  l: string;
  p: WireProof;
  x?: string;
  op?: string;
  /** Index of the owning function's element. */
  w?: number;
  a?: Record<string, unknown>;
};

export type WireRelation = { k: string; a: number; b: number; p: WireProof; st?: "partial" };

/** An expression a selection may name: span, ast kind, text, checked type and where it came from. */
export type WireExpression = {
  s: Span4;
  k: string;
  t: string;
  ty: string | null;
  ts: "mypy" | "annotation" | null;
  /** The identifier, for names, parameters and def names. */
  n?: string;
  /** A declaration: a parameter, an assignment target, a def's name. */
  d?: 1;
  /** Spans to try when nothing sits on the name itself (the assigned value, the whole def). */
  f?: Span4[];
  /** A call's first-party callee (its function-entry id). */
  callee?: string;
  op?: string;
};

export type WireScope = { s: Span4; name: string; id: string; kind: "function" };

export type PythonRoute = {
  key: string;
  pathPattern: string;
  file: string;
  framework: "fastapi" | "flask";
  methods: string[];
  handler: { name: string; qualname: string; line: number; entryId: string };
  responseModel: string | null;
  parameters: { name: string; kind: "dynamic" | "catch-all" }[];
};

export type PythonFactsOutput = {
  files: string[];
  modules: string[];
  elements: WireElement[];
  relations: WireRelation[];
  expressions: Record<string, WireExpression[]>;
  scopes: Record<string, WireScope[]>;
  callSites: Record<string, { calls: string[]; escapes: boolean; name: string }>;
  routes: PythonRoute[];
  fileGaps: { file: string; reason: string; message: string }[];
  python: string;
  executable: string;
  checker: { name: "mypy"; version: string | null; status: "ok" | "failed" | "missing"; message: string | null; typesPython: string | null; elapsedMs: number };
  timings: { parseMs: number; checkMs: number; factsMs: number };
};

export function toSpan(s: Span4): Span {
  return { startLine: s[0], startColumn: s[1], endLine: s[2], endColumn: s[3] };
}

export function spanKey(span: Span): string {
  return `${span.startLine}:${span.startColumn}-${span.endLine}:${span.endColumn}`;
}

/** The raw elements and relations, ids rebuilt, owners and files resolved. */
export function expandPythonFacts(output: PythonFactsOutput): { elements: ProgramElement[]; relations: ProgramRelation[] } {
  const { files } = output;
  const location = (file: number, s: Span4): ProgramEvidenceLocation => ({ file: files[file] ?? "", line: s[0], column: s[1], span: toSpan(s) });
  const proof = (wire: WireProof, fallback: ProgramEvidenceLocation): ProgramProof => ({
    // The helper's proof kinds (`annotation`, `mypy`, `fastapi`, `import`) name where the fact came from.
    kind: wire.k as ProgramProofKind,
    detail: wire.d,
    locations: [wire.f !== undefined && wire.s ? location(wire.f, wire.s) : fallback],
  });
  const ids = output.elements.map((element) => `py:${element.ik ?? element.k}:${files[element.f]}:${spanKey(toSpan(element.s))}${element.x ?? ""}`);
  const elements = output.elements.map((element, index): ProgramElement => {
    const at = location(element.f, element.s);
    return {
      id: ids[index],
      kind: element.k as ProgramElementKind,
      operationKind: (element.op ?? null) as ProgramElement["operationKind"],
      label: element.l,
      expression: null,
      location: at,
      symbolId: null,
      typeId: null,
      module: null,
      definitionId: null,
      ownerId: element.w !== undefined ? ids[element.w] ?? null : null,
      attributes: { language: "python", ...scalars(element.a) },
      componentBinding: null,
      confidence: "proven",
      proof: proof(element.p, at),
    };
  });
  const relations = output.relations.map((relation): ProgramRelation => {
    const from = ids[relation.a];
    const to = ids[relation.b];
    const at = elements[relation.b].location;
    const relationProof = proof(relation.p, at);
    return {
      id: `${relation.k}:${from}->${to}`,
      from,
      to,
      kind: relation.k as ProgramRelationKind,
      evidence: relationProof.locations,
      proof: relationProof,
      confidence: relation.st ?? "proven",
    };
  });
  return { elements, relations };
}

function scalars(attributes: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

/**
 * Every relation is known up front (the helper walks the whole program once),
 * so the provider is two endpoint maps. It implements the same interface as
 * the TypeScript lazy provider: the fact index, relations by endpoint, gaps.
 */
export class PythonRelationProvider implements EvidenceRelationProvider {
  readonly factIndex: ProgramFactIndex;
  readonly facts: ProgramFactIndex;
  private readonly outgoing = new Map<string, ProgramRelation[]>();
  private readonly incoming = new Map<string, ProgramRelation[]>();
  private readonly state: InstrumentationState;

  constructor(elements: readonly ProgramElement[], relations: readonly ProgramRelation[], files: readonly string[], collectionTimeMs = 0) {
    this.factIndex = new ProgramFactIndex(elements, files);
    this.facts = this.factIndex;
    for (const relation of relations) {
      (this.outgoing.get(relation.from) ?? this.outgoing.set(relation.from, []).get(relation.from)!).push(relation);
      (this.incoming.get(relation.to) ?? this.incoming.set(relation.to, []).get(relation.to)!).push(relation);
    }
    this.state = {
      factCount: this.factIndex.factCount,
      expansionRequests: 0,
      materializedRelationCount: relations.length,
      memoHits: 0,
      collectionTimeMs,
      expansionTimeMs: 0,
      recipeCount: 0,
      relationIndexCount: relations.length * 2,
      initialRecipeCount: 0,
      initialRelationIndexCount: relations.length * 2,
      lastExpansionRecipeCount: 0,
      lastExpansionRelationIndexCount: 0,
      lastExpansionScannedRelationCount: 0,
      lastExpansionSourceFilesVisited: 0,
      lastExpansionAstUnitsVisited: 0,
      lastExpansionPartitionsVisited: 0,
      lastExpansionRecipesExamined: 0,
      totalExpansionScannedRelationCount: 0,
      totalExpansionSourceFilesVisited: 0,
      totalExpansionAstUnitsVisited: 0,
      totalExpansionPartitionsVisited: 0,
      totalExpansionRecipesExamined: 0,
      deferredCollection: emptyProgramEvidenceCollectionStats(files.length),
      memory: readMemorySnapshot(),
    };
  }

  getRelations(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken): readonly ProgramRelation[] {
    cancellation?.throwIfCancelled();
    this.state.expansionRequests += 1;
    if (direction === "forward") return this.outgoing.get(elementId) ?? [];
    if (direction === "backward") return this.incoming.get(elementId) ?? [];
    return [...(this.outgoing.get(elementId) ?? []), ...(this.incoming.get(elementId) ?? [])];
  }

  getGaps(): readonly ProgramEvidenceGap[] {
    return [];
  }

  getInstrumentation(): EvidenceProviderInstrumentation {
    return instrumentationSnapshot(this.state, this.factIndex);
  }
}

export function createPythonProvider(output: PythonFactsOutput): PythonRelationProvider {
  const { elements, relations } = expandPythonFacts(output);
  return new PythonRelationProvider(elements, relations, output.files, output.timings.factsMs);
}
