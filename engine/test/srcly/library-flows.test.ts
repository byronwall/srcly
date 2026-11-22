// Migration stage 1 (docs/research/dataflow-library-models-2026-11, section 6):
// every built-in row's access paths (`rowFlows`) must say what its one-off
// fields say. A small path reader answers each `framework-flows.ts` reader,
// and each field a collector reads off the row directly, from the paths and
// the model alone; the answers must equal today's. The derived paths are
// pinned in `__snapshots__/library-flows.txt` for review.
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
  PROMISE_CHANNELS,
  reducerArgument,
  rowFlow,
  watchedFunction,
  wrappedPosition,
  yieldsFirstFunction,
  yieldsOnlyCallback,
  type FrameworkFlow,
} from "../../src/analysis/framework-flows";
import { rowFlows } from "../../src/analysis/library-flows";
import { builtinLibraryModels, LIBRARY_FLOW_PATTERN, libraryFlowSchema, libraryModelKey, type LibraryModelRow } from "../../src/analysis/library-models";

/**
 * Rows whose meaning the paths cannot say yet, by key, each with why. Empty:
 * every built-in row is covered. One known loss is not a reader's answer: a
 * `returns: void` row's `args` (which callback the framework runs) is in no
 * path, because nothing flows through it; no reader reads it.
 */
const EXCEPTIONS: Record<string, string> = {};

type Flow = { from: string; to: string; test: boolean };
type Model = LibraryModelRow["model"];

const parse = (flows: string[]): Flow[] =>
  flows.map((flow) => {
    const match = LIBRARY_FLOW_PATTERN.exec(flow)!;
    return { from: match[1], to: match[2], test: match[3] === "test" };
  });

const num = (pattern: RegExp, text: string) => {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : undefined;
};
const first = <T,>(items: readonly T[]) => items.find((item) => item !== undefined);

/** The path reader: today's reader answers, from a row's model and paths only. */
class PathReader {
  constructor(private readonly model: Model, private readonly flows: Flow[]) {}

  private touchesResult() {
    return this.flows.some((flow) => flow.from.startsWith("ReturnValue") || flow.to.startsWith("ReturnValue"));
  }

  /** The argument whose function's return reaches `to` (value or test). */
  private callbackInto(to: RegExp, test: boolean) {
    return first(this.flows.filter((flow) => flow.test === test && to.test(flow.to)).map((flow) => num(/^Argument\[(\d+)\]\.ReturnValue$/, flow.from)));
  }

  /** `[source, callback]`: an argument whose value or return a callback's first parameter takes. */
  private source(callback?: number) {
    for (const flow of this.flows) {
      const to = num(/^Argument\[(\d+)\]\.Parameter\[0\]$/, flow.to);
      const from = num(/^Argument\[(\d+)\]/, flow.from);
      if (to !== undefined && from !== undefined && from !== to && (callback === undefined || to === callback)) return [from, to] as const;
    }
    return undefined;
  }

  private accessor() {
    return this.model === "calls-back" && this.flows.some((flow) => flow.to.startsWith("ReturnValue.ReturnValue"));
  }

  private dispatch() {
    return first(this.flows.filter((flow) => flow.from === "ReturnValue.Member[1].Parameter[0]").map((flow) => num(/^Argument\[(\d+)\]\.Parameter\[1\]$/, flow.to)));
  }

  /** The options key the hook calls (`queryFn`): one it enters or whose return it keeps, which no other option's function feeds. */
  primary(): string | null {
    const key = (path: string) => /^Argument\[0\]\.Member\[(\w+)\]/.exec(path)?.[1];
    const candidates = new Set<string>();
    const fed = new Set<string>();
    for (const { from, to } of this.flows) {
      const fromKey = key(from);
      const toKey = key(to);
      if (fromKey && from === `Argument[0].Member[${fromKey}].ReturnValue` && to.startsWith("ReturnValue")) candidates.add(fromKey);
      if (toKey && to.startsWith(`Argument[0].Member[${toKey}].Parameter[0]`) && (from.startsWith("ReturnValue") || to.includes(".Parameter[0].Member["))) candidates.add(toKey);
      if (toKey && /\.Parameter\[\d+\]$/.test(to) && /^Argument\[0\]\.Member\[\w+\]\.(ReturnValue|Parameter)/.test(from)) fed.add(toKey);
    }
    const found = [...candidates].filter((item) => !fed.has(item));
    if (found.length > 1) throw new Error(`more than one option function: ${found.join(", ")}`);
    return found[0] ?? null;
  }

  private field(option: string) {
    return first(this.flows.filter((flow) => flow.from === `Argument[0].Member[${option}].ReturnValue`).map((flow) => /^ReturnValue\.Member\[(\w+)\]$/.exec(flow.to)?.[1]));
  }

  private selector(option: string, field: string) {
    return first(this.flows.map((flow) => {
      const key = /^Argument\[0\]\.Member\[(\w+)\]\.Parameter\[0\]$/.exec(flow.to)?.[1];
      const maps = key && flow.from === `Argument[0].Member[${option}].ReturnValue` && this.flows.some((item) => item.from === `Argument[0].Member[${key}].ReturnValue` && item.to === `ReturnValue.Member[${field}]`);
      return maps ? key : undefined;
    }));
  }

  rowFlow(): FrameworkFlow | undefined {
    if (this.model === "passes-through") {
      const passes = this.flows.filter((flow) => flow.to === "ReturnValue").map((flow) => flow.from);
      return { passes: passes.includes("Argument[0..]") ? "*" : passes.flatMap((from) => num(/^Argument\[(\d+)\]$/, from) ?? []) };
    }
    if (this.model === "calls-back" && !this.touchesResult()) return {};
    const result = /^ReturnValue(\.ReturnValue)?$/;
    if (this.model === "calls-back") {
      const tested = this.callbackInto(result, true);
      if (tested !== undefined) return { returns: tested, compares: true };
    }
    if (this.model === "wraps") {
      const source = this.source();
      if (source) return { source: source[0], callback: source[1] };
    }
    if (this.model === "calls-back") {
      const returns = this.callbackInto(result, false);
      if (returns !== undefined) {
        const source = this.source(returns);
        return source ? { returns, source: source[0], callback: returns } : { returns };
      }
    }
    if (this.model === "state-pair") {
      const reducer = this.dispatch();
      if (reducer !== undefined) return { returns: reducer };
    }
    return undefined;
  }

  yieldsOnlyCallback() {
    if (this.model !== "calls-back") return false;
    const option = this.primary();
    if (option) return this.field(option) !== undefined;
    return this.callbackInto(/^ReturnValue$/, false) !== undefined && !this.accessor() && this.source() === undefined;
  }

  hasNoValue() {
    return this.model === "calls-back" && !this.touchesResult();
  }

  wrappedPosition() {
    if (this.model !== "wraps") return null;
    return first([...this.flows.filter((flow) => flow.to === "ReturnValue").map((flow) => num(/^Argument\[(\d+)\]$/, flow.from)), this.callbackInto(/^ReturnValue\.ReturnValue$/, false)]) ?? null;
  }

  yieldsFirstFunction() {
    if (this.model === "wraps") return this.wrappedPosition() === 0;
    return this.model !== "calls-back" || (this.accessor() && this.callbackInto(/^ReturnValue\.ReturnValue$/, false) === 0);
  }

  makesPredicate() {
    return this.flows.some((flow) => flow.test && flow.to === "ReturnValue.ReturnValue");
  }

  makesAccessor() {
    return this.accessor();
  }

  optionFlow() {
    return this.model === "calls-back" ? this.primary() : null;
  }

  optionResult() {
    const option = this.optionFlow();
    const field = option ? this.field(option) : undefined;
    return option && field ? { field, selector: this.selector(option, field) ?? null } : null;
  }

  optionLifecycle() {
    const option = this.optionFlow();
    if (!option) return null;
    const head = `Argument[0].Member[${option}]`;
    const hands: Record<string, string[]> = {};
    const observers: Record<string, ("result" | "input" | "context" | "none")[]> = {};
    let contextFrom: string | null = null;
    const field = this.field(option);
    const selector = field ? this.selector(option, field) : undefined;
    for (const { from, to } of this.flows) {
      const handed = new RegExp(`^${head.replace(/[[\]]/g, "\\$&")}\\.Parameter\\[0\\]\\.Member\\[(\\w+)\\]$`).exec(to)?.[1];
      const filler = /^Argument\[0\]\.Member\[(\w+)\]$/.exec(from)?.[1];
      if (handed && filler) (hands[handed] ??= []).push(filler);
      const observed = /^Argument\[0\]\.Member\[(\w+)\]\.Parameter\[(\d+)\]$/.exec(to);
      if (!observed || observed[1] === option || observed[1] === selector) continue;
      const context = /^Argument\[0\]\.Member\[(\w+)\]\.ReturnValue$/.exec(from)?.[1];
      const role = from === `${head}.ReturnValue` ? "result" : from === `${head}.Parameter[0]` ? "input" : context ? "context" : null;
      if (!role) continue;
      if (role === "context") contextFrom = context!;
      const roles = (observers[observed[1]] ??= []);
      roles[Number(observed[2])] = role;
    }
    for (const roles of Object.values(observers)) for (let index = 0; index < roles.length; index++) roles[index] ??= "none";
    if (!Object.keys(hands).length && !Object.keys(observers).length) return null;
    return { hands, observers, contextFrom };
  }

  watchedFunction() {
    if (this.model !== "calls-back" || this.primary()) return null;
    for (const flow of this.flows) {
      const at = num(/^Argument\[(\d+)\]\.ReturnValue\.Awaited$/, flow.from);
      const field = /^ReturnValue\.Member\[(\w+)\]$/.exec(flow.to)?.[1];
      if (at === undefined || !field) continue;
      const input = first(this.flows.filter((item) => item.from === `Argument[${at}].Parameter[0..]`).map((item) => /^ReturnValue\.Member\[(\w+)\]$/.exec(item.to)?.[1]));
      return { at, field, input: input ?? null };
    }
    return null;
  }

  callsInitialValue() {
    return this.model === "state-pair" && this.dispatch() === undefined && this.flows.some((flow) => flow.from === "Argument[0].ReturnValue" && flow.to === "ReturnValue.Member[0]");
  }

  reducerArgument() {
    return this.model === "state-pair" ? this.dispatch() ?? null : null;
  }

  /** The fields a collector reads off a row itself (`parameters`, `writes`, `settles`, a standard method's `returns`, `with`). */
  direct(): Partial<LibraryModelRow> {
    const out: Partial<LibraryModelRow> = {};
    if (this.flows.some((flow) => flow.from === "Argument[0..]" && flow.to === "Argument[this]")) out.writes = "this";
    if (this.model === "consumes" && this.flows.some((flow) => flow.to === "ReturnValue.Awaited[error]")) out.settles = "reject";
    if (this.model === "calls-back" && this.flows.some((flow) => flow.from.startsWith("Argument[this].Awaited"))) {
      const into = (from: string) => first(this.flows.filter((flow) => flow.from === from).map((flow) => num(/^Argument\[(\d+)\]\.Parameter\[0\]$/, flow.to)));
      const channels = {
        fulfilled: into("Argument[this].Awaited"),
        rejected: into("Argument[this].Awaited[error]"),
        returns: this.flows.filter((flow) => flow.to === "ReturnValue.Awaited").flatMap((flow) => num(/^Argument\[(\d+)\]\.ReturnValue$/, flow.from) ?? []),
      };
      const name = (Object.keys(PROMISE_CHANNELS) as (keyof typeof PROMISE_CHANNELS)[]).find((key) => {
        const want = PROMISE_CHANNELS[key];
        return want.fulfilled === channels.fulfilled && want.rejected === channels.rejected && JSON.stringify(want.returns) === JSON.stringify(channels.returns);
      });
      if (name) out.settles = name;
      // `catch` and `finally` keep the fulfilled value; `then` does not.
      const keeps = this.flows.some((flow) => flow.from === "Argument[this].Awaited" && flow.to === "ReturnValue.Awaited");
      if (keeps !== (name === "catch" || name === "finally")) out.settles = undefined;
    }
    const roles: NonNullable<LibraryModelRow["parameters"]> = [];
    for (const { from, to } of this.flows) {
      const index = num(/^Argument\[0\]\.Parameter\[(\d+)\]$/, to);
      if (index === undefined) continue;
      if (from === "Argument[this].ArrayElement") roles[index] = "element";
      else if (from === "Argument[this]") roles[index] = "receiver";
      else if (from === "Argument[0].ReturnValue") roles[index] = "accumulator";
      else if (/^Argument\[\d+\]$/.test(from)) out.source = String(num(/^Argument\[(\d+)\]$/, from));
    }
    if (roles.length) {
      for (let index = 0; index < roles.length; index++) roles[index] ??= "index";
      out.parameters = roles;
      const yields = this.flows.filter((flow) => flow.to === "ReturnValue");
      out.returns = yields.some((flow) => flow.from === "Argument[0].ReturnValue") ? (yields.some((flow) => flow.test) ? "boolean" : "callback")
        : yields.some((flow) => flow.from === "Argument[this].ArrayElement") ? "element"
        : yields.some((flow) => flow.from === "Argument[this]") ? "same"
        : "void";
    } else if (this.flows.some((flow) => flow.from.endsWith(".ReturnValue.ArrayElement") && /\.Parameter\[0\]$/.test(flow.to))) out.with = "element";
    return out;
  }
}

const keyOf = (row: LibraryModelRow) => libraryModelKey(row.language, row.module, (row.name ?? row.member)!);

/** What today's code answers for a row, and what the paths answer: the readers by module and name for a TypeScript `name` row, `rowFlow` for a standard `passes-through` row (the only member row it reads), and the fields collectors read directly. */
function answers(row: LibraryModelRow, reader: PathReader) {
  const old: Record<string, unknown> = {};
  const now: Record<string, unknown> = {};
  const pick = <K extends keyof LibraryModelRow>(...keys: K[]) => {
    for (const key of keys) old[key] = row[key];
  };
  if (row.language === "ts" && row.name && frameworkRow(row.module, row.name) === row) {
    const { module, name } = row;
    Object.assign(old, {
      frameworkFlow: rowFlow(row), yieldsOnlyCallback: yieldsOnlyCallback(module, name), hasNoValue: hasNoValue(module, name), wrappedPosition: wrappedPosition(module, name),
      yieldsFirstFunction: yieldsFirstFunction(module, name), makesPredicate: makesPredicate(module, name), makesAccessor: makesAccessor(module, name), optionFlow: optionFlow(module, name),
      optionResult: optionResult(module, name), optionLifecycle: optionLifecycle(module, name), watchedFunction: watchedFunction(module, name), makesStatePair: makesStatePair(module, name),
      makesStore: makesStore(module, name), callsInitialValue: callsInitialValue(module, name), reducerArgument: reducerArgument(module, name),
    });
    Object.assign(now, {
      frameworkFlow: reader.rowFlow(), yieldsOnlyCallback: reader.yieldsOnlyCallback(), hasNoValue: reader.hasNoValue(), wrappedPosition: reader.wrappedPosition(),
      yieldsFirstFunction: reader.yieldsFirstFunction(), makesPredicate: reader.makesPredicate(), makesAccessor: reader.makesAccessor(), optionFlow: reader.optionFlow(),
      optionResult: reader.optionResult(), optionLifecycle: reader.optionLifecycle(), watchedFunction: reader.watchedFunction(), makesStatePair: row.model === "state-pair",
      makesStore: row.model === "store", callsInitialValue: reader.callsInitialValue(), reducerArgument: reader.reducerArgument(),
    });
  } else if (row.model === "passes-through") {
    old.rowFlow = rowFlow(row);
    now.rowFlow = reader.rowFlow();
  }
  const direct = reader.direct();
  pick("writes", "settles", "parameters");
  if (row.parameters) pick("returns", "source");
  else pick("with");
  for (const key of Object.keys(old)) if (!(key in now)) now[key] = direct[key as keyof LibraryModelRow];
  return { old, now };
}

describe("library row access paths", () => {
  const rows = builtinLibraryModels().rows();

  it("checks the grammar", () => {
    for (const flow of ["Argument[0].Member[queryFn].ReturnValue -> ReturnValue.Member[data]", "Argument[1] -> Argument[0].Parameter[0]", "Argument[0..] -> Argument[this]", "Argument[0].ReturnValue -> ReturnValue.ReturnValue : test", "Argument[this].Awaited[error] -> Argument[1].Parameter[0]"]) {
      expect(libraryFlowSchema.safeParse(flow).success, flow).toBe(true);
    }
    for (const flow of ["Argument[0] ReturnValue", "Parameter[0] -> ReturnValue", "Argument[x] -> ReturnValue", "Argument[0] -> ReturnValue : taint", "Argument[0].Member[] -> ReturnValue"]) {
      expect(libraryFlowSchema.safeParse(flow).success, flow).toBe(false);
    }
  });

  it("says every built-in row's meaning in paths, and today's readers follow from them", async () => {
    const gaps: string[] = [];
    const lines: string[] = [];
    let covered = 0;
    for (const row of rows) {
      const key = keyOf(row);
      let flows: string[];
      try {
        flows = rowFlows(row);
        for (const flow of flows) libraryFlowSchema.parse(flow);
        const { old, now } = answers(row, new PathReader(row.model, parse(flows)));
        const differ = Object.keys(old).filter((name) => JSON.stringify(now[name]) !== JSON.stringify(old[name]));
        if (differ.length) throw new Error(differ.map((name) => `${name}: paths say ${JSON.stringify(now[name])}, today ${JSON.stringify(old[name])}`).join("; "));
      } catch (error) {
        if (!(key in EXCEPTIONS)) gaps.push(`${key}: ${(error as Error).message.split("\n")[0]}`);
        continue;
      }
      covered++;
      if (flows.length) lines.push(`${key} (${row.model})`, ...flows.map((flow) => `  ${flow}`));
    }
    expect(gaps).toEqual([]);
    expect(Object.keys(EXCEPTIONS).filter((key) => !rows.some((row) => keyOf(row) === key))).toEqual([]);
    expect(covered + Object.keys(EXCEPTIONS).length).toBe(rows.length);
    const header = `${covered} of ${rows.length} rows covered; ${rows.length - lines.filter((line) => !line.startsWith(" ")).length} rows have no paths (their model alone says what they do).`;
    await expect([header, "", ...lines, ""].join("\n")).toMatchFileSnapshot("__snapshots__/library-flows.txt");
  });

  it("names a field the paths cannot say", () => {
    expect(() => rowFlows({ language: "ts", module: "x", name: "y", model: "calls-back", returns: "same" })).toThrow(/returns: same/);
    expect(() => rowFlows({ language: "ts", module: "x", name: "y", model: "origin", lazy: true })).toThrow(/`lazy`/);
  });
});
