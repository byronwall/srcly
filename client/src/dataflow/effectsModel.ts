// What the effects panel says about one function, as plain data from the
// engine's functionEffects result: Known facts grouped by family, Partial
// frontiers beside them, how each promise is handled, and the assumptions.
// No UI here, so the wording is testable on the fake engine's shapes.
import type { FunctionEffectsResult } from "./contract.generated";

export type EffectFact = FunctionEffectsResult["facts"][number];
export type EffectFrontier = FunctionEffectsResult["frontiers"][number];
export type EffectFamily = EffectFact["family"];

export const FAMILY_ORDER: EffectFamily[] = ["external", "write", "input", "throw", "timer", "promise"];

export const FAMILY_WORDS: Record<EffectFamily, { title: string; hint: string }> = {
  external: { title: "Leaves the program", hint: "network, filesystem, host output, exit, library calls" },
  write: { title: "Writes what outlives the call", hint: "a parameter, this, module-level state" },
  input: { title: "Reads what it was not given", hint: "module-level state, the clock, randomness, files" },
  throw: { title: "Can throw", hint: "a throw statement on some path" },
  timer: { title: "Schedules work", hint: "timers and scheduled callbacks" },
  promise: { title: "Yields and settles", hint: "awaits, promises made and settled" },
};

export const ACTIVATION_WORDS: Record<EffectFact["activation"], string> = {
  direct: "on the call",
  "after-await": "after an await",
  timer: "from a timer",
  latent: "latent",
};

export const HANDLING_WORDS: Record<FunctionEffectsResult["resultHandling"][number]["handling"], string> = {
  awaited: "awaited",
  returned: "returned",
  assigned: "assigned",
  passed: "passed along",
  discarded: "discarded",
};

export const FRONTIER_WORDS: Record<string, string> = {
  "callback-parameter": "a callback the caller supplies",
  "dynamic-dispatch": "a computed callee",
  "unresolved-callee": "a callee the checker cannot name",
  recursion: "already on the call chain",
  budget: "past the budget",
  "external-library": "a library the analysis does not follow",
};

export interface EffectGroup {
  family: EffectFamily;
  title: string;
  hint: string;
  facts: EffectFact[];
  /** How many of the group's facts are proven. */
  proven: number;
}

export interface EffectsView {
  callable: FunctionEffectsResult["callable"];
  outcome: FunctionEffectsResult["outcome"];
  coverage: FunctionEffectsResult["coverage"];
  /** One line under the name: what is known and what is partial. */
  headline: string;
  groups: EffectGroup[];
  frontiers: EffectFrontier[];
  handling: FunctionEffectsResult["resultHandling"];
  assumptions: string[];
  counts: FunctionEffectsResult["counts"];
}

/** The chain from the selected function to a witness, as words: "via a › b". */
export function viaText(via: EffectFact["via"]): string | null {
  return via.length ? `via ${via.map((step) => step.callable).join(" › ")}` : null;
}

export function effectsView(result: FunctionEffectsResult): EffectsView {
  const groups: EffectGroup[] = FAMILY_ORDER.map((family) => {
    const facts = result.facts.filter((fact) => fact.family === family);
    return { family, title: FAMILY_WORDS[family].title, hint: FAMILY_WORDS[family].hint, facts, proven: facts.filter((fact) => fact.status === "proven").length };
  }).filter((group) => group.facts.length > 0);
  const known = result.facts.length;
  const partial = result.frontiers.length;
  const headline =
    result.coverage === "not-analyzed"
      ? "No function at this position"
      : known === 0 && partial === 0
        ? "Closed: nothing it touches is visible from outside, under the assumptions below"
        : `${known} known effect${known === 1 ? "" : "s"}${partial ? ` · ${partial} place${partial === 1 ? "" : "s"} the analysis could not follow` : ""}`;
  return {
    callable: result.callable,
    outcome: result.outcome,
    coverage: result.coverage,
    headline,
    groups,
    frontiers: result.frontiers,
    handling: result.resultHandling,
    assumptions: result.assumptions,
    counts: result.counts,
  };
}
