// What the language-neutral ops need from a program besides its evidence:
// files, the expressions a selection may name, text, checked types, the
// function that owns a span, and who calls a function. The evidence itself
// comes from the fact index (`Tier1.provider()`), the same for every language.
import type { ProgramElement } from "../analysis/scope-seam";
import type { CallSites } from "./call-sites";
import type { Span } from "./selection";

import type { ScopeRole } from "./scope-roles";

/** A supported expression: its syntax kind in the language's own words, its text and span. */
export type HostCandidate = {
  kind: string;
  text: string;
  span: Span;
  /** For a symbol by name: the spans to try when the engine has no evidence at the name itself. */
  fallbacks?: Span[];
};

/** The kind of state a binding holds, by the framework call that made it. */
export type BindingState = "signal" | "store" | "resource" | "memo" | "context";

export interface LanguageHost {
  readonly language: "typescript" | "python";
  /**
   * What the evidence can claim beyond its relations. `pairsCalls`: the
   * provider records which call an argument is passed at (`argument`), so the
   * slice pairs a callee's return with the call the walk came in by (T13) and
   * entering a callee is never ambiguous. `deadEnds`: the slice raises
   * `disconnected` only where a value really stops, so such a gap is a dead
   * end (R16) rather than where the evidence runs out.
   */
  readonly evidence: { pairsCalls: boolean; deadEnds: boolean };
  /** A file inside the root, relative (forward slashes) and absolute. Throws `invalid-request` outside the root, `not-found` outside the program. */
  file(file: unknown): { relative: string; absolute: string };
  /** The supported expressions covering a span, innermost first; with `text`, only those whose text is exactly it. */
  candidates(file: string, span: Span, text?: string | null): HostCandidate[];
  /** The supported expressions strictly inside a selection, in source order: what a ledger shows the selection is made of. */
  parts(file: string, span: Span): HostCandidate[];
  /** The identifier `name` on `line`: its declaration first, else the first use, with fallback spans. */
  identifierOnLine(file: string, name: string, line: number): HostCandidate | null;
  textAt(file: string, span: Span): string | null;
  /**
   * The members of the object literal at exactly this span, in source order:
   * each one's field name, or null where the name is not known (a spread, a
   * computed key). Null when the span is no object literal, or the host
   * cannot tell.
   */
  objectMembers?(file: string, span: Span): (string | null)[] | null;
  /**
   * Whether the binding at this span holds a value the evidence may not
   * name exactly: a destructured name (`{ payload }`, `...rest`) or one with a
   * default (`note = fallback`). True when the host cannot tell.
   */
  unsureBinding?(file: string, span: Span): boolean;
  /** Whether the value at this span is a function (a signal's getter), so a field read on it reads the function. */
  callable?(file: string, span: Span): boolean;
  /**
   * Whether the object literal at this span can change after it is built:
   * the binding that holds it (or an object holding it) is written through
   * (`x.a = …`, `x["a"] = …`, `x.n++`, `delete x.a`, `Object.assign(x, …)`)
   * or handed to another name (`const alias = x`).
   */
  mutable?(file: string, span: Span): boolean;
  /** Whether the value a return at this span hands back may not be the call's whole value: a yield, a generator, a body whose end is reachable (`undefined`). */
  returnUnsure?(file: string, span: Span): boolean | "async" | "callback";
  /** Whether the call at this span sits in an optional chain (`a?.b()`), so it may not run. */
  optionalCall?(file: string, span: Span): boolean;
  /** Whether the call at this span passes arguments. */
  hasArguments?(file: string, span: Span): boolean;
  /** Whether the call at this span is awaited where it is made. */
  awaited?(file: string, span: Span): boolean;
  /** Whether the binding (a variable or parameter) at this span names an object the code changes, as `mutable` says. */
  mutatedBinding?(file: string, span: Span): boolean;
  /** Whether the expression at this span is a state factory's call (`createStore(…)`, `useReducer(…)`). */
  stateFactory?(file: string, span: Span): boolean;
  /** The checked type at exactly this span. */
  typeTextAt(file: string, span: Span): string | null;
  /**
   * The local binding an expression reads, and the field path read from it: `doc`, `doc()`,
   * `doc().title`, `props.note.tags`. Null for a call that is not an accessor, a library or module
   * symbol, or a language that records none. `attribute` names the JSX attribute the expression fills.
   */
  bindingAt(file: string, span: Span): { symbol: string; field: string | null; attribute: string | null; state: BindingState | null } | null;
  /**
   * What a function touches besides the values it is handed: the functions of the root it calls (by
   * their spans), and the local bindings declared outside it that it reads or writes (by symbol). A
   * setter (`setDoc` of `const [doc, setDoc]`) writes its pair's first name. Empty where a language records none.
   */
  linksOf(file: string, span: Span): { calls: { file: string; span: Span }[]; reads: string[]; writes: string[] };
  /** The function that owns a span (its span and name), or null at module level. */
  scopeAt(file: string, span: Span): { span: Span; name: string | null; role?: ScopeRole } | null;
  /** The call sites of the function a cross-call element belongs to: a call, a parameter or the function itself. */
  callSitesOf(element: ProgramElement): { sites: CallSites | null; name: string };
}
