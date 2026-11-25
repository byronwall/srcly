// What library calls do with the functions and values they are given, read
// from the access paths (`flows`) of their library-model rows
// (`engine/models/*.json`). Adding a library is adding rows; these readers
// turn a row's paths into the shape each collector rule needs.
import { builtinLibraryModels, LIBRARY_FLOW_PATTERN, tsModelModule, type LibraryModelRow } from "./library-models";
import { cellFlow, holdsState } from "./cells";

/**
 * `returns` the call's value is what its callback (at that argument) returns,
 * or with `compares` a boolean test of it;
 * `passes` the call's value carries those arguments (`*` every one);
 * `source` and `callback` the callback's first parameter receives what the
 * source returns (or is); `packs` the call's value is an object that holds
 * that argument in one field (`useRef(x).current`). A flow with none of these is a call with no value:
 * its callback runs for what it does (`useEffect`), and nothing comes back.
 */
export type FrameworkFlow = { returns?: number; compares?: boolean; passes?: number[] | "*"; source?: number; callback?: number; packs?: { argument: number; field: string } };

/** One access path of a row: the value at `from` reaches `to`, or with `test` a boolean test of it reaches `to`. */
export type Flow = { from: string; to: string; test: boolean };

const parsed = new WeakMap<LibraryModelRow, Flow[]>();

/** A row's access paths, parsed once. */
export function rowPaths(row: LibraryModelRow | null): Flow[] {
  const written = row?.flows ?? row?.yields;
  if (!row || !written) return [];
  let flows = parsed.get(row);
  if (!flows) {
    flows = written.map((flow) => {
      const match = LIBRARY_FLOW_PATTERN.exec(flow)!;
      return { from: match[1], to: match[2], test: match[3] === "test" };
    });
    parsed.set(row, flows);
  }
  return flows;
}

const num = (pattern: RegExp, text: string) => {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : undefined;
};
const first = <T,>(items: readonly T[]) => items.find((item) => item !== undefined);
const member = (path: string) => /^Argument\[0\]\.Member\[(\w+)\]/.exec(path)?.[1];

/** The row for an imported framework call (`solid-js`'s `createMemo`), by its module and export name. */
export function frameworkRow(module: string, name: string): LibraryModelRow | null {
  return builtinLibraryModels().lookup("ts", tsModelModule(module), name);
}

/** Whether a path touches the call's value: a `calls-back` row with none has no value (`useEffect`). */
const touchesResult = (flows: Flow[]) => flows.some((flow) => flow.from.startsWith("ReturnValue") || flow.to.startsWith("ReturnValue"));

const yieldsNothing = (row: LibraryModelRow | null) => row?.model === "calls-back" && !touchesResult(rowPaths(row));

/** The argument whose function's return reaches `to` (as a value, or with `test` as a test of it). */
const callbackInto = (flows: Flow[], to: RegExp, test: boolean) =>
  first(flows.filter((flow) => flow.test === test && to.test(flow.to)).map((flow) => num(/^Argument\[(\d+)\]\.ReturnValue$/, flow.from)));

/** `[source, callback]`: an argument whose value or return another argument's function takes as its first parameter. */
function sourceOf(flows: Flow[], callback?: number): readonly [number, number] | undefined {
  for (const flow of flows) {
    const to = num(/^Argument\[(\d+)\]\.Parameter\[0\]$/, flow.to);
    const from = num(/^Argument\[(\d+)\]/, flow.from);
    if (to !== undefined && from !== undefined && from !== to && (callback === undefined || to === callback)) return [from, to];
  }
  return undefined;
}

/** Whether the call makes an accessor: calling its value yields something (`ReturnValue.ReturnValue`). */
const isAccessor = (row: LibraryModelRow | null) => row?.model === "calls-back" && rowPaths(row).some((flow) => flow.to.startsWith("ReturnValue.ReturnValue"));

/**
 * The options key whose function a data hook calls (`queryFn`): one whose
 * return the hook keeps, or that it enters or hands fields to, and that no
 * other option's function feeds (an observer such as `onSuccess` is fed).
 */
export function primaryOption(row: LibraryModelRow | null): string | null {
  if (row?.model !== "calls-back") return null;
  const candidates = new Set<string>();
  const fed = new Set<string>();
  for (const { from, to } of rowPaths(row)) {
    const fromKey = member(from);
    const toKey = member(to);
    if (fromKey && from === `Argument[0].Member[${fromKey}].ReturnValue` && to.startsWith("ReturnValue")) candidates.add(fromKey);
    if (toKey && to.startsWith(`Argument[0].Member[${toKey}].Parameter[0]`) && (from.startsWith("ReturnValue") || to.includes(".Parameter[0].Member["))) candidates.add(toKey);
    if (toKey && /\.Parameter\[\d+\]$/.test(to) && /^Argument\[0\]\.Member\[\w+\]\.(ReturnValue|Parameter)/.test(from)) fed.add(toKey);
  }
  return [...candidates].find((item) => !fed.has(item)) ?? null;
}

/** The result field an option function's return fills (`data`). */
const optionField = (flows: Flow[], option: string) =>
  first(flows.filter((flow) => flow.from === `Argument[0].Member[${option}].ReturnValue`).map((flow) => /^ReturnValue\.Member\[(\w+)\]$/.exec(flow.to)?.[1]));

/** How the call moves values (`FrameworkFlow`), or undefined for a call no flow row names. */
export function frameworkFlow(module: string, name: string): FrameworkFlow | undefined {
  return rowFlow(frameworkRow(module, name));
}

/** How a row's call moves values (`FrameworkFlow`): an imported call's, or a standard-library member's (`Object.assign`). */
export function rowFlow(row: LibraryModelRow | null): FrameworkFlow | undefined {
  if (!row) return undefined;
  const flows = rowPaths(row);
  if (row.model === "passes-through") {
    const passes = flows.filter((flow) => flow.to === "ReturnValue").map((flow) => flow.from);
    // An object that holds the argument in one field (`useRef(x).current`).
    const packed = flows.find((flow) => /^ReturnValue\.Member\[\w+\]$/.test(flow.to));
    const packedArgument = packed ? num(/^Argument\[(\d+)\]$/, packed.from) : undefined;
    if (packed && packedArgument !== undefined) return { packs: { argument: packedArgument, field: /Member\[(\w+)\]/.exec(packed.to)![1] } };
    return { passes: passes.includes("Argument[0..]") ? "*" : passes.flatMap((from) => num(/^Argument\[(\d+)\]$/, from) ?? []) };
  }
  if (yieldsNothing(row)) return {};
  const result = /^ReturnValue(\.ReturnValue)?$/;
  if (row.model === "calls-back") {
    const tested = callbackInto(flows, result, true);
    if (tested !== undefined) return { returns: tested, compares: true };
  }
  // A wrapper that fills its function's first parameter from a source (`on(source, fn)`).
  if (row.model === "wraps") {
    const source = sourceOf(flows);
    if (source) return { source: source[0], callback: source[1] };
  }
  if (row.model === "calls-back") {
    const returns = callbackInto(flows, result, false);
    if (returns !== undefined) {
      const source = sourceOf(flows, returns);
      return source ? { returns, source: source[0], callback: returns } : { returns };
    }
  }
  // A reducer cell names its reducer: what the reducer returns is the call's value.
  if (row.model === "cell") return cellFlow(row);
  return undefined;
}

/**
 * Whether the row says the call's value is what a callback returns
 * (`useMemo`, a data hook's option function with a result field), so an
 * argument the row does not name (a dependency list, a query's key) is not in it.
 */
export function yieldsOnlyCallback(module: string, name: string): boolean {
  const row = frameworkRow(module, name);
  if (row?.model !== "calls-back") return false;
  const flows = rowPaths(row);
  const option = primaryOption(row);
  if (option) return optionField(flows, option) !== undefined;
  return callbackInto(flows, /^ReturnValue$/, false) !== undefined && !isAccessor(row) && sourceOf(flows) === undefined;
}

/** Whether the call has no value (`useEffect`): nothing it is given, and nothing its callback returns, reaches what binds it. */
export function hasNoValue(module: string, name: string): boolean {
  return yieldsNothing(frameworkRow(module, name));
}

/** Which argument the call returns, wrapped (`action(fn)`, `useCallback(fn)`, `debounce(fn)`, `on(source, fn)`), or null for any other call. */
export function wrappedPosition(module: string, name: string): number | null {
  const row = frameworkRow(module, name);
  if (row?.model !== "wraps") return null;
  const flows = rowPaths(row);
  return first([...flows.filter((flow) => flow.to === "ReturnValue").map((flow) => num(/^Argument\[(\d+)\]$/, flow.from)), callbackInto(flows, /^ReturnValue\.ReturnValue$/, false)]) ?? null;
}

/**
 * Whether what `const x = call(fn)` binds runs `fn`, so `x()` is a call of it.
 * True for a call no row names. False where a row says otherwise: an effect
 * (no value), `batch(fn)` (what `fn` returns), `createSelector(fn)` (a test).
 */
export function yieldsFirstFunction(module: string, name: string): boolean {
  const row = frameworkRow(module, name);
  if (row?.model === "wraps") return wrappedPosition(module, name) === 0;
  // A cell that only watches a function (`useSubmission`) yields its result fields, never the function.
  if (row?.model === "cell" && !holdsState(row)) return false;
  // An accessor of a later argument's return (`mapArray(list, fn)`) is not a call of the first: the accessor's own call carries the value.
  return row?.model !== "calls-back" || (isAccessor(row) && callbackInto(rowPaths(row), /^ReturnValue\.ReturnValue$/, false) === 0);
}

/** Whether calling what the factory makes tests a key against its source (`createSelector`), rather than yields the source's value. */
export function makesPredicate(module: string, name: string): boolean {
  return rowPaths(frameworkRow(module, name)).some((flow) => flow.test && flow.to === "ReturnValue.ReturnValue");
}

/** Whether the call makes an accessor that yields its callback's return (`createMemo`, `createAsync`). */
export function makesAccessor(module: string, name: string): boolean {
  return isAccessor(frameworkRow(module, name));
}

/** The options key a data hook reads its function from (`useQuery`'s `queryFn`), or null. */
export function optionFlow(module: string, name: string): string | null {
  return primaryOption(frameworkRow(module, name));
}

/**
 * The result fields of a call that watches a function it is given (`useSubmission(action)`):
 * `field` holds what the function returns, and `input` the arguments of each call of it. Null for any other call.
 */
export function watchedFunction(module: string, name: string): { at: number; field: string; input: string | null } | null {
  const row = frameworkRow(module, name);
  if (row?.model !== "cell" || holdsState(row)) return null;
  const flows = rowPaths(row);
  for (const flow of flows) {
    const at = num(/^Argument\[(\d+)\]\.ReturnValue\.Awaited$/, flow.from);
    const field = /^ReturnValue\.Member\[(\w+)\]$/.exec(flow.to)?.[1];
    if (at === undefined || !field) continue;
    const input = first(flows.filter((item) => item.from === `Argument[${at}].Parameter[0..]`).map((item) => /^ReturnValue\.Member\[(\w+)\]$/.exec(item.to)?.[1]));
    return { at, field, input: input ?? null };
  }
  return null;
}

/** What a standard callback's parameter takes: an element of the receiver, its index (no value), the receiver, or an accumulator. */
type CallbackParameter = "element" | "index" | "receiver" | "accumulator";

/**
 * A standard method's callback (`rows.map`, `rows.reduce`): the argument it
 * is at, what each parameter takes, the argument that seeds an accumulator,
 * and whether the call yields the callback's return, nothing, or something
 * else (the receiver or an element). Null for any other row.
 */
export function standardCallback(row: LibraryModelRow | null): { at: number; parameters: CallbackParameter[]; seed: number | undefined; yields: "callback" | "nothing" | "other" } | null {
  if (row?.model !== "calls-back") return null;
  const flows = rowPaths(row);
  // A promise's callbacks take its outcomes (`promiseChannels`), not its receiver.
  const at = first(flows.filter((flow) => flow.from.startsWith("Argument[this]") && !flow.from.startsWith("Argument[this].Awaited")).map((flow) => num(/^Argument\[(\d+)\]\.Parameter\[\d+\]$/, flow.to)));
  if (at === undefined) return null;
  const parameters: CallbackParameter[] = [];
  let seed: number | undefined;
  for (const { from, to } of flows) {
    const index = num(new RegExp(`^Argument\\[${at}\\]\\.Parameter\\[(\\d+)\\]$`), to);
    if (index === undefined) continue;
    if (from === "Argument[this].ArrayElement") parameters[index] = "element";
    else if (from === "Argument[this]") parameters[index] = "receiver";
    else if (from === `Argument[${at}].ReturnValue`) parameters[index] = "accumulator";
    else seed = num(/^Argument\[(\d+)\]$/, from) ?? seed;
  }
  for (let index = 0; index < parameters.length; index++) parameters[index] ??= "index";
  const yields = flows.filter((flow) => flow.to === "ReturnValue");
  return { at, parameters, seed, yields: !yields.length ? "nothing" : yields.some((flow) => !flow.test && flow.from === `Argument[${at}].ReturnValue`) ? "callback" : "other" };
}

/**
 * A promise member's channels (`then`, `catch`, `finally`): the callback that
 * takes each outcome, the callbacks whose return fulfils the new promise, and
 * whether it keeps the fulfilled value whatever its callbacks do. Null for any other row.
 */
export function promiseChannels(row: LibraryModelRow | null): { fulfilled?: number; rejected?: number; returns: readonly number[]; keeps: boolean } | null {
  if (row?.model !== "calls-back") return null;
  const flows = rowPaths(row);
  if (!flows.some((flow) => flow.from.startsWith("Argument[this].Awaited"))) return null;
  const into = (from: string) => first(flows.filter((flow) => flow.from === from).map((flow) => num(/^Argument\[(\d+)\]\.Parameter\[0\]$/, flow.to)));
  return {
    fulfilled: into("Argument[this].Awaited"),
    rejected: into("Argument[this].Awaited[error]"),
    returns: flows.filter((flow) => flow.to === "ReturnValue.Awaited").flatMap((flow) => num(/^Argument\[(\d+)\]\.ReturnValue$/, flow.from) ?? []),
    keeps: flows.some((flow) => flow.from === "Argument[this].Awaited" && flow.to === "ReturnValue.Awaited"),
  };
}
