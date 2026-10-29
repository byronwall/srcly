// Anchor mode: the engine's anchor graph → the dependency view's ViewModel.
// The anchor is the focus in the center; what the value comes from sits on
// the left (`in`) and what it goes to on the right (`out`), the way the import
// graph places importers and imports. Each box's owning function is its frame.
import { isAssumedProof } from "../../../dataflow/outcome";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { ViewEdge, ViewNode } from "../viewModel";
import type { FlowViewModel } from "./adapter";
import { humanizeDetail, MARK_OF_ANCHOR_KIND, markColor, stopWord, type FlowMark } from "./marks";
import { symbolView, type SymbolView } from "./symbolView";

export type AnchorNode = AnchorGraphResult["nodes"][number];
export type AnchorEdge = AnchorGraphResult["edges"][number];

/** Relation kinds where a value crosses a call or a prop: drawn dashed, like a handoff. */
const CROSSING = new Set(["argument", "argument-binding", "invokes", "function-call", "function-return", "return-value", "callback-parameter", "component-prop", "component-prop-binding", "http-bridge", "carrier", "gap"]);

/**
 * A trace with more boxes than this draws the anchor's own component in full
 * (its function and the callbacks inside it), and of each component it hands
 * a value to only the boxes that take the value. The rest of every other
 * component folds into one box, named by what it reaches, until it is opened
 * (the URL's `open` list holds each component's outermost scope id).
 */
export const ANCHOR_FOLD_BUDGET = 40;

export interface AnchorViewOptions {
  /** Scope ids opened in place. Without options nothing folds (an export's merged trace). */
  expanded: Iterable<string>;
  /** `steps` draws every step the engine walked; absent draws one box per symbol and frame. */
  model?: "steps";
}

export function anchorGraphToViewModel(input: AnchorGraphResult, options?: AnchorViewOptions): FlowViewModel {
  const view = options && options.model !== "steps" ? symbolView(input) : null;
  const graph = view?.graph ?? input;
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
  const component = components(graph);
  const nodes: ViewNode[] = boxes.map((n) => {
    const mark = MARK_OF_ANCHOR_KIND[n.kind];
    const scope = n.parent ? scopes.get(n.parent) : undefined;
    const where = [humanizeDetail(n.detail), `${baseName(n.file)}:${n.line}`].filter(Boolean).join(" · ");
    // A frontier sits beside the read it stops at, which already carries the name: it says why, and names the place below.
    const stop = n.kind === "frontier" ? capitalize(stopWord(n.reason)) : null;
    return {
      id: n.id,
      // Under an opened function's id, so the camera and layout move its boxes out of the box they opened from.
      graphId: n.parent && opened.has(component.get(n.parent)!) ? `${component.get(n.parent)}#${n.id}` : n.id,
      region: n.side === "up" ? "in" : n.side === "down" ? "out" : "center",
      kind: "symbol",
      symbolKind: mark,
      label: stop ?? n.label,
      title: [stop, n.label, `${n.file}:${n.line}`].filter(Boolean).join(" · "),
      subtitle: stop ? `${n.label} · ${baseName(n.file)}:${n.line}` : where,
      note: noteFor(n),
      memberCount: 1,
      isFocus: n.kind === "anchor",
      ...(scope ? { group: { id: scope.id, label: frameLabel(scope), opened: true, ...(scope.role === "server" ? { tone: "server" as const } : {}) } } : {}),
      status: n.status,
      tint: markColor(mark),
      ...(n.kind === "frontier" ? { outline: "hatched" as const } : n.kind === "boundary" ? { outline: "dotted" as const } : {}),
    };
  });
  const passThrough = view ? new Map<string, string>() : passThroughs(graph);
  // A box that repeats another's place joins it the way a pass-through does.
  for (const [id, first] of twins(graph, passThrough)) passThrough.set(id, first);
  const shown = (id: string) => {
    const at = view?.shownAs.get(id) ?? id;
    return passThrough.get(at) ?? at;
  };
  if (view) for (const box of nodes) if (!passThrough.has(box.id)) Object.assign(box, symbolBox(view, byId.get(box.id)!) ?? {});
  const fold = folds(graph, anchor, component, passThrough, opened, options);
  const drawnNodes = [...nodes.filter((n) => !passThrough.has(n.id) && !fold.has(n.id)), ...foldedBoxes(graph, fold)];
  const ids = new Set(drawnNodes.map((n) => n.id));
  const seen = new Map<string, ViewEdge>();
  const edges: ViewEdge[] = [];
  for (const raw of graph.edges) {
    // An edge out of a folded reference leaves from the value it repeats; the reference link itself goes.
    if (passThrough.get(raw.target) === raw.source) continue;
    const from = passThrough.get(raw.source) ?? raw.source;
    const to = passThrough.get(raw.target) ?? raw.target;
    // An edge into or out of a folded function joins its box.
    const e = { ...raw, source: fold.get(from) ?? from, target: fold.get(to) ?? to };
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    const key = `${e.source}|${e.target}`;
    const known = seen.get(key);
    if (known) {
      // One edge per pair of boxes: the fields read along it all name it (`error, title`).
      if (e.label && !(known.label ?? "").split(", ").includes(e.label)) known.label = known.label ? (known.label.includes(", ") ? known.label : `${known.label}, ${e.label}`) : e.label;
      continue;
    }
    const edge: ViewEdge = {
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
      ...(e.status !== "structural" && e.proof.some((p) => isAssumedProof(p.kind)) ? { assumed: true } : {}),
      ...(view && e.status !== "structural" ? { bold: true } : {}),
    };
    seen.set(key, edge);
    edges.push(edge);
  }
  return {
    vm: { focusId: anchor.id, focusKind: "symbol", focusLabel: graph.anchor.text, breadcrumbs: [], nodes: drawnNodes, edges, rolledUp: passThrough.size },
    hidden: new Set(),
    notFlow: new Set(),
    byId,
    shownAs: new Map(input.nodes.filter((n) => n.kind !== "scope").map((n) => [n.id, fold.get(shown(n.id)) ?? shown(n.id)])),
    lit: null,
  };
}

/**
 * Each scope → its component: the outermost scope of the same file whose span
 * holds it. A callback, an effect or a handler belongs to the function it is
 * written in; a module's top level is a component of its own.
 */
function components(graph: AnchorGraphResult): Map<string, string> {
  const scopes = graph.nodes.filter((n) => n.kind === "scope");
  const holds = (outer: AnchorNode, inner: AnchorNode) =>
    outer.file === inner.file && outer.detail !== "module" && before(outer.span.startLine, outer.span.startColumn, inner.span.startLine, inner.span.startColumn) && before(inner.span.endLine, inner.span.endColumn, outer.span.endLine, outer.span.endColumn);
  const out = new Map<string, string>();
  for (const s of scopes) {
    let root = s;
    if (s.detail !== "module") for (const o of scopes) if (o !== root && holds(o, root)) root = o;
    out.set(s.id, root.id);
  }
  return out;
}

function before(line: number, column: number, otherLine: number, otherColumn: number): boolean {
  return line < otherLine || (line === otherLine && column <= otherColumn);
}

/** Each folded box → its component's scope id. Empty while the trace fits the budget. */
function folds(graph: AnchorGraphResult, anchor: AnchorNode, component: Map<string, string>, passThrough: Map<string, string>, opened: Set<string>, options?: AnchorViewOptions): Map<string, string> {
  const out = new Map<string, string>();
  const boxes = graph.nodes.filter((n) => n.kind !== "scope");
  // In the symbol view the budget counts drawn boxes: every read of a symbol is drawn as one.
  const counted = options?.model === "steps" ? boxes.length : boxes.filter((n) => !passThrough.has(n.id)).length;
  if (!options || counted <= ANCHOR_FOLD_BUDGET) return out;
  const home = anchor.parent ? component.get(anchor.parent) : undefined;
  const owner = new Map(boxes.map((n) => [n.id, n.parent ? component.get(n.parent) : undefined]));
  // The boxes a value enters another component through: drawn, so the first hand-off reads without a click.
  // One per name in each component: a prop read in ten places draws once.
  const byId = new Map(boxes.map((n) => [n.id, n]));
  const entries = new Set<string>();
  const named = new Set<string>();
  const enter = (raw: string, root: string) => {
    // The box that stands for it: a repeat enters through the box it repeats.
    const id = passThrough.get(raw) ?? raw;
    const key = `${root}|${byId.get(id)?.label}`;
    if (named.has(key)) return;
    named.add(key);
    entries.add(id);
  };
  for (const e of graph.edges) {
    const [from, to] = [owner.get(e.source), owner.get(e.target)];
    if (from === home && to && to !== home) enter(e.target, to);
    if (to === home && from && from !== home) enter(e.source, from);
  }
  for (const n of boxes) {
    const root = owner.get(n.id);
    if (root && root !== home && !opened.has(root) && !entries.has(n.id)) out.set(n.id, root);
  }
  // A fold that would hold one box draws the box instead: the fold is no smaller.
  const sizes = new Map<string, number>();
  for (const root of out.values()) sizes.set(root, (sizes.get(root) ?? 0) + 1);
  for (const [id, root] of out) if (sizes.get(root) === 1) out.delete(id);
  return out;
}

/** One box per folded component: its name, how many steps it holds, and the ends and stops inside. */
function foldedBoxes(graph: AnchorGraphResult, fold: Map<string, string>): ViewNode[] {
  const members = new Map<string, AnchorNode[]>();
  for (const n of graph.nodes) {
    const scope = fold.get(n.id);
    if (scope) members.set(scope, [...(members.get(scope) ?? []), n]);
  }
  const scopes = new Map(graph.nodes.map((n) => [n.id, n]));
  return [...members].map(([id, inside]) => {
    const scope = scopes.get(id)!;
    const io = crossings(graph, fold, id);
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
      symbolKind: FOLD_MARK[scope.role ?? ""] ?? "frame",
      label: scope.label,
      title: [scope.label, scope.role, `${scope.file}:${scope.line}`, `${steps} folded`, io.in.length || io.out.length ? `${io.in.join(", ") || "…"} → ${io.out.join(", ") || "…"}` : "", ends.length ? `reaches ${ends.join(", ")}` : ""].filter(Boolean).join(" · "),
      // What goes in and what comes out, after the role: `server · id → DocDetail`.
      subtitle: [scope.role && scope.role !== "module" ? scope.role : baseName(scope.file), io.in.length || io.out.length ? `${short(io.in)} → ${short(io.out)}` : ends.length ? `reaches ${ends.join(", ")}` : steps].join(" · "),
      note: [ends.length ? steps : "", stops ? `${stops} stop${stops === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || undefined,
      memberCount: inside.length,
      isFocus: false,
      expandable: true,
      outline: "dotted",
      status,
      tint: markColor(FOLD_MARK[scope.role ?? ""] ?? "frame"),
      ...(scope.role === "server" ? { group: { id: `band:server`, label: "server", tone: "server" as const } } : {}),
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

/**
 * Boxes that repeat one place: the same kind and words at the same spot in
 * the same function (a prop binding the engine records once per read it
 * reaches). Maps each repeat to the first.
 */
function twins(graph: AnchorGraphResult, passThrough: Map<string, string>): Map<string, string> {
  const first = new Map<string, string>();
  const out = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.kind === "scope" || n.kind === "anchor" || passThrough.has(n.id)) continue;
    const key = [n.parent, n.kind, n.label, n.side, n.file, n.span.startLine, n.span.startColumn, n.span.endLine, n.span.endColumn].join("|");
    const seen = first.get(key);
    if (seen) out.set(n.id, seen);
    else first.set(key, n.id);
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

/** A symbol's box: named by its binding, with its reads (`doc · 4 reads · error, title`), and drawn as state when a framework call made it. */
function symbolBox(view: SymbolView, rep: AnchorNode): Partial<ViewNode> | null {
  const members = view.members.get(rep.id);
  if (!members || !rep.symbol) return null;
  const state = members.find((n) => n.state)?.state ?? null;
  const mark: FlowMark | null = state && rep.kind !== "anchor" && rep.kind !== "origin" ? "state" : null;
  if (rep.kind === "anchor") return mark ? { symbolKind: mark } : null;
  const name = rep.symbol.slice(0, rep.symbol.indexOf("@"));
  const fields = [...new Set(members.map((n) => n.field).filter((f): f is string => Boolean(f)))];
  const reads = `${members.length} read${members.length === 1 ? "" : "s"}`;
  return {
    label: name,
    title: [name, ...new Set(members.map((n) => n.label))].join(" · "),
    subtitle: [state, reads, `${baseName(rep.file)}:${rep.line}`].filter(Boolean).join(" · "),
    note: fields.length ? `reads ${fields.join(", ")}` : (rep.typeText ?? undefined),
    memberCount: members.length,
    ...(mark ? { symbolKind: mark, tint: markColor(mark) } : {}),
  };
}

/** A folded function's mark: a component is a component, server code is server code, the rest a function. */
const FOLD_MARK: Record<string, FlowMark> = { component: "component", server: "server" };

/** A frame's title: its name, its role (`save · handler · NoteView.tsx`), and its file. */
function frameLabel(scope: AnchorNode): string {
  if (scope.detail === "module") return scope.label;
  return [scope.label, scope.role && scope.role !== "module" ? scope.role : null, scope.detail].filter(Boolean).join(" · ");
}

/** The names that go into a folded function and come out of it: the boxes inside joined to boxes outside. */
function crossings(graph: AnchorGraphResult, fold: Map<string, string>, scope: string): { in: string[]; out: string[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const name = (id: string) => {
    const n = byId.get(id)!;
    return n.symbol ? n.symbol.slice(0, n.symbol.indexOf("@")) : n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label;
  };
  const ins = new Set<string>();
  const outs = new Set<string>();
  for (const e of graph.edges) {
    const from = fold.get(e.source) === scope;
    const to = fold.get(e.target) === scope;
    if (to && !from) ins.add(name(e.target));
    if (from && !to) outs.add(name(e.source));
  }
  return { in: [...ins], out: [...outs] };
}

/** At most two names, then a count. */
function short(names: string[]): string {
  if (!names.length) return "…";
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}
