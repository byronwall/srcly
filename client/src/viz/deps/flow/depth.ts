// Anchor mode's first screen: the boxes nearest the anchor, a few hops out,
// with everything past them folded into one `+N` stub per box it hangs off.
// Depth grows the whole view a hop at a time (`+` / `−`, the depth slider);
// a stub opens just its own next hop in place (the URL's `open` list).
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import type { AnchorNode } from "./anchorAdapter";

/** The first screen holds at most about this many boxes. */
export const FIRST_SCREEN = 25;

/** A stub's id: the box it hangs off, behind this prefix. */
export const STUB_PREFIX = "more:";

export interface Stub {
  id: string;
  /** The drawn box it hangs off. */
  from: AnchorNode;
  /** The boxes it holds, nearest first. */
  hidden: AnchorNode[];
  /** Whether the hidden boxes sit downstream of `from` (the stub goes on its right). */
  downstream: boolean;
}

export interface DepthView {
  graph: AnchorGraphResult;
  stubs: Stub[];
  /** Each hidden box → the stub that holds it. */
  shownAs: Map<string, string>;
  /** The depth drawn, and the deepest hop the trace has. `depth >= max` draws everything. */
  depth: number;
  max: number;
}

/**
 * Hops from the anchor (either way along an edge), the depth to draw, and the graph cut to it. Without
 * a depth, the deepest one whose boxes fit the first screen. Boxes past the depth fold into stubs,
 * except the next hop of each stub named in `opened`.
 */
export function limitDepth(graph: AnchorGraphResult, anchorId: string, depth: number | undefined, opened: Iterable<string>): DepthView {
  const boxes = graph.nodes.filter((n) => n.kind !== "scope");
  const near = new Map<string, Set<string>>();
  const link = (a: string, b: string) => (near.get(a) ?? near.set(a, new Set()).get(a)!).add(b);
  // Hops follow the trace: downstream along edges, upstream against them, so a forward trace never wanders back up a side branch.
  const side = new Map(graph.nodes.map((n) => [n.id, n.side]));
  const down = (id: string) => side.get(id) !== "up";
  const up = (id: string) => side.get(id) === "up" || side.get(id) === "both" || side.get(id) === "seed";
  for (const e of graph.edges) {
    if (down(e.source) && down(e.target)) link(e.source, e.target);
    if (up(e.source) && up(e.target)) link(e.target, e.source);
  }
  const hops = new Map<string, number>([[anchorId, 0]]);
  const parent = new Map<string, string>();
  for (let queue = [anchorId]; queue.length; ) {
    const next: string[] = [];
    for (const id of queue)
      for (const to of near.get(id) ?? []) {
        if (hops.has(to)) continue;
        hops.set(to, hops.get(id)! + 1);
        parent.set(to, id);
        next.push(to);
      }
    queue = next;
  }
  const max = Math.max(0, ...hops.values());
  const within = (d: number) => boxes.filter((n) => (hops.get(n.id) ?? Infinity) <= d).length;
  let fit = 1;
  while (fit < max && within(fit + 1) <= FIRST_SCREEN) fit++;
  const drawn = Math.max(1, depth ?? fit);
  // The last stop draws everything, a box no hop reaches (a stray piece of the trace) too.
  if (drawn >= max) return { graph, stubs: [], shownAs: new Map(), depth: drawn, max };
  const shown = new Set(boxes.filter((n) => (hops.get(n.id) ?? Infinity) <= drawn).map((n) => n.id));
  // An opened stub shows its box's next hop.
  for (const id of opened) {
    if (!id.startsWith(STUB_PREFIX)) continue;
    const from = id.slice(STUB_PREFIX.length);
    if (shown.has(from)) for (const to of near.get(from) ?? []) shown.add(to);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // Each hidden box hangs off the first drawn box on its way back to the anchor.
  const shownAs = new Map<string, string>();
  const held = new Map<string, AnchorNode[]>();
  for (const n of boxes) {
    if (shown.has(n.id)) continue;
    let at = n.id;
    while (!shown.has(at) && parent.has(at)) at = parent.get(at)!;
    if (!shown.has(at)) continue;
    shownAs.set(n.id, STUB_PREFIX + at);
    held.set(at, [...(held.get(at) ?? []), n]);
  }
  const stubs = [...held].map(([from, hidden]) => {
    const box = byId.get(from)!;
    hidden.sort((a, b) => (hops.get(a.id) ?? 0) - (hops.get(b.id) ?? 0));
    const downstream = graph.edges.some((e) => e.source === from && !shown.has(e.target)) || !graph.edges.some((e) => e.target === from && !shown.has(e.source));
    return { id: STUB_PREFIX + from, from: box, hidden, downstream };
  });
  return {
    graph: { ...graph, nodes: graph.nodes.filter((n) => n.kind === "scope" || shown.has(n.id)), edges: graph.edges.filter((e) => shown.has(e.source) && shown.has(e.target)) },
    stubs,
    shownAs,
    depth: drawn,
    max,
  };
}
