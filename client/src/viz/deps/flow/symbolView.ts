// Anchor mode's symbol view: the engine's step-by-step trace redrawn as
// symbols and what happens between them. Every box that reads one local
// binding in one frame becomes one box, and every unnamed step between two
// boxes (a call result, a `return`, a `<Match>` occurrence) becomes the label
// of the edge that skips it. The result is an ordinary anchor graph, so the
// adapter's folding and layout run on it unchanged.
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { AnchorEdge, AnchorNode } from "./anchorAdapter";

export interface SymbolView {
  graph: AnchorGraphResult;
  /** Each box of the engine's trace → the box drawn for it. */
  shownAs: Map<string, string>;
  /** A symbol's drawn box → every box of the trace it stands for. */
  members: Map<string, AnchorNode[]>;
}

/** Which box stands for a symbol: the anchor, else the box whose kind says most about the value, else the binding itself. */
const SYMBOL_RANK: Record<AnchorNode["kind"], number> = { anchor: 0, origin: 1, boundary: 2, transform: 3, control: 4, value: 5, terminal: 6, frontier: 7, scope: 8 };

/** A step folds into its edge only below this many routes through it, so a hub keeps its box. */
const MAX_ROUTES = 12;

export function symbolView(graph: AnchorGraphResult): SymbolView {
  const merged = symbolMerges(graph);
  const members = new Map<string, AnchorNode[]>();
  for (const n of graph.nodes) {
    const rep = merged.get(n.id) ?? (n.symbol ? n.id : null);
    if (rep) members.set(rep, [...(members.get(rep) ?? []), n]);
  }
  const at = (id: string) => merged.get(id) ?? id;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // An edge out of a field read leaves the symbol named by the field: `doc —error→`.
  let edges = graph.edges
    .map((e) => ({ ...e, source: at(e.source), target: at(e.target), label: byId.get(e.source)?.field ?? e.label, steps: [] as string[] }))
    .filter((e) => e.source !== e.target);
  const shownAs = new Map(merged);
  for (const step of graph.nodes) {
    if (!isUnnamedStep(step, merged)) continue;
    const ins = edges.filter((e) => e.target === step.id);
    const outs = edges.filter((e) => e.source === step.id);
    // A JSX occurrence the value ends in (`<Match>` past its `when`): the control box beside it says it already.
    if (ins.length && !outs.length && step.elementKind === "jsx-occurrence") {
      edges = edges.filter((e) => e.target !== step.id);
      shownAs.set(step.id, ins[0].source);
      continue;
    }
    if (!ins.length || !outs.length || ins.length * outs.length > MAX_ROUTES) continue;
    const word = stepWord(step);
    const skips = ins.flatMap((a) =>
      outs.filter((b) => b.target !== a.source).map((b) => ({
        ...b,
        id: `${a.id}>${b.id}`,
        source: a.source,
        // The first relation names the edge; a hand-off anywhere along it makes it a hand-off.
        kind: CROSSES.has(a.kind) ? a.kind : b.kind,
        status: weaker(a.status, b.status),
        proof: [...a.proof, ...b.proof],
        label: a.label ?? b.label,
        steps: [...a.steps, ...(word ? [word] : []), ...b.steps],
      })),
    );
    edges = [...edges.filter((e) => e.target !== step.id && e.source !== step.id), ...skips];
    shownAs.set(step.id, outs[0].target);
  }
  // A step folded into a step folded later: follow it to the box that is drawn.
  for (const [id, to] of shownAs) {
    let end = to;
    for (let hops = 0; shownAs.has(end) && hops < 64; hops++) end = shownAs.get(end)!;
    shownAs.set(id, end);
  }
  const kept = graph.nodes.filter((n) => !shownAs.has(n.id));
  return {
    graph: {
      ...graph,
      nodes: kept,
      edges: edges.map(({ steps, ...e }) => ({ ...e, label: edgeLabel(e.label, steps) }) satisfies AnchorEdge),
    },
    shownAs,
    members,
  };
}

/** At most this many steps name an edge; the rest are counted. */
const MAX_STEPS = 3;

/**
 * An edge's words: the field it reads, then what happens along it, each once, without the `return`s
 * every call has: `title · toDetail() · .trim()`; past three steps, a count (`+2`).
 */
export function edgeLabel(field: string | null, steps: string[]): string | null {
  const said = [...new Set(steps)].filter((step) => step !== "return" || steps.every((s) => s === "return"));
  const shown = said.length > MAX_STEPS ? [...said.slice(0, MAX_STEPS), `+${said.length - MAX_STEPS}`] : said;
  return [field, ...shown].filter(Boolean).join(" · ") || null;
}

/** Relation kinds where a value crosses a call or a prop: they keep naming an edge that skips a step. */
const CROSSES = new Set(["argument", "argument-binding", "invokes", "function-call", "function-return", "return-value", "callback-parameter", "component-prop", "component-prop-binding", "http-bridge", "carrier"]);

const STATUS_RANK: Record<AnchorEdge["status"], number> = { proven: 0, structural: 1, partial: 2, unsupported: 3 };
const weaker = (a: AnchorEdge["status"], b: AnchorEdge["status"]) => (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b);

/**
 * One box per symbol and frame: every box that reads one local binding (`doc`, `doc()`, `doc.error`,
 * the `when` of a `<Match>`) folds into one. Symbols come from the engine's checker, never from labels,
 * so two different `x`s stay apart, and a box with no symbol keeps its own box. Maps each folded box
 * to the box that stands for its symbol.
 */
export function symbolMerges(graph: AnchorGraphResult): Map<string, string> {
  const groups = new Map<string, AnchorNode[]>();
  for (const n of graph.nodes) {
    if (n.kind === "scope" || !n.symbol) continue;
    const key = `${n.parent}|${n.symbol}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const out = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const rep = [...group].sort((a, b) => SYMBOL_RANK[a.kind] - SYMBOL_RANK[b.kind] || Number(a.field !== null) - Number(b.field !== null))[0];
    for (const n of group) if (n.id !== rep.id) out.set(n.id, rep.id);
  }
  return out;
}

/** A step with no name of its own between two boxes: an intermediate call result, a `return`, a JSX occurrence, an unnamed pack. */
function isUnnamedStep(n: AnchorNode, merged: Map<string, string>): boolean {
  return (n.kind === "value" || n.kind === "transform") && !n.symbol && !merged.has(n.id);
}

/** What a folded step does, in a few characters: `fetchNote()`, `.map()`, `pack`, `return`, `<Match>`. */
export function stepWord(n: AnchorNode): string | null {
  const label = n.label.trim();
  if (n.elementKind === "return" || label === "return") return "return";
  if (n.elementKind === "jsx-occurrence") return `<${label}>`;
  if (n.operation === "object-pack" || n.elementKind === "object-pack") return "pack";
  const call = /^(?:new\s+)?([\w$.]+)\s*\(/.exec(label);
  if (call) {
    const name = call[1];
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? `.${name.slice(dot + 1)}()` : `${name}()`;
  }
  if (n.operation && n.operation !== "field-read" && n.operation !== "alias") return n.operation;
  return null;
}
