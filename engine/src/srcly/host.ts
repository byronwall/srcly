// What the language-neutral ops need from a program besides its evidence:
// files, the expressions a selection may name, text, checked types, the
// function that owns a span, and who calls a function. The evidence itself
// comes from the fact index (`Tier1.provider()`), the same for every language.
import type { ProgramElement } from "../analysis/scope-seam";
import type { CallSites } from "./call-sites";
import type { Span } from "./selection";

/** A supported expression: its syntax kind in the language's own words, its text and span. */
export type HostCandidate = {
  kind: string;
  text: string;
  span: Span;
  /** For a symbol by name: the spans to try when the engine has no evidence at the name itself. */
  fallbacks?: Span[];
};

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
  /** The checked type at exactly this span. */
  typeTextAt(file: string, span: Span): string | null;
  /**
   * The local binding an expression reads, and the field path read from it: `doc`, `doc()`,
   * `doc().title`, `props.note.tags`. Null for a call that is not an accessor, a library or module
   * symbol, or a language that records none. `attribute` names the JSX attribute the expression fills.
   */
  bindingAt(file: string, span: Span): { symbol: string; field: string | null; attribute: string | null } | null;
  /** The function that owns a span (its span and name), or null at module level. */
  scopeAt(file: string, span: Span): { span: Span; name: string | null } | null;
  /** The call sites of the function a cross-call element belongs to: a call, a parameter or the function itself. */
  callSitesOf(element: ProgramElement): { sites: CallSites | null; name: string };
}
