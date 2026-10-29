// What each evidence kind is, in one place. Every relation, element and
// proof kind the analysis can emit has exactly one entry: the `Record`s are
// typed over the analysis's unions, so a new kind does not build until it is
// classified here, and every rule reads a trait instead of keeping its own
// list of names.
import type { ProgramElementKind, ProgramProofKind, ProgramRelationKind } from "../analysis/program-evidence";

export type RelationTraits = {
  /** Places elements (a function contains its body, declares its parameters; a use names its definition; a call performs its classification) and moves no value: slices never walk it. */
  structural?: true;
  /** Between a call and its callee. `local` never leaves the caller (an argument reaches its own call; `invokes` names the callee); `paired` is paired by the slice's invocation stack (T13); `unpaired` keeps R7's one-call-site rule. */
  crossCall?: "local" | "paired" | "unpaired";
  /** Names the callee of a call: the slice follows it, the anchor graph never draws it. */
  callee?: true;
  /** Points a use (a call, an occurrence) at its definition. */
  use?: true;
  /** Carries a parameter's value to its use sites and their first field reads. */
  parameterRead?: true;
  /** Reshapes a value (a collection method, a pack) or branches on it. */
  role?: "transform" | "control";
};

export const RELATION_TRAITS: Record<ProgramRelationKind, RelationTraits> = {
  "contains": { structural: true },
  "declares-parameter": { structural: true },
  "definition": { structural: true, use: true },
  "performs": { structural: true },
  "references": { parameterRead: true },
  "invokes": { crossCall: "local", callee: true, use: true },
  "argument": { crossCall: "local" },
  "argument-binding": { crossCall: "paired" },
  "return-expression": {},
  "return-value": { crossCall: "paired" },
  "field-input": { parameterRead: true },
  "pack-field": { role: "transform" },
  "renders": {},
  "component-occurrence": { use: true },
  "component-prop": {},
  "component-prop-binding": {},
  "render-terminal": {},
  "input-call": {},
  "resource-loader": {},
  "resource-source-parameter": {},
  "context-value": {},
  "framework-flow": {},
  "member-state": {},
  "resource-result": {},
  "effect-input": {},
  "http-bridge": {},
  "carrier": {},
  "collection-element": {},
  "for-element": {},
  "for-callback-parameter": {},
  "callback-parameter": { crossCall: "unpaired" },
  "predicate-return": {},
  "find-result": { role: "transform" },
  "filter-result": { role: "transform" },
  "map-element": { role: "transform" },
  "map-callback-parameter": { role: "transform" },
  "map-result": { role: "transform" },
  "includes-membership": { role: "transform" },
  "join-source": { role: "transform" },
  "function-return": { crossCall: "unpaired" },
  "function-call": { crossCall: "unpaired", use: true },
  "show-when": { role: "control" },
  "show-render-parameter": {},
  "accessor-call": {},
  "consumer-value": {},
};

export type ElementTraits = {
  /** Where a value leaves the program's own data flow. */
  terminal?: true;
  /** Places a walk inside a function; never carries a value of its own. */
  declaration?: true;
  /** Sits beside a carrier (a field consumer, a JSX tag name): a walk ending at one has not lost the value. */
  bookkeeping?: true;
  /** Branches or narrows a value, or reshapes it. */
  role?: "control" | "transform";
  /** A selection may start from it: lower is more specific. */
  seedRank?: number;
};

export const ELEMENT_TRAITS: Record<ProgramElementKind, ElementTraits> = {
  "source-file": {},
  "function-entry": { declaration: true },
  "handler-entry": { declaration: true },
  "component-definition": { declaration: true },
  "parameter": { seedRank: 7 },
  "value": { seedRank: 5 },
  "literal": { seedRank: 9 },
  "derived": {},
  "alias": { seedRank: 6 },
  "call": { seedRank: 3 },
  "return": { terminal: true },
  "field-read": { seedRank: 0 },
  "index-read": { seedRank: 1 },
  "object-pack": { role: "transform" },
  "selection": { role: "transform", seedRank: 4 }, // after the call: a classified call (`xs.filter(…)`) starts at the call, not the operation it performs at its span
  "validation": { role: "transform" },
  "serialization": { role: "transform" },
  "parse": { role: "transform" },
  "type-narrow": { role: "control" },
  "jsx-occurrence": { bookkeeping: true, seedRank: 8 },
  "component-occurrence": { terminal: true },
  "component-prop-binding": {},
  "field-consumer": { bookkeeping: true },
  "collection-element": {},
  "predicate-result": { role: "control" },
  "call-result": { role: "transform", seedRank: 2 },
  "return-expression": {},
  "for-binding": { role: "control" },
  "show-binding": { role: "control" },
  "dom-terminal": { terminal: true },
  "render-terminal": { terminal: true },
  "environment-input": {},
  "process-input": {},
  "file-input": {},
  "fetch-input": {},
  "resource-input": {},
  "resource-result": {},
  "stdout": {},
  "stderr": {},
  "exit-status": {},
  "file-write": {},
  "http-response": {},
  "network-request": {},
  "external-read": {},
  "message": {},
  "external-effect": {},
};

/**
 * How much a proof claims. `proven` is read from the program (syntax, the
 * checker); `modelled` is what the engine knows a framework, host or library
 * does; `assumed` is taken with nothing to read (code with no source, a
 * name). A trace is `ok` only when no step it draws is assumed; one that lands through an assumed step is `assumed`.
 */
export type ProofStrength = "proven" | "modelled" | "assumed";

export const PROOF_TRAITS: Record<ProgramProofKind, { strength: ProofStrength }> = {
  "ast-node": { strength: "proven" },
  "compiler-symbol": { strength: "proven" },
  "argument-binding": { strength: "proven" },
  "return-expression": { strength: "proven" },
  "property-access": { strength: "proven" },
  "jsx-tag": { strength: "proven" },
  "component-prop-binding": { strength: "proven" },
  "for-binding": { strength: "proven" },
  "host-api": { strength: "modelled" },
  "resource-boundary": { strength: "modelled" },
  "carrier-boundary": { strength: "modelled" },
  "awaited-call-alias": { strength: "proven" },
  "direct-snapshot-member": { strength: "proven" },
  "expression-body-return": { strength: "proven" },
  "solid-show-render-prop": { strength: "modelled" },
  "array-find-element": { strength: "modelled" },
  "array-find-callback": { strength: "modelled" },
  "array-find-predicate-return": { strength: "modelled" },
  "array-find-result": { strength: "modelled" },
  "array-filter-element": { strength: "modelled" },
  "array-filter-callback": { strength: "modelled" },
  "array-filter-predicate-return": { strength: "modelled" },
  "array-filter-result": { strength: "modelled" },
  "array-map-element": { strength: "modelled" },
  "array-map-callback": { strength: "modelled" },
  "array-map-property-return": { strength: "modelled" },
  "array-map-result": { strength: "modelled" },
  "array-includes-membership": { strength: "modelled" },
  "array-includes-argument": { strength: "modelled" },
  "array-join-source": { strength: "modelled" },
  "function-call": { strength: "proven" },
  "solid-show-binding": { strength: "modelled" },
  "solid-show-when": { strength: "modelled" },
  "solid-show-render-parameter": { strength: "modelled" },
  "solid-for-binding": { strength: "modelled" },
  "solid-for-each": { strength: "modelled" },
  "solid-for-render-parameter": { strength: "modelled" },
  "accessor-call": { strength: "modelled" },
  "jsx-consumer-value": { strength: "proven" },
  "condition-consumer": { strength: "proven" },
  "render-consumer": { strength: "proven" },
  "handler-consumer": { strength: "proven" },
  "field-consumer-terminal": { strength: "proven" },
  "context-continuity": { strength: "modelled" },
  "partial-classification": { strength: "assumed" },
  "http-bridge": { strength: "modelled" },
  "external-call": { strength: "assumed" },
  "standard-library": { strength: "modelled" },
  "framework-state": { strength: "modelled" },
};

const NONE = {};

/** A relation kind's traits; a kind the analysis does not declare (an anchor graph's own link) has none. */
export function relationTraits(kind: string): RelationTraits {
  return (RELATION_TRAITS as Record<string, RelationTraits>)[kind] ?? NONE;
}

/** An element kind's traits; an undeclared kind has none. */
export function elementTraits(kind: string): ElementTraits {
  return (ELEMENT_TRAITS as Record<string, ElementTraits>)[kind] ?? NONE;
}

/** A proof kind's strength, or null for a kind the analysis does not declare. */
export function proofStrength(kind: string | undefined): ProofStrength | null {
  return kind ? (PROOF_TRAITS as Record<string, { strength: ProofStrength }>)[kind]?.strength ?? null : null;
}

/** Evidence elements a selection may start from, most specific first. */
export const SEED_KINDS: readonly string[] = Object.entries(ELEMENT_TRAITS)
  .filter(([, traits]) => traits.seedRank !== undefined)
  .sort(([, a], [, b]) => a.seedRank! - b.seedRank!)
  .map(([kind]) => kind);
