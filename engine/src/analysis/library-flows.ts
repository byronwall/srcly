// Migration stage 1 (docs/research/dataflow-library-models-2026-11, section 6):
// the access paths (`flows`, `libraryFlowSchema`) each library row means,
// derived from its one-off fields. Nothing reads the paths yet; the
// equivalence test checks that every reader's answer follows from them.
// `origin`, `terminal`, `state-pair` and `store` keep their meaning in the
// model itself (later stages make them shapes); only the fields beside them
// that move values (`lazy`, a reducer's `args`) become paths here.
import type { LibraryModelRow } from "./library-models";

/** Fields that say what a row is or how it reads, not where values go. */
const IDENTITY = new Set(["language", "module", "name", "member", "model", "role", "result", "note", "proof", "flows"]);

const at = (index: string) => (index === "this" ? "Argument[this]" : `Argument[${index}]`);

/**
 * The access paths a row means. Throws for a field or combination the
 * grammar cannot say, naming it, so the equivalence test shows the gap.
 */
export function rowFlows(row: LibraryModelRow): string[] {
  const used = new Set<string>();
  const use = <K extends keyof LibraryModelRow>(key: K): LibraryModelRow[K] => {
    used.add(key);
    return row[key];
  };
  const flows = flowsOf(row, use);
  const left = Object.keys(row).filter((key) => !IDENTITY.has(key) && !used.has(key));
  if (left.length) throw new Error(`cannot express ${left.map((key) => `\`${key}\``).join(", ")} on a ${row.model} row`);
  return flows;
}

type Use = <K extends keyof LibraryModelRow>(key: K) => LibraryModelRow[K];

function flowsOf(row: LibraryModelRow, use: Use): string[] {
  switch (row.model) {
    case "origin":
    case "terminal":
    case "store":
      return [];
    case "state-pair":
      return statePair(use);
    case "passes-through":
      return passesThrough(row, use);
    case "consumes":
      return consumes(use);
    case "wraps":
      return wraps(use);
    case "resource":
      return [];
    case "calls-back":
      return callsBack(row, use);
  }
}

/** A function initial value seeds the state (`lazy`), and a reducer pair's dispatch calls the reducer, whose return is the state. */
function statePair(use: Use): string[] {
  const reducer = use("args");
  if (reducer !== undefined) return [`${at(reducer)}.ReturnValue -> ReturnValue.Member[0]`, `ReturnValue.Member[1].Parameter[0] -> ${at(reducer)}.Parameter[1]`];
  return use("lazy") ? ["Argument[0].ReturnValue -> ReturnValue.Member[0]"] : [];
}

/** The result derives from the arguments it names; a row with no `args` (Python's) from the receiver and every argument. */
function passesThrough(row: LibraryModelRow, use: Use): string[] {
  const args = use("args");
  if (args === undefined) return ["Argument[this] -> ReturnValue", "Argument[0..] -> ReturnValue"];
  return [`${args === "*" ? "Argument[0..]" : at(args)} -> ReturnValue`];
}

/** The receiver keeps the arguments (`writes: this`), or a promise that only rejects (`settles: reject`); otherwise nothing moves. */
function consumes(use: Use): string[] {
  const flows: string[] = [];
  if (use("writes") === "this") flows.push("Argument[0..] -> Argument[this]");
  const settles = use("settles");
  if (settles === "reject") flows.push("Argument[0] -> ReturnValue.Awaited[error]");
  else if (settles !== undefined) throw new Error(`cannot express \`settles: ${settles}\` on a consumes row`);
  return flows;
}

/** The call returns the function it is given; with a `source`, a new function that calls it with what the source returns. */
function wraps(use: Use): string[] {
  const fn = use("args") ?? "0";
  const source = use("source");
  if (source === undefined) return [`${at(fn)} -> ReturnValue`];
  return [`${at(source)}.ReturnValue -> ${at(fn)}.Parameter[0]`, `${at(fn)}.ReturnValue -> ReturnValue.ReturnValue`];
}

function callsBack(row: LibraryModelRow, use: Use): string[] {
  const settles = use("settles");
  if (settles !== undefined) return promise(settles);
  if (row.option !== undefined) return optionHook(row, use);
  if (row.field !== undefined) return watched(use);
  if (row.parameters !== undefined) return standardCallback(use);
  const fn = at(use("args") ?? "0");
  const returns = use("returns");
  const accessor = use("accessor");
  const source = use("source");
  const receives = use("with");
  const flows: string[] = [];
  if (source !== undefined) {
    const suffix = receives === "element" ? ".ReturnValue.ArrayElement" : receives === "awaited" ? ".ReturnValue.Awaited" : receives === undefined ? ".ReturnValue" : null;
    if (suffix === null) throw new Error(`cannot express \`with: ${receives}\` with a source`);
    flows.push(`${at(source)}${suffix} -> ${fn}.Parameter[0]`);
  } else if (receives !== undefined) throw new Error("cannot express `with` without a `source`");
  const value = accessor ? "ReturnValue.ReturnValue" : "ReturnValue";
  if (returns === "callback") flows.push(`${fn}.ReturnValue -> ${value}`);
  else if (returns === "boolean") flows.push(`${fn}.ReturnValue -> ${value} : test`);
  else if (returns !== "void") throw new Error(`cannot express \`returns: ${returns ?? "(none)"}\` on a calls-back row`);
  return flows;
}

/** A standard method's callback (`map`, `reduce`): what each parameter takes, and what the call yields. */
function standardCallback(use: Use): string[] {
  const fn = at(use("args") ?? "0");
  const source = use("source");
  const flows: string[] = [];
  use("parameters")!.forEach((role, index) => {
    const parameter = `${fn}.Parameter[${index}]`;
    if (role === "element") flows.push(`Argument[this].ArrayElement -> ${parameter}`);
    else if (role === "receiver") flows.push(`Argument[this] -> ${parameter}`);
    else if (role === "accumulator") {
      if (source === undefined) throw new Error("cannot express an `accumulator` without a `source`");
      flows.push(`${at(source)} -> ${parameter}`, `${fn}.ReturnValue -> ${parameter}`);
    }
  });
  const returns = use("returns");
  if (returns === "callback") flows.push(`${fn}.ReturnValue -> ReturnValue`);
  else if (returns === "boolean") flows.push(`${fn}.ReturnValue -> ReturnValue : test`);
  else if (returns === "element") flows.push("Argument[this].ArrayElement -> ReturnValue");
  else if (returns === "same") flows.push("Argument[this] -> ReturnValue");
  else if (returns !== "void") throw new Error(`cannot express \`returns: ${returns ?? "(none)"}\` on a standard callback`);
  return flows;
}

/** A promise member's channels (`PROMISE_CHANNELS`): which callback takes which outcome, and what the new promise holds. */
function promise(settles: NonNullable<LibraryModelRow["settles"]>): string[] {
  if (settles === "then") return ["Argument[this].Awaited -> Argument[0].Parameter[0]", "Argument[this].Awaited[error] -> Argument[1].Parameter[0]", "Argument[0].ReturnValue -> ReturnValue.Awaited", "Argument[1].ReturnValue -> ReturnValue.Awaited"];
  if (settles === "catch") return ["Argument[this].Awaited[error] -> Argument[0].Parameter[0]", "Argument[0].ReturnValue -> ReturnValue.Awaited", "Argument[this].Awaited -> ReturnValue.Awaited"];
  if (settles === "finally") return ["Argument[this].Awaited -> ReturnValue.Awaited"];
  throw new Error(`cannot express \`settles: ${settles}\` on a calls-back row`);
}

/**
 * A data hook's option function (`useQuery({ queryFn })`). With a `field`
 * its return fills that result field (after `selector`); without one, a
 * `queryFn`'s return is the call's value. `mutate(x)` and `mutateAsync(x)`
 * call a `mutationFn` with `x`. `hands` fill fields of the object the option
 * function takes; `observers` take its return, its input, or `contextFrom`'s return.
 */
function optionHook(row: LibraryModelRow, use: Use): string[] {
  const key = use("option")!;
  const option = `Argument[0].Member[${key}]`;
  const field = use("field");
  const selector = use("selector");
  const hands = use("hands") ?? {};
  const observers = use("observers") ?? {};
  const contextFrom = use("contextFrom");
  const flows: string[] = [];
  if (field !== undefined) {
    flows.push(`${option}.ReturnValue -> ReturnValue.Member[${field}]`);
    if (selector !== undefined) flows.push(`${option}.ReturnValue -> Argument[0].Member[${selector}].Parameter[0]`, `Argument[0].Member[${selector}].ReturnValue -> ReturnValue.Member[${field}]`);
  } else {
    if (selector !== undefined) throw new Error("cannot express a `selector` without a `field`");
    if (key === "queryFn") flows.push(`${option}.ReturnValue -> ReturnValue`);
  }
  // `mutationFunction` (program-evidence-collector-support.ts) enters a `mutationFn` at `mutate` and `mutateAsync`, by that key.
  if (key === "mutationFn") flows.push(`ReturnValue.Member[mutate].Parameter[0] -> ${option}.Parameter[0]`, `ReturnValue.Member[mutateAsync].Parameter[0] -> ${option}.Parameter[0]`, `${option}.ReturnValue -> ReturnValue.Member[mutateAsync].ReturnValue.Awaited`);
  for (const [name, keys] of Object.entries(hands)) for (const filler of keys) flows.push(`Argument[0].Member[${filler}] -> ${option}.Parameter[0].Member[${name}]`);
  if (contextFrom !== undefined && !Object.values(observers).some((roles) => roles.includes("context"))) throw new Error("cannot express a `contextFrom` no observer takes");
  for (const [name, roles] of Object.entries(observers)) {
    roles.forEach((role, index) => {
      const to = `Argument[0].Member[${name}].Parameter[${index}]`;
      if (role === "result") flows.push(`${option}.ReturnValue -> ${to}`);
      else if (role === "input") flows.push(`${option}.Parameter[0] -> ${to}`);
      else if (role === "context") {
        if (contextFrom === undefined) throw new Error("cannot express a `context` observer without `contextFrom`");
        flows.push(`Argument[0].Member[${contextFrom}].ReturnValue -> ${to}`);
      }
    });
    // A trailing `none` would leave no flow to say the observer takes that many parameters.
    if (roles.at(-1) === "none") throw new Error(`cannot express observer \`${name}\` ending in \`none\``);
  }
  return flows;
}

/** A call that watches a function it is given (`useSubmission(action)`): a result field holds its awaited return, another the arguments of each call of it. */
function watched(use: Use): string[] {
  const fn = at(use("args") ?? "0");
  const flows = [`${fn}.ReturnValue.Awaited -> ReturnValue.Member[${use("field")}]`];
  const input = use("input");
  if (input !== undefined) flows.push(`${fn}.Parameter[0..] -> ReturnValue.Member[${input}]`);
  return flows;
}
