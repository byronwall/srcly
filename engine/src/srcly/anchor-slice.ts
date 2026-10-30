// What the anchor graph's slices may walk, and how far. The anchor graph
// draws values moving; a slice that also climbed structural relations would
// spend its limits where nothing is ever drawn.
import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { toSliceElement, toSliceRelation } from "../analysis/evidence-slice-normalization";
import type { EvidenceRelationSource } from "../analysis/evidence-slice-support";
import { DEFAULT_BOUNDARY_POLICY, type ProgramElement, type ProgramRelation } from "../analysis/scope-seam";
import { elementTraits, proofStrength, relationTraits } from "./kinds";

export type AnchorLimits = {
  maxDepth: number;
  maxElements: number;
  maxRelations: number;
  maxTerminals: number;
  /**
   * Uses of a declaration walked forward. A hub (a tRPC proxy, a `cn()`)
   * has hundreds, each a slice of its own; past these the rest are drawn and
   * fold into one frontier.
   */
  maxWalkedUses: number;
};

/**
 * The anchor graph's limits, per slice: sixteen times the engine's element
 * and relation defaults, four times its depth. Surveyed on srcly's client and
 * a diagram editor (80 traces each), these find about twice the ends the
 * quarter-size limits did, at a p90 under two seconds, and no walk stops at
 * its depth. Wider still finds nothing more: a quarter of one repo's graphs
 * then pass the byte bound, and those draw nothing.
 */
export const ANCHOR_LIMITS: Readonly<AnchorLimits> = {
  maxDepth: 4 * DEFAULT_BOUNDARY_POLICY.maxDepth,
  maxElements: 16 * DEFAULT_BOUNDARY_POLICY.maxElements,
  maxRelations: 16 * DEFAULT_BOUNDARY_POLICY.maxRelations,
  maxTerminals: 1024,
  maxWalkedUses: 32,
};

/** A quarter of `ANCHOR_LIMITS`: a graph over the byte bound is built again at these before it is refused. */
export const NARROW_ANCHOR_LIMITS: Readonly<AnchorLimits> = {
  maxDepth: DEFAULT_BOUNDARY_POLICY.maxDepth,
  maxElements: 4 * DEFAULT_BOUNDARY_POLICY.maxElements,
  maxRelations: 4 * DEFAULT_BOUNDARY_POLICY.maxRelations,
  maxTerminals: 256,
  maxWalkedUses: 32,
};

/**
 * Whether the anchor walk never draws this relation: a structural one, which
 * places elements and moves nothing (from any element, `contains` climbs to
 * its enclosing function and from there to every element in it and every
 * caller of it; `performs` names what a call is while the call itself carries
 * its value on), or a callee link (`invokes`: a call to the body it enters,
 * which the walk reaches through the call's arguments and return). Both come
 * from `kinds.ts`.
 */
export function undrawn(kind: string): boolean {
  const traits = relationTraits(kind);
  return Boolean(traits.structural || traits.callee);
}

/** Where the anchor walk ends a path: a terminal forward (a return still carries on to its paired call), an origin backward. */
export function endsWalk(element: ProgramElement, forward: boolean): boolean {
  if (!forward) return element.originRoles.length > 0;
  return element.kind !== "return" && (element.terminalRoles.length > 0 || Boolean(elementTraits(element.kind).terminal));
}

/**
 * What a slice from `seedId` walks: only what the anchor walk can draw, so
 * what a slice spends is what the walk can draw. No relation it never draws,
 * and nothing past an element it ends at (the seed itself never ends it).
 */
export function walkFollows(seedId: string, forward: boolean): (relation: ProgramRelation, from: ProgramElement) => boolean {
  return (relation, from) => !undrawn(relation.kind) && (from.id === seedId || !endsWalk(from, forward));
}

/**
 * Annotated uses fold by file. A parameter annotated with the anchor takes a
 * value typed with it, not the anchor's own value, so the walk draws and
 * follows the first such use in each file; each later one in that file folds
 * into it, and `onFold` hears the first's id and how many more it now stands
 * for. True when `use` folded, so it is neither drawn nor walked.
 */
export function foldAnnotatedUses(onFold: (id: string, more: number) => unknown): (use: Pick<ProgramElement, "id" | "kind" | "location">) => boolean {
  const firstByFile = new Map<string, { id: string; more: number }>();
  return (use) => {
    if (use.kind !== "parameter") return false;
    const first = firstByFile.get(use.location.file);
    if (!first) firstByFile.set(use.location.file, { id: use.id, more: 0 });
    else onFold(first.id, (first.more += 1));
    return first !== undefined;
  };
}

/**
 * Where a declaration is used: the calls and occurrences one relation away
 * that name it, read straight from the index. Every one of them, not as many
 * as a slice's element limit happens to take.
 */
export function usesOf(provider: EvidenceRelationSource, declarationId: string, cancellation?: AnalysisCancellationToken): { relation: ProgramRelation; use: ProgramElement }[] {
  const uses: { relation: ProgramRelation; use: ProgramElement }[] = [];
  for (const raw of provider.getRelations(declarationId, "backward", cancellation)) {
    const relation = toSliceRelation(raw);
    if (relation.to !== declarationId || !relationTraits(relation.kind).use || relation.status === "unsupported") continue;
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
  // A body to enter, a classified operation (`performs`), a framework runtime boundary, or any relation at the call whose proof is `modelled` (a library model row, a framework's state or runtime, `kinds.ts`): not assumed.
  const sameSpan = (id: string) => {
    const other = provider.factIndex.getElement(id);
    return other && other.location.file === call.location.file && JSON.stringify(other.location.span) === JSON.stringify(call.location.span) ? toSliceElement(other) : null;
  };
  for (const item of provider.getRelations(call.id, "both")) {
    if (item.kind === "invokes" && item.from === call.id) return null;
    if (item.kind === "performs" && item.from === call.id) return null;
    // A control-flow callback's accessor (`<Show when={x}>{(v) => v()}`): the binding says what it returns.
    if (item.kind === "accessor-call" && item.to === call.id) return null;
    // A service client's read or write (`prisma.doc.update`) classified by its contract: the call is the boundary, modelled.
    if ((item.kind === "input-call" || item.kind === "effect-input") && item.from === call.id) {
      const end = provider.factIndex.getElement(item.to);
      if (end && ["external-read", "external-effect", "message"].includes(end.kind) && end.attributes?.operation !== undefined) return null;
    }
    // A classified read whose value the call yields (a router's `useParams()`): the read is the call's origin, modelled.
    if (item.kind === "carrier" && item.to === call.id) {
      const start = provider.factIndex.getElement(item.from);
      if (start?.kind === "external-read" && start.attributes?.operation !== undefined) return null;
    }
    if (proofStrength(item.proof.kind) === "modelled") return null;
    if (sameSpan(item.from === call.id ? item.to : item.from)?.boundary === "framework-runtime") return null;
  }
  return call.label;
}

/** Whether the collector classified this call (`performs`: a parse, a selection): its operation is bookkeeping at the call, not where its value goes. */
export function performs(provider: EvidenceRelationSource, id: string): boolean {
  return provider.getRelations(id, "forward").some((relation) => relation.kind === "performs" && relation.from === id);
}
