// Data flow mode's node vocabulary: one mark (shape + color) per kind of
// flow node, shared by the boxes, the legend and the go-to palette so they
// always agree. Colors are the treemap's kind of tint: mixed into the box
// fill at `TINT`, drawn full-strength only on the 12px mark. Each color is
// one of srcly's palette tokens (T21): CSS draws `var(token)`, and the
// Lab mixing the box tint needs reads the token's computed value, so a
// theme that redefines the tokens recolors the marks too.
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { FlowNode } from "./adapter";

export type FlowMark = "route" | "anchor" | "origin" | "value" | "transform" | "component" | "control" | "terminal" | "boundary" | "frontier";

export interface FlowMarkSpec {
  /** Short word for cards and the legend. */
  label: string;
  /** What the mark means, for the legend. */
  hint: string;
  /** The palette token (`--plc-…`) the mark is drawn in. */
  token: string;
  /** The token's light value: the fallback where no stylesheet is loaded (tests), and the value `markColor` resolves against. */
  color: string;
}

export const FLOW_MARKS: Record<FlowMark, FlowMarkSpec> = {
  route: { label: "route", hint: "the page component this flow starts from", token: "--plc-accent", color: "#2563eb" },
  anchor: { label: "anchor", hint: "the expression this flow is traced from", token: "--plc-accent", color: "#2563eb" },
  origin: { label: "origin", hint: "where a value enters: a fetch, resource or file read", token: "--plc-success", color: "#15803d" },
  value: { label: "value", hint: "a carrier: a variable, parameter, field read or call result", token: "--plc-tertiary", color: "#64748b" },
  transform: { label: "transform", hint: "a reshaping step: map, filter, pack, parse, a one-site call", token: "--plc-chart-2", color: "#0891b2" },
  component: { label: "component", hint: "one occurrence of a component", token: "--plc-tertiary", color: "#64748b" },
  control: { label: "control", hint: "a Show, For, Suspense or portal boundary", token: "--plc-chart-4", color: "#ca8a04" },
  terminal: { label: "terminal", hint: "where a value reaches the DOM", token: "--plc-chart-6", color: "#7c3aed" },
  boundary: { label: "boundary", hint: "where the proof cannot follow: external code, or a callee with many call sites", token: "--plc-warning", color: "#b45309" },
  frontier: { label: "frontier", hint: "where the proof stops", token: "--plc-warning", color: "#b45309" },
};

/** `var(--plc-…)` for CSS and SVG attributes. */
export const markVar = (mark: FlowMark): string => `var(${FLOW_MARKS[mark].token})`;

const resolved = new Map<string, string>();
if (typeof window !== "undefined" && window.matchMedia) {
  // The tokens may change with the color scheme: forget what was read under the old one.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => resolved.clear());
}

/** A palette token's current computed value (hex or rgb), or `fallback` where there is no stylesheet. */
export function tokenColor(token: string, fallback: string): string {
  const cached = resolved.get(token);
  if (cached) return cached;
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const color = value || fallback;
  if (value) resolved.set(token, color);
  return color;
}

/** The mark's color as a real color value, for mixing (the box tint) rather than for CSS. */
export const markColor = (mark: FlowMark): string => tokenColor(FLOW_MARKS[mark].token, FLOW_MARKS[mark].color);

export const FLOW_MARK_ORDER: FlowMark[] = ["route", "anchor", "origin", "value", "transform", "component", "control", "terminal", "boundary", "frontier"];

/** The mark for an anchor graph's node kind (scopes are frames, never boxes). */
export const MARK_OF_ANCHOR_KIND: Record<AnchorGraphResult["nodes"][number]["kind"], FlowMark> = {
  anchor: "anchor",
  scope: "component",
  value: "value",
  transform: "transform",
  control: "control",
  origin: "origin",
  terminal: "terminal",
  boundary: "boundary",
  frontier: "frontier",
};

/** The mark for an engine node kind. */
export const MARK_OF_KIND: Record<FlowNode["kind"], FlowMark> = {
  route: "route",
  occurrence: "component",
  control: "control",
  origin: "origin",
  field: "origin",
  terminal: "terminal",
  frontier: "frontier",
};

export function isFlowMark(symbolKind: string | undefined): symbolKind is FlowMark {
  return symbolKind !== undefined && symbolKind in FLOW_MARKS;
}

/** Box badges for how often a node renders. */
export const REPETITION_BADGE: Record<"conditional" | "collection", { glyph: string; title: string; hint: string }> = {
  conditional: { glyph: "?", title: "Rendered conditionally", hint: "Inside a Show, a ternary or an &&: it may not render at all." },
  collection: { glyph: "∗", title: "Rendered per item", hint: "Inside a For or a map: once for each item of a collection." },
};

/** Why a trace stops at a frontier, by the engine's reason: a short word for the box and a sentence for the rail. */
export const STOP_REASONS: Record<string, { word: string; hint: string }> = {
  "unbound-read": { word: "binding not traced", hint: "No caller's value is linked to this read, so where it comes from is not traced." },
  disconnected: { word: "dead end", hint: "Nothing the engine indexed continues from here." },
  untraced: { word: "not traced further", hint: "The evidence for this language records nothing past here (a store, a condition, a parameter nothing passes), so the trace ends without a proven end." },
  "external-code": { word: "external code", hint: "The value goes into code outside the project: a library or a built-in." },
  "budget-exhausted": { word: "walk limit", hint: "The walk stopped at its size limit; more may follow." },
  "no-evidence-element": { word: "no evidence", hint: "The engine recorded nothing at this expression." },
};

/** The stop's short word, or the reason itself when it is not one srcly words. */
export const stopWord = (reason: string | null | undefined): string => (reason ? STOP_REASONS[reason]?.word ?? reason : "stops here");

const DETAIL_WORDS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(STOP_REASONS).map(([reason, stop]) => [reason, stop.word])),
  "jsx-text": "JSX text",
  "dom-attribute": "DOM attribute",
  "render-expression": "render expression",
  "control-flow": "control flow",
  "suspense-async": "suspense",
  "unsupported-ownership": "unsupported ownership",
  "working-directory": "working directory",
  "external-read": "external read",
  "input-boundary": "input boundary",
};

/** The engine's kind words as the box says them: `jsx-text` → "JSX text", `control-flow · true` → "control flow · true". */
export function humanizeDetail(detail: string | null | undefined): string | undefined {
  if (!detail) return undefined;
  return detail
    .split(" · ")
    .map((part) => DETAIL_WORDS[part] ?? part)
    .join(" · ");
}
