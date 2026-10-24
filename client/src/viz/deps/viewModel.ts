import type { GraphNodeKind } from "./contract";
import {
  ancestors,
  displayName,
  folderStats,
  isAncestorOrSelf,
  owningFile,
  type GraphIndex,
} from "./hierarchy";

export type Region = "in" | "center" | "out";

export interface ViewNode {
  /** Unique within the view (a folder may appear on both sides). */
  id: string;
  graphId: string;
  region: Region;
  kind: GraphNodeKind;
  label: string;
  /** Full path / qualified name for tooltips. */
  title: string;
  /** Number of leaf units rolled into this node (1 for a leaf). */
  memberCount: number;
  isFocus: boolean;
  /** Parent file label for symbols shown on the sides. */
  context?: string;
  symbolKind?: string;
  /**
   * Second line under the label: where a symbol or file lives, or what a
   * folder holds. Optional so other view models (compare) can omit it.
   */
  subtitle?: string;
  /** For folders: files anywhere below it, used to draw relative size. */
  fileCount?: number;
  /**
   * Side neighbors only: the package they belong to — the first folder below
   * the deepest folder they share with the focus. Boxes of one group stay
   * together in a column and get a labeled frame.
   */
  group?: { id: string; label: string; opened?: boolean };
  /** Side symbols only: the owning file, so symbols of one file sit together inside their group. */
  subgroup?: string;
  /** A folder (or a file with symbols) that can open in place into its children. */
  expandable?: boolean;
  /** Data flow mode: a dotted outline for a rolled-up primitive, hatched for a frontier. */
  outline?: "dotted" | "hatched";
  /** Data flow mode: a proven destination of the selected origin. */
  lit?: boolean;
  /** Data flow mode: the third line (status, rolled-up members, a frontier's reason). */
  note?: string;
  /** Data flow mode: the proof status; partial and unsupported color the box's stroke. */
  status?: "proven" | "partial" | "unsupported";
  /** Data flow mode: how often the node renders; a badge at the box's top right. */
  repetition?: "conditional" | "collection";
  /** Data flow mode: the kind's color, mixed into the fill like the treemap's metric color. */
  tint?: string;
}

export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  /** Number of underlying graph edges aggregated into this one. */
  weight: number;
  /** Neither end is in the center region. */
  faint: boolean;
  symbols: string[];
  /** Data flow mode: a dashed handoff from an origin, or an accent field path. */
  style?: "handoff" | "field";
  /** Data flow mode: a field edge's path (`projects[*].name`), drawn along the edge. */
  label?: string;
  /** Data flow mode: the edge's proof status, for its card. */
  status?: "proven" | "partial" | "unsupported";
  /** Data flow mode: the engine's proof records behind the edge, for its card. */
  proof?: { kind: string; detail: string; status: "proven" | "partial" | "unsupported"; at?: string }[];
  /** Anchor mode: the engine's relation kind (`field-input`, `argument`, …), for its card. */
  relation?: string;
}

export interface ViewModel {
  focusId: string;
  focusKind: GraphNodeKind;
  /** Display name of the focus (file name for a focused file). */
  focusLabel: string;
  breadcrumbs: { id: string; label: string }[];
  nodes: ViewNode[];
  edges: ViewEdge[];
  /** Units that had to be rolled up to fit the budget. */
  rolledUp: number;
  /** The requested expansions that apply to this focus (not the focus or its ancestors). */
  expanded?: string[];
}

export interface ViewOptions {
  focusId: string;
  /** Target maximum number of boxes on screen. */
  budget: number;
  /** Max edges on screen before side neighbors roll up by folder. */
  edgeBudget?: number;
  /**
   * Folders and files opened in place, at any depth and on any side: each
   * shows its children instead of one rolled-up box, whatever the budget.
   * Everything else keeps the cut it had without them.
   */
  expanded?: Iterable<string>;
}

export const DEFAULT_BUDGET = 48;
/** Max distinct edges among center units before we stop expanding folders. */
export const EDGE_BUDGET = 32;
/** Max edges in the whole view; sides roll up by folder beyond this. */
export const TOTAL_EDGE_BUDGET = 56;

interface Unit {
  region: Region;
  graphId: string;
  members: number;
}

const unitKey = (region: Region, graphId: string) => `${region}|${graphId}`;

export function buildViewModel(index: GraphIndex, opts: ViewOptions): ViewModel {
  const focus = index.byId.get(opts.focusId) ?? index.byId.get(index.graph.root)!;
  const focusId = focus.id;
  const focusKind = focus.kind;
  const expanded = new Set(
    [...(opts.expanded ?? [])].filter((id) => {
      const k = index.byId.get(id)?.kind;
      return (k === "folder" || k === "file") && !isAncestorOrSelf(index, id, focusId);
    }),
  );
  // Expanded nodes plus every ancestor down to them: a leaf's box is the first
  // node on its path below this set.
  const opened = new Set<string>();
  for (const id of expanded) {
    for (const a of [...ancestors(index, id), id]) if (!isAncestorOrSelf(index, a, focusId)) opened.add(a);
  }

  // 1. Which leaf does an edge endpoint occupy in the center, if any?
  const centerLeaf = (endpoint: string): string | null => {
    if (focusKind === "folder") {
      const file = owningFile(index, endpoint);
      if (file === focusId || !isAncestorOrSelf(index, focusId, file)) return null;
      // An expanded file shows its symbols.
      return expanded.has(file) ? endpoint : file;
    }
    if (focusKind === "symbol") return endpoint === focusId ? endpoint : null;
    // file or external focus: the file and its symbols
    if (endpoint === focusId) return endpoint;
    const n = index.byId.get(endpoint);
    return n?.kind === "symbol" && n.parent === focusId ? endpoint : null;
  };
  // A side file whose every outside edge lands on one symbol shows as that
  // symbol: `EditInPlace`, not `edit-in-place.tsx`.
  // (Center files are never side leaves, so the map needs no focus.)
  const singleSymbol = focusKind === "folder" ? singleSymbolFiles(index) : new Map<string, string>();
  const sideLeaf = (endpoint: string): string => {
    if (focusKind !== "folder") return endpoint;
    const file = owningFile(index, endpoint);
    if (expanded.has(file)) return endpoint;
    return singleSymbol.get(file) ?? file;
  };

  // 2. Seed center leaves.
  const centerLeaves = new Set<string>();
  if (focusKind === "folder") {
    const stack = [focusId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const c of index.children.get(id) ?? []) {
        const k = index.byId.get(c)?.kind;
        if (k === "folder") stack.push(c);
        else if (k === "file" || k === "external") centerLeaves.add(c);
      }
    }
  } else {
    centerLeaves.add(focusId);
  }

  // 3. Classify neighbors by direction, weighting by edge count.
  const inWeight = new Map<string, number>();
  const outWeight = new Map<string, number>();
  for (const e of index.edges) {
    const cs = centerLeaf(e.source);
    const ct = centerLeaf(e.target);
    if (cs !== null) centerLeaves.add(cs);
    if (ct !== null) centerLeaves.add(ct);
    if (cs !== null && ct === null) {
      const l = sideLeaf(e.target);
      outWeight.set(l, (outWeight.get(l) ?? 0) + 1);
    } else if (ct !== null && cs === null) {
      const l = sideLeaf(e.source);
      inWeight.set(l, (inWeight.get(l) ?? 0) + 1);
    }
  }
  // When the focus file has symbols, the file node itself only stays if some
  // edge lands on it directly (module-level import or unresolved symbol).
  if (focusKind === "file" || focusKind === "external") {
    const touched = index.edges.some((e) => e.source === focusId || e.target === focusId);
    const hasSymbols = [...centerLeaves].some((l) => l !== focusId);
    if (hasSymbols && !touched) centerLeaves.delete(focusId);
  }
  // Same for an expanded file inside a focused folder.
  for (const f of expanded) {
    if (!centerLeaves.has(f) || index.byId.get(f)?.kind !== "file") continue;
    const hasSymbols = [...centerLeaves].some((l) => l !== f && owningFile(index, l) === f);
    const touched = index.edges.some((e) => e.source === f || e.target === f);
    if (hasSymbols && !touched) centerLeaves.delete(f);
  }

  const leafRegion = new Map<string, Region>();
  for (const l of centerLeaves) leafRegion.set(l, "center");
  for (const [l, w] of inWeight) {
    if (leafRegion.has(l)) continue;
    const o = outWeight.get(l) ?? 0;
    leafRegion.set(l, w >= o ? "in" : "out");
  }
  for (const l of outWeight.keys()) if (!leafRegion.has(l)) leafRegion.set(l, "out");

  // 4a. Center units refine top-down: start from the focus's children and
  // expand folders while both the box and edge budgets hold. Zoomed out, this
  // shows folders with a few aggregate edges instead of every file.
  const units = new Map<string, Unit>();
  const leafUnit = new Map<string, string>(); // leaf graph id → unit key
  const hasSides = [...leafRegion.values()].some((r) => r !== "center");
  const centerBudget = hasSides ? Math.max(8, Math.round(opts.budget * 0.55)) : opts.budget;

  const centerTopOf = (leaf: string, open: Set<string>): string => {
    // Highest ancestor below the focus that is not opened.
    const chain = [...ancestors(index, leaf), leaf];
    const start = chain.indexOf(focusId);
    if (start === -1) return leaf;
    for (let i = start + 1; i < chain.length; i++) {
      if (!open.has(chain[i])) return chain[i];
    }
    return leaf;
  };
  const centerLeafList = [...centerLeaves];
  const centerEdgePairs: [string, string][] = [];
  for (const e of index.edges) {
    const cs = centerLeaf(e.source);
    const ct = centerLeaf(e.target);
    if (cs !== null && ct !== null && cs !== ct) centerEdgePairs.push([cs, ct]);
  }
  const evaluate = (open: Set<string>) => {
    const top = new Map<string, string>();
    for (const l of centerLeafList) top.set(l, focusKind === "folder" ? centerTopOf(l, open) : l);
    const pairs = new Set<string>();
    for (const [a, b] of centerEdgePairs) {
      const ua = top.get(a)!;
      const ub = top.get(b)!;
      if (ua !== ub) pairs.add(`${ua}\u0000${ub}`);
    }
    return { top, unitCount: new Set(top.values()).size, edgeCount: pairs.size };
  };

  const open = new Set<string>();
  let state = evaluate(open);
  if (focusKind === "folder") {
    // Open a whole level at a time so the overview stays a coherent cut of
    // the folder tree (all siblings at the same depth), never a ragged mix.
    for (;;) {
      const frontier = [...new Set(state.top.values())].filter(
        (id) => index.byId.get(id)?.kind === "folder",
      );
      if (frontier.length === 0) break;
      for (const f of frontier) open.add(f);
      const next = evaluate(open);
      const fits =
        next.unitCount <= centerBudget &&
        (next.edgeCount <= EDGE_BUDGET || next.edgeCount <= state.edgeCount);
      if (!fits) {
        for (const f of frontier) open.delete(f);
        break;
      }
      state = next;
    }
    // User expansions open on top of that cut, so they only ever split boxes.
    const forced = [...opened].filter((id) => isAncestorOrSelf(index, focusId, id));
    if (forced.length) {
      for (const id of forced) open.add(id);
      state = evaluate(open);
    }
  }
  // A folder holding a single leaf is shown as that leaf.
  const membersOf = new Map<string, string[]>();
  for (const [leaf, u] of state.top) {
    const arr = membersOf.get(u) ?? [];
    arr.push(leaf);
    membersOf.set(u, arr);
  }
  for (const [u, leaves] of membersOf) {
    if (leaves.length === 1 && u !== leaves[0]) state.top.set(leaves[0], leaves[0]);
  }
  const centerMembers = new Map<string, number>();
  for (const [leaf, u] of state.top) {
    const key = unitKey("center", u);
    leafUnit.set(leaf, key);
    centerMembers.set(u, (centerMembers.get(u) ?? 0) + 1);
  }
  for (const [u, members] of centerMembers) {
    units.set(unitKey("center", u), { region: "center", graphId: u, members });
  }

  // 4b. Side units start as leaves and roll up bottom-up until within budget.
  for (const [leaf, region] of leafRegion) {
    if (region === "center") continue;
    const key = unitKey(region, leaf);
    units.set(key, { region, graphId: leaf, members: 1 });
    leafUnit.set(leaf, key);
  }

  const canMergeInto = (folder: string): boolean => !isAncestorOrSelf(index, folder, focusId);

  let rolledUp = 0;
  const depth = (id: string) => ancestors(index, id).length;
  // Endpoint → leaf, resolved once so edge counting during roll-up is cheap.
  const edgeLeaves: [string, string][] = [];
  for (const e of index.edges) {
    const ls = centerLeaf(e.source) ?? sideLeaf(e.source);
    const lt = centerLeaf(e.target) ?? sideLeaf(e.target);
    if (leafRegion.has(ls) && leafRegion.has(lt)) edgeLeaves.push([ls, lt]);
  }
  const countEdges = (remap?: { from: Set<string>; to: string }): number => {
    const seen = new Set<string>();
    for (const [ls, lt] of edgeLeaves) {
      let us = leafUnit.get(ls)!;
      let ut = leafUnit.get(lt)!;
      if (remap) {
        if (remap.from.has(us)) us = remap.to;
        if (remap.from.has(ut)) ut = remap.to;
      }
      if (us !== ut) seen.add(`${us}\u0000${ut}`);
    }
    return seen.size;
  };
  const edgeBudget = opts.edgeBudget ?? TOTAL_EDGE_BUDGET;

  for (let guard = 0; guard < 10_000; guard++) {
    const overNodes = units.size > opts.budget;
    const edgeCount = overNodes ? 0 : countEdges();
    if (!overNodes && edgeCount <= edgeBudget) break;
    const subtree = new Map<string, Set<string>>(); // region|folder → unit keys
    for (const [key, u] of units) {
      if (u.region === "center") continue;
      let p = index.byId.get(u.graphId)?.parent ?? null;
      while (p !== null && p !== undefined && canMergeInto(p)) {
        const k = unitKey(u.region, p);
        const s = subtree.get(k) ?? new Set<string>();
        s.add(key);
        subtree.set(k, s);
        p = index.byId.get(p)?.parent ?? null;
      }
    }
    // A candidate holds ≥2 units and no child folder holding ≥2 units.
    const candidates: { key: string; region: Region; folder: string; members: Set<string> }[] = [];
    for (const [k, members] of subtree) {
      if (members.size < 2) continue;
      const [region, folder] = k.split("|") as [Region, string];
      const blocked = (index.children.get(folder) ?? []).some(
        (c) => (subtree.get(unitKey(region, c))?.size ?? 0) >= 2,
      );
      if (!blocked) candidates.push({ key: k, region, folder, members });
    }
    if (candidates.length === 0) break;

    let pick: (typeof candidates)[number];
    if (overNodes) {
      const excess = units.size - opts.budget;
      const finishing = candidates.filter((c) => c.members.size - 1 >= excess);
      pick = (finishing.length > 0 ? finishing : candidates).sort((a, b) => {
        const sa = a.members.size;
        const sb = b.members.size;
        if (finishing.length > 0 && sa !== sb) return sa - sb; // smallest that finishes
        if (finishing.length === 0 && sa !== sb) return sb - sa; // biggest saving
        return depth(b.folder) - depth(a.folder) || a.folder.localeCompare(b.folder);
      })[0];
    } else {
      // Too many edges: merge the folder that removes the most edges per box lost.
      let best = -Infinity;
      pick = candidates[0];
      for (const c of candidates) {
        const saved = edgeCount - countEdges({ from: c.members, to: c.key });
        const score = saved / (c.members.size - 1);
        if (score > best || (score === best && depth(c.folder) > depth(pick.folder))) {
          best = score;
          pick = c;
        }
      }
      if (best <= 0) break;
    }

    let total = 0;
    for (const m of pick.members) {
      total += units.get(m)!.members;
      units.delete(m);
      for (const [leaf, uk] of leafUnit) if (uk === m) leafUnit.set(leaf, pick.key);
    }
    units.set(pick.key, { region: pick.region, graphId: pick.folder, members: total });
    rolledUp += pick.members.size - 1;
  }

  // 4c. Expansions on the sides: a unit that swallowed an expanded folder
  // splits into the children along each leaf's path; other units stay put.
  if (opened.size > 0) {
    const swallowed = new Set([...units].filter(([, u]) => u.region !== "center" && opened.has(u.graphId)).map(([k]) => k));
    if (swallowed.size > 0) {
      const regrouped = new Map<string, { region: Region; graphId: string; leaves: string[] }>();
      for (const [leaf, uk] of leafUnit) {
        if (!swallowed.has(uk)) continue;
        const region = units.get(uk)!.region;
        const chain = [...ancestors(index, leaf), leaf];
        let at = -1;
        for (let i = 0; i < chain.length; i++) if (opened.has(chain[i])) at = i;
        const top = chain[Math.min(at + 1, chain.length - 1)];
        const key = unitKey(region, top);
        const g = regrouped.get(key) ?? { region, graphId: top, leaves: [] };
        g.leaves.push(leaf);
        regrouped.set(key, g);
      }
      for (const k of swallowed) units.delete(k);
      for (const [key, g] of regrouped) {
        // A child holding a single leaf is shown as that leaf.
        const only = g.leaves.length === 1 ? g.leaves[0] : null;
        const k = only ? unitKey(g.region, only) : key;
        units.set(k, { region: g.region, graphId: only ?? g.graphId, members: g.leaves.length });
        for (const l of g.leaves) leafUnit.set(l, k);
      }
    }
  }

  // 5. Aggregate edges between units.
  const unitOfEndpoint = (endpoint: string): string | undefined => {
    const c = centerLeaf(endpoint);
    if (c !== null) return leafUnit.get(c);
    return leafUnit.get(sideLeaf(endpoint));
  };
  const edgeMap = new Map<string, ViewEdge>();
  for (const e of index.edges) {
    const s = unitOfEndpoint(e.source);
    const t = unitOfEndpoint(e.target);
    if (!s || !t || s === t) continue;
    const id = `${s}->${t}`;
    let ve = edgeMap.get(id);
    if (!ve) {
      const rs = units.get(s)!.region;
      const rt = units.get(t)!.region;
      // Edges that don't touch the center are context; so are edges inside a
      // focused folder when it has outside neighbors (its seams are the story).
      const faint = (rs !== "center" && rt !== "center") || (rs === "center" && rt === "center" && hasSides);
      ve = { id, source: s, target: t, weight: 0, faint, symbols: [] };
      edgeMap.set(id, ve);
    }
    ve.weight += 1;
    const tn = index.byId.get(e.target);
    const names = e.symbols ?? (tn?.kind === "symbol" ? [tn.name] : []);
    for (const n of names) if (!ve.symbols.includes(n)) ve.symbols.push(n);
  }

  // 6. Materialize nodes.
  const nodes: ViewNode[] = [];
  for (const [key, u] of units) {
    const g = index.byId.get(u.graphId)!;
    const parentFile = g.kind === "symbol" && g.parent ? index.byId.get(g.parent) : undefined;
    const stats = g.kind === "folder" ? folderStats(index, g.id) : undefined;
    nodes.push({
      id: key,
      graphId: u.graphId,
      region: u.region,
      kind: g.kind,
      label: g.kind === "symbol" ? g.name : displayName(index, u.graphId),
      title: g.path ?? (parentFile ? `${parentFile.path ?? parentFile.name} › ${g.name}` : g.name),
      memberCount: u.members,
      // Inside a focused file, its symbols are the focus.
      isFocus: u.graphId === focusId || (u.region === "center" && focusKind !== "folder"),
      symbolKind: g.symbolKind,
      context: u.region !== "center" && parentFile ? displayName(index, parentFile.id) : undefined,
      subtitle: subtitleFor(index, g.id, u.region, focusId),
      fileCount: stats?.files,
      expandable: isExpandable(index, g.id, focusId),
    });
  }
  assignGroups(index, focusId, nodes, opened);
  disambiguateLabels(index, nodes);
  nodes.sort((a, b) => a.title.localeCompare(b.title));

  const breadcrumbs = [...ancestors(index, focusId), focusId].map((id) => ({
    id,
    label: displayName(index, id),
  }));

  return {
    focusId,
    focusKind,
    focusLabel: displayName(index, focusId),
    breadcrumbs,
    nodes,
    edges: [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    rolledUp,
    expanded: [...expanded],
  };
}

/** Folders open into their children; files into their symbols. The focus never does. */
function isExpandable(index: GraphIndex, id: string, focusId: string): boolean {
  if (id === focusId) return false;
  const g = index.byId.get(id);
  if (g?.kind === "folder") return true;
  if (g?.kind !== "file") return false;
  return (index.children.get(id) ?? []).some((c) => index.byId.get(c)?.kind === "symbol");
}

/**
 * Two boxes with the same label (routers/analysis.py vs services/analysis.py)
 * get parent folders prepended until they differ.
 */
function disambiguateLabels(index: GraphIndex, nodes: ViewNode[]): void {
  const path = (n: ViewNode) => {
    const g = index.byId.get(n.graphId);
    const owner = g?.kind === "symbol" && g.parent ? index.byId.get(g.parent) : g;
    return (owner?.path ?? owner?.name ?? n.label).split("/");
  };
  for (let depth = 1; depth <= 3; depth++) {
    const groups = new Map<string, ViewNode[]>();
    for (const n of nodes) groups.set(n.label, [...(groups.get(n.label) ?? []), n]);
    let changed = false;
    for (const group of groups.values()) {
      if (group.length < 2 || new Set(group.map((n) => n.graphId)).size < 2) continue;
      for (const n of group) {
        if (n.kind === "symbol") continue;
        const parts = path(n);
        const label = parts.slice(Math.max(0, parts.length - 1 - depth)).join("/");
        if (label !== n.label) {
          n.label = label;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

const singleSymbolCache = new WeakMap<GraphIndex, Map<string, string>>();

/**
 * Files whose edges to the rest of the repo all touch the same one of their
 * symbols: file id → symbol id. Computed once per index.
 */
export function singleSymbolFiles(index: GraphIndex): Map<string, string> {
  const cached = singleSymbolCache.get(index);
  if (cached) return cached;
  const ends = new Map<string, Set<string>>();
  const note = (end: string, other: string) => {
    const file = owningFile(index, end);
    if (file === owningFile(index, other)) return;
    const set = ends.get(file) ?? new Set<string>();
    set.add(end);
    ends.set(file, set);
  };
  for (const e of index.edges) {
    note(e.source, e.target);
    note(e.target, e.source);
  }
  const out = new Map<string, string>();
  for (const [file, set] of ends) {
    if (set.size !== 1) continue;
    const [only] = set;
    if (only !== file && index.byId.get(only)?.kind === "symbol") out.set(file, only);
  }
  singleSymbolCache.set(index, out);
  return out;
}

/**
 * Folders from just below the deepest folder `id` shares with the focus down
 * to (and including) `id` when it is a folder. Empty when `id` sits directly
 * in the shared folder.
 */
function foldersBelowShared(index: GraphIndex, focusChain: Set<string>, id: string): { shared: string; below: string[] } {
  const chain = [...ancestors(index, id), id];
  let at = 0;
  for (let i = 0; i < chain.length; i++) if (focusChain.has(chain[i])) at = i;
  const below = chain.slice(at + 1).filter((c) => index.byId.get(c)?.kind === "folder");
  return { shared: chain[at], below };
}

/**
 * Group side neighbors by package: the first folder below the deepest folder
 * they share with the focus (or that shared folder, for nodes directly in it).
 * When every neighbor on a side would land in one package — `packages/` in a
 * monorepo — group one level deeper instead (`agent-core`, `agent-shared`).
 * Symbols also carry their file, so a file's symbols sit together.
 */
export function assignGroups(index: GraphIndex, focusId: string, nodes: ViewNode[], opened: Set<string> = new Set()): void {
  const focusChain = new Set([...ancestors(index, focusId), focusId]);
  // Inside an opened folder or file, the frame is that folder: the deepest
  // opened ancestor, named by its path below what it shares with the focus.
  const openedFrame = (id: string): ViewNode["group"] => {
    const chain = ancestors(index, id);
    for (let i = chain.length - 1; i >= 0; i--) {
      const a = chain[i];
      if (focusChain.has(a)) return undefined;
      if (opened.has(a)) return { id: a, label: relativeLabel(index, focusChain, a), opened: true };
    }
    return undefined;
  };
  for (const region of ["in", "out"] as const) {
    const side = nodes.filter((n) => n.region === region);
    const paths = side.map((n) => foldersBelowShared(index, focusChain, n.graphId));
    let depth = 0;
    for (;;) {
      const keys = new Set(paths.map((p) => p.below[Math.min(depth, p.below.length - 1)] ?? p.shared));
      const deeper = paths.some((p) => p.below.length > depth + 1);
      if (keys.size !== 1 || !deeper || side.length < 2) break;
      depth++;
    }
    side.forEach((n, i) => {
      const p = paths[i];
      const pkg = p.below.length === 0 ? p.shared : p.below[Math.min(depth, p.below.length - 1)];
      n.group = openedFrame(n.graphId) ?? { id: pkg, label: displayName(index, pkg) };
      const g = index.byId.get(n.graphId);
      n.subgroup = g?.kind === "symbol" ? (g.parent ?? undefined) : undefined;
    });
  }
  for (const n of nodes) {
    if (n.region !== "center") continue;
    const frame = openedFrame(n.graphId);
    if (frame) n.group = frame;
  }
  disambiguateGroups(index, nodes);
}

/** `viz/deps` for `client/src/viz/deps` seen from `client/src`; a file keeps its name. */
function relativeLabel(index: GraphIndex, focusChain: Set<string>, id: string): string {
  const chain = [...ancestors(index, id), id];
  let at = 0;
  for (let i = 0; i < chain.length; i++) if (focusChain.has(chain[i])) at = i;
  const below = chain.slice(at + 1).map((c) => index.byId.get(c)?.name ?? c);
  return below.length ? below.join("/") : displayName(index, id);
}

/**
 * Two different packages with one name (`components/ui` and `server/ui`)
 * get parent folders prepended until their frame labels differ.
 */
function disambiguateGroups(index: GraphIndex, nodes: ViewNode[]): void {
  const groups = new Map<string, { id: string; label: string; opened?: boolean }>();
  for (const n of nodes) if (n.group) groups.set(n.group.id, n.group);
  const parts = (id: string) => (index.byId.get(id)?.path ?? id).split("/").filter(Boolean);
  for (let depth = 1; depth <= 3; depth++) {
    const byLabel = new Map<string, string[]>();
    for (const g of groups.values()) byLabel.set(g.label, [...(byLabel.get(g.label) ?? []), g.id]);
    let changed = false;
    for (const ids of byLabel.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        const p = parts(id);
        const label = p.slice(Math.max(0, p.length - 1 - depth)).join("/");
        if (label && label !== groups.get(id)!.label) {
          groups.get(id)!.label = label;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (const n of nodes) if (n.group) n.group = { ...groups.get(n.group.id)! };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The muted second line of a box.
 * - symbol on a side: `folder/file` (the folder and file it lives in)
 * - symbol in a focused file: its line (the glyph shows its kind; the file is the frame title)
 * - file: the folder it lives in, relative to the deepest folder it shares
 *   with the focus (none when it sits directly in a focused folder)
 * - folder: what it holds, e.g. "12 files · 3 folders"
 */
export function subtitleFor(index: GraphIndex, id: string, region: Region, focusId?: string): string | undefined {
  const g = index.byId.get(id);
  if (!g) return undefined;
  const parentName = (pid: string | null | undefined) => {
    const p = pid !== null && pid !== undefined ? index.byId.get(pid) : undefined;
    return p && p.id !== index.graph.root ? p.name : undefined;
  };
  switch (g.kind) {
    case "symbol": {
      const file = g.parent ? index.byId.get(g.parent) : undefined;
      if (region === "center") {
        // The kind glyph already says function/class/…; the line is what fits.
        return g.line ? `line ${g.line}` : g.symbolKind;
      }
      if (!file) return undefined;
      // `ui/Button.tsx`: the folder and file together, so two `ui` frames
      // (or a frame and a loose box) never leave the file in doubt.
      return [parentName(file.parent), file.name].filter(Boolean).join("/");
    }
    case "file": {
      const parent = g.parent !== null && g.parent !== undefined ? index.byId.get(g.parent) : undefined;
      if (!parent) return undefined;
      if (focusId === undefined) return parent.id === index.graph.root ? "(repo root)" : (parent.path ?? parent.name);
      // Relative to the deepest folder shared with the focus: `utils`, not
      // `client/src/utils`. Directly in that folder: the folder's own name.
      const focusChain = new Set([...ancestors(index, focusId), focusId]);
      const { shared, below } = foldersBelowShared(index, focusChain, parent.id);
      if (region === "center" && parent.id === focusId) return undefined;
      if (below.length === 0) return shared === index.graph.root ? "(repo root)" : displayName(index, shared);
      return below.map((id) => index.byId.get(id)?.name ?? id).join("/");
    }
    case "folder": {
      const { files, folders } = folderStats(index, id);
      return [plural(files, "file"), folders > 0 ? plural(folders, "folder") : undefined].filter(Boolean).join(" · ");
    }
    case "external":
      return "package";
  }
}
