// Reach emphasis: what one drawn box is proven to receive from and to reach,
// over the drawn view (frames' containment, handoffs and field edges). The
// walk follows proven edges only; the first non-proven edge on a path
// becomes a frontier and the walk stops there, so emphasis never implies a
// proof the engine did not give. A structural edge (a declaration anchor's
// own parameter or return link) is walked through, since it only places the
// boxes, but it is never lit as proven reach: it goes in `structural`. On a
// canvas of several anchors, each edge names the traces that have it, and the
// walk follows one of the seed's traces at a time: a box two traces share
// reaches each trace's ends, but a path never joins one trace to another's.
import type { ViewEdge, ViewModel } from "../viewModel";

export type ReachMode = "both" | "up" | "down";

export const REACH_MODES: { id: ReachMode; label: string; title: string }[] = [
  { id: "both", label: "Both", title: "Everything proven to reach it (strong) and everything it reaches (light)" },
  { id: "up", label: "Up", title: "Only what is proven to reach it" },
  { id: "down", label: "Down", title: "Only what it is proven to reach" },
];

export interface Reach {
  seed: string;
  mode: ReachMode;
  /** Drawn boxes and edges in strong emphasis: the seed, its upstream, and (in `both`) its immediate outgoing. */
  strong: { nodes: Set<string>; edges: Set<string> };
  /** Drawn boxes and edges in light emphasis: the rest of the seed's downstream. */
  light: { nodes: Set<string>; edges: Set<string> };
  /** Boxes a walk stopped at because the edge into them is not proven. */
  frontier: Set<string>;
  /** Structural edges the walk passed through: drawn as they are, never as proven reach. */
  structural: Set<string>;
  /** Boxes proven to reach the seed, and boxes the seed is proven to reach (the seed excluded). */
  counts: { up: number; down: number; frontier: number };
}

/** Walk one direction from `seed` over proven edges; `frontier` collects where a non-proven edge stopped it. On several anchors, `trace` reads each edge as that trace's own witness does. */
function walk(seed: string, edges: ViewEdge[], dir: "up" | "down", frontier: Set<string>, structural: Set<string>, trace?: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const found = new Set<string>();
  const queue = [seed];
  const byEnd = new Map<string, ViewEdge[]>();
  for (const e of edges) {
    const key = dir === "up" ? e.target : e.source;
    (byEnd.get(key) ?? byEnd.set(key, []).get(key)!).push(e);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of byEnd.get(id) ?? []) {
      const next = dir === "up" ? e.source : e.target;
      if (next === seed) continue;
      const how = trace !== undefined && e.traces ? e.traces[trace] : e.style === "structural" ? "structural" : e.faint ? "faint" : "proven";
      if (how === "structural") {
        structural.add(e.id);
      } else if (how === "faint") {
        frontier.add(next);
        continue;
      } else found.add(e.id);
      if (nodes.has(next)) continue;
      nodes.add(next);
      queue.push(next);
    }
  }
  return { nodes, edges: found };
}

export function reachFrom(vm: Pick<ViewModel, "edges">, seed: string, mode: ReachMode = "both", opts: { exclude?: Set<string> } = {}): Reach {
  const edges = vm.edges.filter((e) => e.source !== e.target && !opts.exclude?.has(e.id));
  const frontier = new Set<string>();
  const structural = new Set<string>();
  // The seed's traces; an edge no trace names (one anchor, a link) belongs to every one.
  const traces = [...new Set(edges.filter((e) => e.source === seed || e.target === seed).flatMap((e) => Object.keys(e.traces ?? {})))];
  const runs = traces.length ? traces.map((trace) => ({ trace, edges: edges.filter((e) => !e.traces || trace in e.traces) })) : [{ trace: undefined, edges }];
  const along = (dir: "up" | "down") => {
    const found = { nodes: new Set<string>(), edges: new Set<string>() };
    for (const run of runs) {
      const one = walk(seed, run.edges, dir, frontier, structural, run.trace);
      for (const id of one.nodes) found.nodes.add(id);
      for (const id of one.edges) found.edges.add(id);
    }
    return found;
  };
  const up = mode === "down" ? { nodes: new Set<string>(), edges: new Set<string>() } : along("up");
  const down = mode === "up" ? { nodes: new Set<string>(), edges: new Set<string>() } : along("down");
  const strong = { nodes: new Set([seed, ...up.nodes]), edges: new Set(up.edges) };
  const light = { nodes: new Set<string>(), edges: new Set<string>() };
  // The seed's own outgoing proven edges read strong in `both`: they are what it does with what it got.
  const immediate = new Set(edges.filter((e) => e.source === seed && !e.faint && down.edges.has(e.id)).map((e) => e.id));
  for (const id of down.edges) (mode === "both" && immediate.has(id) ? strong.edges : light.edges).add(id);
  for (const e of edges) if (immediate.has(e.id) && mode === "both") strong.nodes.add(e.target);
  for (const id of down.nodes) if (!strong.nodes.has(id)) light.nodes.add(id);
  for (const id of frontier) if (strong.nodes.has(id) || light.nodes.has(id)) frontier.delete(id);
  return {
    seed,
    mode,
    strong,
    light,
    frontier,
    structural,
    counts: { up: up.nodes.size, down: down.nodes.size, frontier: frontier.size },
  };
}
