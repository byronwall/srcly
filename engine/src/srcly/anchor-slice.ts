// What the anchor graph's slices may walk, and how far. The anchor graph
// draws values moving; a slice that also climbed structural relations would
// spend its limits where nothing is ever drawn.
import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { toSliceElement, toSliceRelation } from "../analysis/evidence-slice-normalization";
import type { EvidenceRelationSource } from "../analysis/evidence-slice-support";
import { DEFAULT_BOUNDARY_POLICY, type ProgramElement, type ProgramRelation } from "../analysis/scope-seam";
import { TERMINAL_KINDS } from "./facts";

/**
 * Structural relations: they place elements (a function contains its body,
 * declares its parameters; a use names its definition), they do not move
 * values. From any element, `contains` climbs to its enclosing function and
 * from there to every element in it and every caller of it: a slice that
 * follows it fills its element limit with places no value reaches.
 * `performs` names what a call or function is (a validation, a parse): the
 * call itself carries its value on, so the classification is no step of its own.
 */
export const STRUCTURAL_RELATIONS: ReadonlySet<string> = new Set(["contains", "declares-parameter", "definition", "performs"]);

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

/** Relations the anchor walk never draws: structural ones, and `invokes` (a call to the body it enters, which the walk reaches through the call's arguments and return). */
export const UNDRAWN_RELATIONS: ReadonlySet<string> = new Set([...STRUCTURAL_RELATIONS, "invokes"]);

/** Where the anchor walk ends a path: a terminal forward (a return still carries on to its paired call), an origin backward. */
export function endsWalk(element: ProgramElement, forward: boolean): boolean {
  if (!forward) return element.originRoles.length > 0;
  return element.kind !== "return" && (element.terminalRoles.length > 0 || TERMINAL_KINDS.has(element.kind));
}

/**
 * What a slice from `seedId` walks: only what the anchor walk can draw, so
 * what a slice spends is what the walk can draw. No relation it never draws,
 * and nothing past an element it ends at (the seed itself never ends it).
 */
export function walkFollows(seedId: string, forward: boolean): (relation: ProgramRelation, from: ProgramElement) => boolean {
  return (relation, from) => !UNDRAWN_RELATIONS.has(relation.kind) && (from.id === seedId || !endsWalk(from, forward));
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

/**
 * The callee a relation assumes through, else null: an argument, or the
 * receiver a library method consumes (`x.trim`), handed to a call with no
 * body to enter (no `invokes`). That the call's value derives from it is
 * what code with no source to read is taken to do, never proven.
 */
export function assumedThrough(provider: EvidenceRelationSource, relation: Pick<ProgramRelation, "kind" | "from" | "to">): string | null {
  if (relation.kind !== "argument" && relation.kind !== "references") return null;
  const call = provider.factIndex.getElement(relation.to);
  if (call?.kind !== "call") return null;
  if (relation.kind === "references" && !["field-read", "value"].includes(provider.factIndex.getElement(relation.from)?.kind ?? "")) return null;
  // A body to enter, or what the call does modelled by the framework's runtime (a resource, its accessor), its state (a state pair's factory or getter) or a classified operation (`performs`): not assumed.
  const sameSpan = (id: string) => {
    const other = provider.factIndex.getElement(id);
    return other && other.location.file === call.location.file && JSON.stringify(other.location.span) === JSON.stringify(call.location.span) ? toSliceElement(other) : null;
  };
  for (const item of provider.getRelations(call.id, "both")) {
    if (item.kind === "invokes" && item.from === call.id) return null;
    if (item.kind === "performs" && item.from === call.id) return null;
    if (item.proof.kind === "framework-state") return null;
    if (sameSpan(item.from === call.id ? item.to : item.from)?.boundary === "framework-runtime") return null;
  }
  return call.label;
}
