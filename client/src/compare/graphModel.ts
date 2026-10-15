// Union dependency graph for compare mode.
//
// Both commits' graphs fold into file-level edges, keyed by repo path (renames
// map the base path to the head path). The view is focused on the PR: changed
// files sit in the center, unchanged files that import them on the left, and
// unchanged files they import on the right. It is shaped as a regular
// `ViewModel`, so the existing grid layout positions it once and both panes
// draw the same boxes, each showing only what exists on its side.

import type { DependencyGraphContract } from "../viz/deps/contract";
import type { Region, ViewEdge, ViewModel, ViewNode } from "../viz/deps/viewModel";
import type { CompareFile, ComparePayload } from "./types";

/** Which sides an item exists on. */
export type Presence = "both" | "base" | "head";

export interface EdgeCounts {
  both: number;
  base: number;
  head: number;
}

export interface CompareGraphModel {
  vm: ViewModel;
  nodePresence: Map<string, Presence>;
  /** Underlying file-level edges per view edge, split by side. */
  edgeCounts: Map<string, EdgeCounts>;
  /** The changed file behind a center node (absent for folder roll-ups). */
  changeByNode: Map<string, CompareFile>;
  /** Unchanged importers folded into "used by N" nodes. */
  hubbed: number;
}

export interface CompareGraphOptions {
  showExternal: boolean;
  showTests: boolean;
  /** Boxes in the center before changed files roll up by folder. */
  maxCenter: number;
  /** Boxes per side before neighbors roll up by folder. */
  maxSide: number;
  /** Unchanged files importing only one changed file collapse to "used by N" at this count. */
  hubThreshold: number;
}

export const DEFAULT_GRAPH_OPTIONS: CompareGraphOptions = {
  showExternal: false,
  showTests: false,
  maxCenter: 24,
  maxSide: 14,
  hubThreshold: 6,
};

const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const isExternal = (id: string) => id.startsWith("ext:");

interface SideGraph {
  files: Set<string>;
  tests: Set<string>;
  edges: Set<string>;
}

/** Fold a graph to file-level `source\u0000target` edges, renaming base paths when asked. */
function foldGraph(graph: DependencyGraphContract | undefined, rename: (p: string) => string): SideGraph {
  const out: SideGraph = { files: new Set(), tests: new Set(), edges: new Set() };
  if (!graph) return out;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const owner = (id: string): string => {
    let node = byId.get(id);
    while (node && node.kind === "symbol" && node.parent) {
      id = node.parent;
      node = byId.get(id);
    }
    return id;
  };
  for (const n of graph.nodes) {
    if (n.kind !== "file") continue;
    out.files.add(rename(n.id));
    if (n.isTest) out.tests.add(rename(n.id));
  }
  for (const e of graph.edges) {
    const s = rename(owner(e.source));
    const t = rename(owner(e.target));
    if (s !== t) out.edges.add(`${s}\u0000${t}`);
  }
  return out;
}

/** Roll units up to their parent folder, deepest first, until at most `max` remain. */
function rollUp(units: Set<string>, max: number, keep: (u: string) => boolean = () => false): Map<string, string> {
  const assign = new Map([...units].map((u) => [u, u]));
  const depth = (p: string) => (p ? p.split("/").length : 0);
  let current = new Set(assign.values());
  while (current.size > max) {
    const movable = [...current].filter((u) => !keep(u) && u !== "" && !isExternal(u));
    if (!movable.length) break;
    const deepest = Math.max(...movable.map(depth));
    if (deepest === 0) break;
    for (const [leaf, unit] of assign) {
      if (!keep(unit) && !isExternal(unit) && depth(unit) === deepest) assign.set(leaf, dirname(unit));
    }
    // A pass may merge nothing (each unit had its own parent); the next level up
    // will, and every pass makes the deepest level shallower, so this ends.
    current = new Set(assign.values());
  }
  return assign;
}

export function buildCompareGraph(
  payload: ComparePayload,
  options: CompareGraphOptions = DEFAULT_GRAPH_OPTIONS
): CompareGraphModel {
  const renames = new Map(payload.files.filter((f) => f.oldPath).map((f) => [f.oldPath!, f.path]));
  const base = foldGraph(payload.graphs?.base, (p) => renames.get(p) ?? p);
  const head = foldGraph(payload.graphs?.head, (p) => p);

  const changes = new Map(payload.files.map((f) => [f.path, f]));
  const center = new Set(
    payload.files.map((f) => f.path).filter((p) => base.files.has(p) || head.files.has(p))
  );
  const isTest = (p: string) => base.tests.has(p) || head.tests.has(p);
  const hidden = (p: string) =>
    (!options.showExternal && isExternal(p)) || (!options.showTests && isTest(p) && !center.has(p));

  // Union edges with presence, keeping only those that touch a changed file.
  const presence = new Map<string, Presence>();
  for (const key of new Set([...base.edges, ...head.edges])) {
    const [s, t] = key.split("\u0000");
    if (!center.has(s) && !center.has(t)) continue;
    if (hidden(s) || hidden(t)) continue;
    presence.set(key, base.edges.has(key) && head.edges.has(key) ? "both" : base.edges.has(key) ? "base" : "head");
  }

  // Neighbors: left if it imports the PR, right if the PR imports it.
  const inWeight = new Map<string, number>();
  const outWeight = new Map<string, number>();
  const importersOf = new Map<string, Set<string>>();
  for (const key of presence.keys()) {
    const [s, t] = key.split("\u0000");
    if (center.has(s) && !center.has(t)) outWeight.set(t, (outWeight.get(t) ?? 0) + 1);
    if (!center.has(s) && center.has(t)) {
      inWeight.set(s, (inWeight.get(s) ?? 0) + 1);
      const set = importersOf.get(s) ?? new Set();
      set.add(t);
      importersOf.set(s, set);
    }
  }
  const region = new Map<string, Region>();
  for (const p of center) region.set(p, "center");
  for (const p of new Set([...inWeight.keys(), ...outWeight.keys()])) {
    region.set(p, (inWeight.get(p) ?? 0) > (outWeight.get(p) ?? 0) ? "in" : "out");
  }

  // Hubs: a changed file with many unchanged importers that touch nothing else
  // in the PR shows "used by N files" instead of N boxes and N edges.
  const hubOf = new Map<string, string>();
  const byTarget = new Map<string, string[]>();
  for (const [importer, targets] of importersOf) {
    if (region.get(importer) !== "in" || targets.size !== 1) continue;
    const target = [...targets][0];
    const key = `${importer}\u0000${target}`;
    if (presence.get(key) !== "both") continue;
    byTarget.set(target, [...(byTarget.get(target) ?? []), importer]);
  }
  let hubbed = 0;
  for (const [target, importers] of byTarget) {
    if (importers.length < options.hubThreshold) continue;
    for (const imp of importers) hubOf.set(imp, `usedby:${target}`);
    hubbed += importers.length;
  }

  // Roll each region up by folder to fit its budget.
  const unitsIn = new Set<string>();
  const unitsOut = new Set<string>();
  for (const [p, r] of region) {
    if (hubOf.has(p)) continue;
    if (r === "in") unitsIn.add(p);
    if (r === "out") unitsOut.add(p);
  }
  const assignCenter = rollUp(center, options.maxCenter);
  const assignIn = rollUp(unitsIn, options.maxSide);
  const assignOut = rollUp(unitsOut, options.maxSide);
  const unitOf = (p: string): string | null => {
    const r = region.get(p);
    if (!r) return null;
    if (hubOf.has(p)) return `in|${hubOf.get(p)}`;
    const assign = r === "center" ? assignCenter : r === "in" ? assignIn : assignOut;
    return `${r}|${assign.get(p) ?? p}`;
  };

  // Nodes.
  const members = new Map<string, string[]>();
  for (const p of region.keys()) {
    const u = unitOf(p);
    if (u) members.set(u, [...(members.get(u) ?? []), p]);
  }
  const nodes: ViewNode[] = [];
  const nodePresence = new Map<string, Presence>();
  const changeByNode = new Map<string, CompareFile>();
  for (const [id, paths] of members) {
    const [r, unit] = [id.slice(0, id.indexOf("|")) as Region, id.slice(id.indexOf("|") + 1)];
    const isHub = unit.startsWith("usedby:");
    const single = paths.length === 1 && paths[0] === unit;
    const kind = isExternal(unit) ? "external" : single ? "file" : "folder";
    const label = isHub
      ? `${paths.length} files`
      : isExternal(unit)
        ? unit.slice(4)
        : single
          ? basename(unit)
          : `${basename(unit) || payload.repo.name}/`;
    nodes.push({
      id,
      graphId: unit,
      region: r,
      kind,
      label,
      title: isHub ? `Unchanged files importing ${unit.slice(7)}` : unit || payload.repo.name,
      memberCount: paths.length,
      isFocus: false,
      context: isHub ? `use ${basename(unit.slice(7))}` : undefined,
    });
    const onBase = paths.some((p) => base.files.has(p) || isExternal(p));
    const onHead = paths.some((p) => head.files.has(p) || isExternal(p));
    nodePresence.set(id, onBase && onHead ? "both" : onBase ? "base" : "head");
    if (single && changes.has(unit)) changeByNode.set(id, changes.get(unit)!);
  }

  // Edges between units, counting underlying edges per side.
  const edgeCounts = new Map<string, EdgeCounts>();
  const edgeIds = new Map<string, { source: string; target: string }>();
  for (const [key, p] of presence) {
    const [s, t] = key.split("\u0000");
    const us = unitOf(s);
    const ut = unitOf(t);
    if (!us || !ut || us === ut) continue;
    const id = `${us}->${ut}`;
    const counts = edgeCounts.get(id) ?? { both: 0, base: 0, head: 0 };
    counts[p]++;
    edgeCounts.set(id, counts);
    edgeIds.set(id, { source: us, target: ut });
  }
  const edges: ViewEdge[] = [...edgeIds].map(([id, { source, target }]) => {
    const c = edgeCounts.get(id)!;
    return {
      id,
      source,
      target,
      weight: c.both + c.base + c.head,
      faint: !source.startsWith("center|") && !target.startsWith("center|"),
      symbols: [],
    };
  });

  // Same-named boxes (client/src/services vs server/app/services) show more of
  // their path, one segment at a time, until each label is unique.
  for (let segments = 2; segments <= 6; segments++) {
    const counts = new Map<string, number>();
    for (const n of nodes) counts.set(n.label, (counts.get(n.label) ?? 0) + 1);
    const dupes = nodes.filter((n) => (counts.get(n.label) ?? 0) > 1 && !n.graphId.startsWith("usedby:") && n.kind !== "external");
    if (!dupes.length) break;
    for (const n of dupes) {
      const tail = n.title.split("/").slice(-segments).join("/");
      n.label = n.kind === "folder" ? `${tail}/` : tail;
    }
  }

  const order: Record<Region, number> = { in: 0, center: 1, out: 2 };
  nodes.sort((a, b) => order[a.region] - order[b.region] || a.title.localeCompare(b.title));

  return {
    vm: {
      focusId: "",
      focusKind: "folder",
      focusLabel: "Changed files",
      breadcrumbs: [],
      nodes,
      edges,
      rolledUp: 0,
    },
    nodePresence,
    edgeCounts,
    changeByNode,
    hubbed,
  };
}

/** How an edge reads on one side: hidden, unchanged, or the side's change. */
export function edgeStateOn(counts: EdgeCounts, side: "base" | "head"): "hidden" | "same" | "added" | "removed" | "mixed" {
  const mine = side === "base" ? counts.base : counts.head;
  const other = side === "base" ? counts.head : counts.base;
  if (!counts.both && !mine) return "hidden";
  if (!mine) return "same";
  if (!counts.both && !other) return side === "base" ? "removed" : "added";
  return "mixed";
}
