// What the anchor graph's slices may walk, and how far. The anchor graph
// draws values moving; a slice that also climbed structural relations would
// spend its limits where nothing is ever drawn.
import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { toSliceElement, toSliceRelation } from "../analysis/evidence-slice-normalization";
import type { EvidenceRelationSource } from "../analysis/evidence-slice-support";
import { DEFAULT_BOUNDARY_POLICY, type ProgramElement, type ProgramRelation } from "../analysis/scope-seam";

/**
 * Structural relations: they place elements (a function contains its body,
 * declares its parameters; a use names its definition), they do not move
 * values. From any element, `contains` climbs to its enclosing function and
 * from there to every element in it and every caller of it: a slice that
 * follows it fills its element limit with places no value reaches.
 */
export const STRUCTURAL_RELATIONS: ReadonlySet<string> = new Set(["contains", "declares-parameter", "definition"]);

/**
 * The anchor graph's limits, per slice. Once a slice walks only value
 * relations, real files' closures are a few hundred elements; four times the
 * engine's defaults finish all but the true hubs (a `cn()` every className
 * passes through, a theme object of hundreds of literals) in tens of
 * milliseconds, and those still fold into one named frontier.
 */
export const ANCHOR_LIMITS = {
  maxDepth: DEFAULT_BOUNDARY_POLICY.maxDepth,
  maxElements: 4 * DEFAULT_BOUNDARY_POLICY.maxElements,
  maxRelations: 4 * DEFAULT_BOUNDARY_POLICY.maxRelations,
  maxTerminals: 256,
  /**
   * Uses of a declaration walked forward. A hub (a tRPC proxy, a `cn()`)
   * has hundreds, each a slice of its own; past these the rest are drawn and
   * fold into one frontier.
   */
  maxWalkedUses: 32,
} as const;

/** Whether a slice walks this relation: only one that moves a value, so what a slice spends is what the walk can draw. */
export function movesValue(relation: Pick<ProgramRelation, "kind">): boolean {
  return !STRUCTURAL_RELATIONS.has(relation.kind);
}

/** Relations that point a use (a call, an occurrence) at its definition. */
const USE_RELATIONS = new Set(["definition", "invokes", "function-call", "component-occurrence"]);

/**
 * Where a declaration is used: the calls and occurrences one relation away
 * that name it, read straight from the index. Every one of them, not as many
 * as a slice's element limit happens to take.
 */
export function usesOf(provider: EvidenceRelationSource, declarationId: string, cancellation?: AnalysisCancellationToken): { relation: ProgramRelation; use: ProgramElement }[] {
  const uses: { relation: ProgramRelation; use: ProgramElement }[] = [];
  for (const raw of provider.getRelations(declarationId, "backward", cancellation)) {
    const relation = toSliceRelation(raw);
    if (relation.to !== declarationId || !USE_RELATIONS.has(relation.kind) || relation.status === "unsupported") continue;
    const indexed = provider.factIndex.getElement(relation.from);
    const use = indexed ? toSliceElement(indexed) : null;
    if (use && use.status !== "unsupported") uses.push({ relation, use });
  }
  return uses;
}
