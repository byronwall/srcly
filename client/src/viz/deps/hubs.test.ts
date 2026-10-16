import { describe, expect, it } from "vitest";
import type { DependencyGraphContract } from "./contract";
import fixture from "./__fixtures__/srcly-client.json";
import { boxInfo } from "./boxInfo";
import { countEdgeCrossings } from "./geometry";
import { applyFilters, buildIndex, collapseChain, DEFAULT_FILTERS } from "./hierarchy";
import { HUB_MIN_IMPORTERS, layoutWithHubs, MAX_HUBS, pickHubs } from "./hubs";
import { layoutViewSync } from "./layout";
import { buildViewModel } from "./viewModel";

const VIEWPORT = { width: 1155, height: 770 };
const opts = { aspectRatio: VIEWPORT.width / VIEWPORT.height, viewport: VIEWPORT };

/** `app/` files that all import `lib/core.ts`; one also imports `lib/rare.ts`. */
function fanIn(n: number): DependencyGraphContract {
  const nodes: DependencyGraphContract["nodes"] = [
    { id: "", kind: "folder", name: "repo", parent: null },
    { id: "lib", kind: "folder", name: "lib", parent: "" },
    { id: "lib/core.ts", kind: "file", name: "core.ts", parent: "lib" },
    { id: "lib/rare.ts", kind: "file", name: "rare.ts", parent: "lib" },
    { id: "app", kind: "folder", name: "app", parent: "" },
  ];
  const edges: DependencyGraphContract["edges"] = [{ source: "app/f0.ts", target: "lib/rare.ts" }];
  for (let i = 0; i < n; i++) {
    nodes.push({ id: `app/f${i}.ts`, kind: "file", name: `f${i}.ts`, parent: "app" });
    edges.push({ source: `app/f${i}.ts`, target: "lib/core.ts" });
  }
  return { root: "", nodes, edges };
}

describe("hubs", () => {
  it("collapses a target most boxes import into a badge, and nothing else", () => {
    const index = buildIndex(fanIn(8));
    const vm = buildViewModel(index, { focusId: "", budget: 48 });
    const layout = layoutWithHubs(vm, opts);
    const core = vm.nodes.find((n) => n.graphId === "lib/core.ts")!;
    expect(layout.hubs?.map((h) => h.id)).toEqual([core.id]);
    expect(layout.edges.some((e) => e.target === core.id)).toBe(false);
    expect(layout.hiddenEdges?.every((e) => e.target === core.id)).toBe(true);
    // Every importer wears the badge; the hub still counts all its links.
    const info = boxInfo(layout);
    expect(info.get(core.id)!.inLinks).toBe(8);
    for (const e of layout.hiddenEdges ?? []) expect(info.get(e.source)!.hubBadges.map((h) => h.id)).toEqual([core.id]);
  });

  it("needs enough importers", () => {
    const index = buildIndex(fanIn(HUB_MIN_IMPORTERS - 1));
    const vm = buildViewModel(index, { focusId: "", budget: 48 });
    expect(pickHubs(vm, layoutViewSync(vm, opts))).toEqual([]);
  });

  it("never hides the focus or its edges", () => {
    const index = buildIndex(fanIn(8));
    const vm = buildViewModel(index, { focusId: "lib/core.ts", budget: 48 });
    const layout = layoutWithHubs(vm, opts);
    const focus = new Set(vm.nodes.filter((n) => n.isFocus).map((n) => n.id));
    expect(layout.hubs?.some((h) => focus.has(h.id))).toBe(false);
    for (const e of layout.hiddenEdges ?? []) expect(focus.has(e.source) || focus.has(e.target)).toBe(false);
  });

  it("takes utils' fan-in off the components view and most of its crossings with it", () => {
    const idx = buildIndex(applyFilters(fixture as DependencyGraphContract, DEFAULT_FILTERS));
    const vm = buildViewModel(idx, { focusId: collapseChain(idx, "src/components"), budget: 48 });
    const plain = layoutViewSync(vm, opts);
    const hubbed = layoutWithHubs(vm, opts);
    const labels = (hubbed.hubs ?? []).map((h) => vm.nodes.find((n) => n.id === h.id)!.label);
    expect(labels).toContain("utils");
    expect(hubbed.hubs!.length).toBeLessThanOrEqual(MAX_HUBS);
    expect(hubbed.edges.length + hubbed.hiddenEdges!.length).toBe(plain.edges.length);
    expect(countEdgeCrossings(hubbed.edges)).toBeLessThan(countEdgeCrossings(plain.edges) / 2);
  });
});
