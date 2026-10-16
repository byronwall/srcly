// What each box says about its wiring without drawing it: link counts,
// mutual imports and the hubs it uses (whose edges are hidden).

import type { Hub } from "./hubs";
import type { ViewLayout } from "./layout";

export interface BoxInfo {
  /** Import links in and out (edge weights, hidden hub edges included). */
  inLinks: number;
  outLinks: number;
  /** Box ids importing this one / imported by it, busiest first. */
  importers: string[];
  imports: string[];
  /** Import links per neighbor box id, for both directions. */
  linksFrom: Map<string, number>;
  linksTo: Map<string, number>;
  /** Box ids this one both imports and is imported by. */
  cycles: string[];
  /** Hubs this box imports; their edges are hidden behind badges. */
  hubBadges: Hub[];
  /** Set when this box is itself a hub. */
  hub?: Hub;
}

export function boxInfo(layout: Pick<ViewLayout, "nodes" | "edges" | "hiddenEdges" | "hubs">): Map<string, BoxInfo> {
  const out = new Map<string, BoxInfo>();
  const hubs = new Map((layout.hubs ?? []).map((h) => [h.id, h]));
  const ins = new Map<string, Map<string, number>>();
  const outs = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, k: string, other: string, w: number) => {
    const inner = m.get(k) ?? new Map<string, number>();
    inner.set(other, (inner.get(other) ?? 0) + w);
    m.set(k, inner);
  };
  const hidden = layout.hiddenEdges ?? [];
  for (const e of [...layout.edges, ...hidden]) {
    if (e.source === e.target) continue;
    add(ins, e.target, e.source, e.edge.weight);
    add(outs, e.source, e.target, e.edge.weight);
  }
  const badges = new Map<string, Set<string>>();
  for (const e of hidden) badges.set(e.source, (badges.get(e.source) ?? new Set()).add(e.target));
  const ranked = (m: Map<string, number> | undefined) => [...(m ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
  const sum = (m: Map<string, number> | undefined) => [...(m ?? new Map<string, number>()).values()].reduce((a, b) => a + b, 0);
  for (const n of layout.nodes) {
    const imports = ranked(outs.get(n.id));
    const importerSet = ins.get(n.id);
    out.set(n.id, {
      inLinks: sum(ins.get(n.id)),
      outLinks: sum(outs.get(n.id)),
      importers: ranked(importerSet),
      imports,
      linksFrom: importerSet ?? new Map(),
      linksTo: outs.get(n.id) ?? new Map(),
      cycles: imports.filter((id) => importerSet?.has(id)),
      hubBadges: (layout.hubs ?? []).filter((h) => badges.get(n.id)?.has(h.id)),
      hub: hubs.get(n.id),
    });
  }
  return out;
}
