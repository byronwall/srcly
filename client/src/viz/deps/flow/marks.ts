// Data flow mode's node vocabulary: one mark (shape + color) per kind of
// flow node, shared by the boxes, the legend and the go-to palette so they
// always agree. Colors are the treemap's kind of tint: mixed into the box
// fill at `TINT`, drawn full-strength only on the 12px mark.
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { FlowNode } from "./adapter";

export type FlowMark = "route" | "anchor" | "origin" | "value" | "transform" | "component" | "control" | "terminal" | "boundary" | "frontier";

export interface FlowMarkSpec {
  /** Short word for cards and the legend. */
  label: string;
  /** What the mark means, for the legend. */
  hint: string;
  /** Hex, light theme (the treemap's ramp is hex too). */
  color: string;
}

export const FLOW_MARKS: Record<FlowMark, FlowMarkSpec> = {
  route: { label: "route", hint: "the page component this flow starts from", color: "#2563eb" },
  anchor: { label: "anchor", hint: "the expression this flow is traced from", color: "#2563eb" },
  origin: { label: "origin", hint: "where a value enters: a fetch, resource or file read", color: "#15803d" },
  value: { label: "value", hint: "a carrier: a variable, parameter, field read or call result", color: "#64748b" },
  transform: { label: "transform", hint: "a reshaping step: map, filter, pack, parse, a one-site call", color: "#0d9488" },
  component: { label: "component", hint: "one occurrence of a component", color: "#64748b" },
  control: { label: "control", hint: "a Show, For, Suspense or portal boundary", color: "#d97706" },
  terminal: { label: "terminal", hint: "where a value reaches the DOM", color: "#7c3aed" },
  boundary: { label: "boundary", hint: "where the proof cannot follow: external code, or a callee with many call sites", color: "#b45309" },
  frontier: { label: "frontier", hint: "where the proof stops", color: "#b45309" },
};

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

const DETAIL_WORDS: Record<string, string> = {
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
