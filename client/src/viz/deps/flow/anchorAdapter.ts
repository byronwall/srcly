// Anchor mode: the engine's anchor graph → the dependency view's ViewModel.
// The anchor is the focus in the center; what the value comes from sits on
// the left (`in`) and what it goes to on the right (`out`), the way the import
// graph places importers and imports. Each box's owning function is its frame.
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { ViewEdge, ViewNode } from "../viewModel";
import type { FlowViewModel } from "./adapter";
import { humanizeDetail, MARK_OF_ANCHOR_KIND, markColor, stopWord } from "./marks";

export type AnchorNode = AnchorGraphResult["nodes"][number];
export type AnchorEdge = AnchorGraphResult["edges"][number];

/** Relation kinds where a value crosses a call or a prop: drawn dashed, like a handoff. */
const CROSSING = new Set(["argument", "argument-binding", "invokes", "function-call", "function-return", "return-value", "callback-parameter", "component-prop", "component-prop-binding", "http-bridge", "carrier", "gap"]);

/**
 * A trace with more boxes than this draws the anchor's own function in full
 * and folds every other function into one box, named by what it reaches,
 * until it is opened (the URL's `open` list holds scope ids).
 */
export const ANCHOR_FOLD_BUDGET = 40;

export interface AnchorViewOptions {
  /** Scope ids opened in place. Without options nothing folds (an export's merged trace). */
  expanded: Iterable<string>;
}

export function anchorGraphToViewModel(graph: AnchorGraphResult, options?: AnchorViewOptions): FlowViewModel {
  const byId = new Map<string, AnchorNode>(graph.nodes.map((n) => [n.id, n]));
  const scopes = new Map(graph.nodes.filter((n) => n.kind === "scope").map((n) => [n.id, n]));
  const anchor = graph.nodes.find((n) => n.kind === "anchor");
  const empty: FlowViewModel = {
    vm: { focusId: "", focusKind: "symbol", focusLabel: graph.anchor.text, breadcrumbs: [], nodes: [], edges: [], rolledUp: 0 },
    hidden: new Set(),
    notFlow: new Set(),
    byId,
    shownAs: new Map(),
    lit: null,
  };
  if (!anchor) return empty;
  const boxes = graph.nodes.filter((n) => n.kind !== "scope");
  const opened = new Set(options?.expanded ?? []);
  const nodes: ViewNode[] = boxes.map((n) => {
    const mark = MARK_OF_ANCHOR_KIND[n.kind];
    const scope = n.parent ? scopes.get(n.parent) : undefined;
    const where = [humanizeDetail(n.detail), `${baseName(n.file)}:${n.line}`].filter(Boolean).join(" · ");
    // A frontier sits beside the read it stops at, which already carries the name: it says why, and names the place below.
    const stop = n.kind === "frontier" ? capitalize(stopWord(n.reason)) : null;
    return {
      id: n.id,
      // Under an opened function's id, so the camera and layout move its boxes out of the box they opened from.
      graphId: n.parent && opened.has(n.parent) ? `${n.parent}#${n.id}` : n.id,
      region: n.side === "up" ? "in" : n.side === "down" ? "out" : "center",
      kind: "symbol",
      symbolKind: mark,
      label: stop ?? n.label,
      title: [stop, n.label, `${n.file}:${n.line}`].filter(Boolean).join(" · "),
      subtitle: stop ? `${n.label} · ${baseName(n.file)}:${n.line}` : where,
      note: noteFor(n),
      memberCount: 1,
      isFocus: n.kind === "anchor",
      ...(scope ? { group: { id: scope.id, label: scope.detail === "module" ? scope.label : `${scope.label} · ${scope.detail}`, opened: true } } : {}),
      status: n.status,
      tint: markColor(mark),
      ...(n.kind === "frontier" ? { outline: "hatched" as const } : n.kind === "boundary" ? { outline: "dotted" as const } : {}),
    };
  });
  const passThrough = passThroughs(graph);
  const fold = folds(graph, anchor, opened, options);
  const drawnNodes = [...nodes.filter((n) => !passThrough.has(n.id) && !fold.has(n.id)), ...foldedBoxes(graph, fold)];
  const ids = new Set(drawnNodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: ViewEdge[] = [];
  for (const raw of graph.edges) {
    // An edge out of a folded reference leaves from the value it repeats; the reference link itself goes.
    if (passThrough.get(raw.target) === raw.source) continue;
    const from = passThrough.get(raw.source) ?? raw.source;
    // An edge into or out of a folded function joins its box.
    const e = { ...raw, source: fold.get(from) ?? from, target: fold.get(raw.target) ?? raw.target };
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    const key = `${e.source}|${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      weight: 1,
      faint: e.status !== "proven",
      symbols: [],
      // A structural link (a declaration's parameter or return) is drawn dotted and neutral: found by structure, not traced.
      ...(e.status === "structural" ? { style: "structural" as const } : CROSSING.has(e.kind) ? { style: "handoff" as const } : {}),
      ...(e.label ? { label: e.label } : {}),
      status: e.status,
      proof: e.proof.map((p) => ({ kind: p.kind, detail: p.detail, status: p.status, at: p.locations[0] ? `${baseName(p.locations[0].file)}:${p.locations[0].line}` : undefined })),
      relation: e.kind,
    });
  }
  return {
    vm: { focusId: anchor.id, focusKind: "symbol", focusLabel: graph.anchor.text, breadcrumbs: [], nodes: drawnNodes, edges, rolledUp: passThrough.size },
    hidden: new Set(),
    notFlow: new Set(),
    byId,
    shownAs: new Map(boxes.map((n) => {
      const shown = passThrough.get(n.id) ?? n.id;
      return [n.id, fold.get(shown) ?? shown];
    })),
    lit: null,
  };
}

/** Each box of a folded function → its scope id. Empty while the trace fits the budget. */
function folds(graph: AnchorGraphResult, anchor: AnchorNode, opened: Set<string>, options?: AnchorViewOptions): Map<string, string> {
  const out = new Map<string, string>();
  const boxes = graph.nodes.filter((n) => n.kind !== "scope");
  if (!options || boxes.length <= ANCHOR_FOLD_BUDGET) return out;
  for (const n of boxes) if (n.parent && n.parent !== anchor.parent && !opened.has(n.parent)) out.set(n.id, n.parent);
  return out;
}

/** One box per folded function: its name, how many steps it holds, and the ends and stops inside. */
function foldedBoxes(graph: AnchorGraphResult, fold: Map<string, string>): ViewNode[] {
  const members = new Map<string, AnchorNode[]>();
  for (const n of graph.nodes) {
    const scope = fold.get(n.id);
    if (scope) members.set(scope, [...(members.get(scope) ?? []), n]);
  }
  const scopes = new Map(graph.nodes.map((n) => [n.id, n]));
  return [...members].map(([id, inside]) => {
    const scope = scopes.get(id)!;
    const ends = [...new Set(inside.filter((n) => n.kind === "terminal").map(endWord).filter(Boolean))];
    const stops = inside.filter((n) => n.kind === "frontier").length;
    const up = inside.filter((n) => n.side === "up").length;
    const status = inside.some((n) => n.status === "unsupported") ? "unsupported" : inside.some((n) => n.status === "partial") ? "partial" : "proven";
    const steps = `${inside.length} step${inside.length === 1 ? "" : "s"}`;
    return {
      id,
      graphId: id,
      region: up > inside.length / 2 ? "in" : "out",
      kind: "symbol",
      symbolKind: "value",
      label: scope.label,
      title: [scope.label, `${scope.file}:${scope.line}`, `${steps} folded`, ends.length ? `reaches ${ends.join(", ")}` : ""].filter(Boolean).join(" · "),
      // The ends last: a symbol's subtitle is cut from the start.
      subtitle: [`${baseName(scope.file)}:${scope.line}`, ends.length ? `reaches ${ends.join(", ")}` : steps].join(" · "),
      note: [ends.length ? steps : "", stops ? `${stops} stop${stops === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || undefined,
      memberCount: inside.length,
      isFocus: false,
      expandable: true,
      outline: "dotted",
      status,
      tint: markColor("value"),
    } satisfies ViewNode;
  });
}

/**
 * References that only repeat a value: a box named like the one value that
 * reaches it over a `references` link (each `props` where `props.x` is
 * read, each `toc` where `toc.y` is). Drawn, they stack a column of
 * identical boxes; folded, their edges leave from the value itself. Maps
 * each folded box to the box it repeats.
 */
function passThroughs(graph: AnchorGraphResult): Map<string, string> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const into = new Map<string, AnchorEdge[]>();
  for (const e of graph.edges) (into.get(e.target) ?? into.set(e.target, []).get(e.target)!).push(e);
  const out = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.kind !== "value" || n.elementKind !== "value") continue;
    const incoming = into.get(n.id) ?? [];
    const source = incoming.length === 1 && incoming[0].kind === "references" ? byId.get(incoming[0].source) : undefined;
    if (source && source.kind !== "scope" && source.label === n.label && source.side === n.side) out.set(n.id, source.id);
  }
  // A reference of a folded reference repeats the first value.
  for (const [id, source] of out) {
    let to = source;
    while (out.has(to)) to = out.get(to)!;
    out.set(id, to);
  }
  return out;
}

/** What an end does, in its label's words: `database write: session.add(…)` → "database write"; a return routed to a route → "response". Branches and plain values name nothing. */
function endWord(n: AnchorNode): string {
  const colon = n.label.indexOf(": ");
  if (colon > 0) return n.label.slice(0, colon);
  return n.label.includes(" → ") ? "response" : "";
}

function noteFor(n: AnchorNode): string | undefined {
  // A frontier's label already says why it stops.
  if (n.kind === "frontier") return undefined;
  const parts: string[] = [];
  if (n.status !== "proven") parts.push(n.status);
  if (n.reason) parts.push(n.reason);
  if (n.typeText) parts.push(n.typeText);
  return parts.length ? parts.join(" · ") : undefined;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}
