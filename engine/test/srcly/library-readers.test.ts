// What each library row means to the collectors: every reader's answer for
// every built-in row, pinned in `__snapshots__/library-readers.txt`. The
// snapshot was taken from the one-off row fields before migration stage 2
// moved the rows onto `flows` paths (docs/research/dataflow-library-models-2026-11,
// section 6), so the path readers must give the same answers. A row change
// that moves an answer shows here as a diff to review.
import { describe, expect, it } from "vitest";
import {
  callsInitialValue,
  frameworkRow,
  hasNoValue,
  makesAccessor,
  makesPredicate,
  makesStatePair,
  makesStore,
  optionFlow,
  optionLifecycle,
  optionResult,
  promiseChannels,
  reducerArgument,
  rowFlow,
  standardCallback,
  watchedFunction,
  wrappedPosition,
  yieldsFirstFunction,
  yieldsOnlyCallback,
} from "../../src/analysis/framework-flows";
import { builtinLibraryModels, libraryFlowSchema, libraryModelKey, type LibraryModelRow } from "../../src/analysis/library-models";

const keyOf = (row: LibraryModelRow) => libraryModelKey(row.language, row.module, (row.name ?? row.member)!);

/** Every reader's answer for a row, leaving out the ones that say nothing (false, null, undefined). */
function answers(row: LibraryModelRow): Record<string, unknown> {
  // `rowFlow` reads a member row only for `passes-through` (`flowOf`); a promise's `settles` stays a field only for `reject`.
  const out: Record<string, unknown> = { rowFlow: row.name || row.model === "passes-through" ? rowFlow(row) : undefined, standardCallback: standardCallback(row), promiseChannels: promiseChannels(row), settles: row.settles === "reject" ? row.settles : undefined, writes: row.writes };
  if (row.language === "ts" && row.name && frameworkRow(row.module, row.name) === row) {
    const { module, name } = row;
    Object.assign(out, {
      yieldsOnlyCallback: yieldsOnlyCallback(module, name), hasNoValue: hasNoValue(module, name), wrappedPosition: wrappedPosition(module, name),
      yieldsFirstFunction: yieldsFirstFunction(module, name), makesPredicate: makesPredicate(module, name), makesAccessor: makesAccessor(module, name), optionFlow: optionFlow(module, name),
      optionResult: optionResult(module, name), optionLifecycle: optionLifecycle(module, name), watchedFunction: watchedFunction(module, name), makesStatePair: makesStatePair(module, name),
      makesStore: makesStore(module, name), callsInitialValue: callsInitialValue(module, name), reducerArgument: reducerArgument(module, name),
    });
  }
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined && value !== null && value !== false));
}

describe("library row readers", () => {
  it("checks the path grammar", () => {
    for (const flow of ["Argument[0].Member[queryFn].ReturnValue -> ReturnValue.Member[data]", "Argument[1] -> Argument[0].Parameter[0]", "Argument[0..] -> Argument[this]", "Argument[0].ReturnValue -> ReturnValue.ReturnValue : test", "Argument[this].Awaited[error] -> Argument[1].Parameter[0]"]) {
      expect(libraryFlowSchema.safeParse(flow).success, flow).toBe(true);
    }
    for (const flow of ["Argument[0] ReturnValue", "Parameter[0] -> ReturnValue", "Argument[x] -> ReturnValue", "Argument[0] -> ReturnValue : taint", "Argument[0].Member[] -> ReturnValue"]) {
      expect(libraryFlowSchema.safeParse(flow).success, flow).toBe(false);
    }
  });

  it("give every built-in row the answers pinned before stage 2", async () => {
    const lines: string[] = [];
    for (const row of builtinLibraryModels().rows()) {
      const found = answers(row);
      if (Object.keys(found).length) lines.push(`${keyOf(row)} (${row.model})`, ...Object.entries(found).map(([name, value]) => `  ${name}: ${JSON.stringify(value)}`));
    }
    await expect([...lines, ""].join("\n")).toMatchFileSnapshot("__snapshots__/library-readers.txt");
  });
});
