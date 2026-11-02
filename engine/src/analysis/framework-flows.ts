// What framework calls do with the functions and values they are given, read
// from their library-model rows (`engine/models/solid.json`, `react.json`,
// `utilities.json`). Adding a framework is adding rows; these readers turn a
// row into the shape each collector rule needs.
import { builtinLibraryModels, tsModelModule, type LibraryModelRow } from "./library-models";

/**
 * `returns` the call's value is what its callback (at that argument) returns,
 * or with `compares` a boolean test of it;
 * `passes` the call's value carries those arguments (`*` every one);
 * `source` and `callback` the callback's first parameter receives what the
 * source returns (or is). A flow with none of these is a call with no value:
 * its callback runs for what it does (`useEffect`), and nothing comes back.
 */
export type FrameworkFlow = { returns?: number; compares?: boolean; passes?: number[] | "*"; source?: number; callback?: number };

/** The row for an imported framework call (`solid-js`'s `createMemo`), by its module and export name. */
export function frameworkRow(module: string, name: string): LibraryModelRow | null {
  return builtinLibraryModels().lookup("ts", tsModelModule(module), name);
}

const yieldsNothing = (row: LibraryModelRow | null) => row?.model === "calls-back" && row.returns === "void";

const argument = (row: LibraryModelRow) => (row.args !== undefined && /^\d+$/.test(row.args) ? Number(row.args) : undefined);

/** How the call moves values (`FrameworkFlow`), or undefined for a call no flow row names. */
export function frameworkFlow(module: string, name: string): FrameworkFlow | undefined {
  const row = frameworkRow(module, name);
  if (!row) return undefined;
  const at = argument(row);
  if (row.model === "passes-through") return { passes: at === undefined ? "*" : [at] };
  if (yieldsNothing(row)) return {};
  if (row.model === "calls-back" && row.returns === "boolean" && at !== undefined) return { returns: at, compares: true };
  // A wrapper that fills its function's first parameter from a source (`on(source, fn)`).
  if (row.model === "wraps" && row.source !== undefined && at !== undefined) return { source: Number(row.source), callback: at };
  if (row.model === "calls-back" && row.returns === "callback" && at !== undefined) {
    return row.source !== undefined ? { returns: at, source: Number(row.source), callback: at } : { returns: at };
  }
  // A reducer pair names its reducer: what the reducer returns is the state.
  if (row.model === "state-pair" && at !== undefined) return { returns: at };
  return undefined;
}

/** Whether the call has no value (`useEffect`): nothing it is given, and nothing its callback returns, reaches what binds it. */
export function hasNoValue(module: string, name: string): boolean {
  return yieldsNothing(frameworkRow(module, name));
}

/** Which argument the call returns, wrapped (`action(fn)`, `useCallback(fn)`, `debounce(fn)`, `on(source, fn)`), or null for any other call. */
export function wrappedPosition(module: string, name: string): number | null {
  const row = frameworkRow(module, name);
  return row?.model === "wraps" ? argument(row) ?? 0 : null;
}

/**
 * Whether what `const x = call(fn)` binds runs `fn`, so `x()` is a call of it.
 * True for a call no row names. False where a row says otherwise: an effect
 * (no value), `batch(fn)` (what `fn` returns), `createSelector(fn)` (a test).
 */
export function yieldsFirstFunction(module: string, name: string): boolean {
  const row = frameworkRow(module, name);
  if (row?.model === "wraps") return wrappedPosition(module, name) === 0;
  return row?.model !== "calls-back" || (row.accessor === true && row.returns === "callback");
}

/** Whether calling what the factory makes tests a key against its source (`createSelector`), rather than yields the source's value. */
export function makesPredicate(module: string, name: string): boolean {
  const row = frameworkRow(module, name);
  return row?.accessor === true && row.returns === "boolean";
}

/** Whether the call makes an accessor that yields its callback's return (`createMemo`, `createAsync`). */
export function makesAccessor(module: string, name: string): boolean {
  return frameworkRow(module, name)?.accessor === true;
}

/** The options key a data hook reads its function from (`useQuery`'s `queryFn`), or null. */
export function optionFlow(module: string, name: string): string | null {
  const row = frameworkRow(module, name);
  return row?.model === "calls-back" ? row.option ?? null : null;
}

/** Whether the call makes a state pair (`createSignal`, `useState`). */
export function makesStatePair(module: string, name: string): boolean {
  return frameworkRow(module, name)?.model === "state-pair";
}

/** Whether the call makes a store hook (`zustand`'s `create`): its function's return and what its `set` receives are the store, and calling the hook with a selector reads it. */
export function makesStore(module: string, name: string): boolean {
  return frameworkRow(module, name)?.model === "store";
}

/** Whether a state factory calls a function initial value for the state (`useState(() => …)`), as Solid's `createSignal` does not. */
export function callsInitialValue(module: string, name: string): boolean {
  const row = frameworkRow(module, name);
  return row?.model === "state-pair" && row.lazy === true;
}

/** The argument a reducer pair's reducer is at (`useReducer(reducer, …)`), or null for any other pair. */
export function reducerArgument(module: string, name: string): number | null {
  const row = frameworkRow(module, name);
  return row?.model === "state-pair" ? argument(row) ?? null : null;
}
