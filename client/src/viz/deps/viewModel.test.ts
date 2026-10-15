import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/srcly-client.json";
import type { DependencyGraphContract } from "./contract";
import { applyFilters, buildIndex, DEFAULT_FILTERS } from "./hierarchy";
import { buildViewModel } from "./viewModel";

const srcly = () =>
  buildIndex(applyFilters(fixture as DependencyGraphContract, DEFAULT_FILTERS));

/** A synthetic repo: app → many leaf files in lib/ subfolders. */
function wideRepo(files: number): DependencyGraphContract {
  const nodes: DependencyGraphContract["nodes"] = [
    { id: "", kind: "folder", name: "repo", parent: null },
    { id: "app", kind: "folder", name: "app", parent: "" },
    { id: "app/main.ts", kind: "file", name: "main.ts", parent: "app" },
    { id: "lib", kind: "folder", name: "lib", parent: "" },
  ];
  const edges: DependencyGraphContract["edges"] = [];
  for (let g = 0; g < 8; g++) nodes.push({ id: `lib/g${g}`, kind: "folder", name: `g${g}`, parent: "lib" });
  for (let i = 0; i < files; i++) {
    const id = `lib/g${i % 8}/f${i}.ts`;
    nodes.push({ id, kind: "file", name: `f${i}.ts`, parent: `lib/g${i % 8}` });
    edges.push({ source: "app/main.ts", target: id });
  }
  return { root: "", nodes, edges };
}

describe("buildViewModel", () => {
  it("shows the root as a folder-level overview with aggregate edges", () => {
    const vm = buildViewModel(srcly(), { focusId: "src", budget: 48 });
    const labels = vm.nodes.map((n) => n.label);
    expect(labels).toContain("components");
    expect(labels).toContain("utils");
    expect(vm.nodes.length).toBeLessThanOrEqual(12);
    expect(vm.nodes.every((n) => n.region === "center")).toBe(true);
    const comp = vm.nodes.find((n) => n.label === "components")!;
    expect(comp.memberCount).toBeGreaterThan(20);
    // Many file-level imports collapse into a few weighted edges.
    expect(vm.edges.some((e) => e.weight > 3)).toBe(true);
  });

  it("puts importers left and imports right of a focused file", () => {
    const vm = buildViewModel(srcly(), { focusId: "src/components/Treemap.tsx", budget: 48 });
    const byLabel = new Map(vm.nodes.map((n) => [n.label, n]));
    expect(byLabel.get("Treemap.tsx")!.region).toBe("center");
    expect(byLabel.get("Treemap.tsx")!.isFocus).toBe(true);
    expect(byLabel.get("App.tsx")!.region).toBe("in");
    expect(byLabel.get("metricsStore.tsx")!.region).toBe("out");
    for (const e of vm.edges) {
      if (e.faint) continue;
      const s = vm.nodes.find((n) => n.id === e.source)!;
      const t = vm.nodes.find((n) => n.id === e.target)!;
      expect(s.region === "center" || t.region === "center").toBe(true);
    }
  });

  it("carries every edge touching the focus exactly once", () => {
    const idx = srcly();
    const focus = "src/utils/metricsStore.tsx";
    const vm = buildViewModel(idx, { focusId: focus, budget: 48 });
    const touching = idx.edges.filter((e) => e.source === focus || e.target === focus).length;
    const carried = vm.edges.filter((e) => !e.faint).reduce((a, e) => a + e.weight, 0);
    expect(carried).toBe(touching);
  });

  it("rolls neighbors up by folder only when over budget", () => {
    const idx = buildIndex(wideRepo(80));
    const vm = buildViewModel(idx, { focusId: "app/main.ts", budget: 20 });
    expect(vm.nodes.length).toBeLessThanOrEqual(20);
    expect(vm.rolledUp).toBeGreaterThan(0);
    const out = vm.nodes.filter((n) => n.region === "out");
    expect(out.some((n) => n.kind === "folder")).toBe(true);
    expect(out.reduce((a, n) => a + n.memberCount, 0)).toBe(80);

    const roomy = buildViewModel(idx, { focusId: "app/main.ts", budget: 100, edgeBudget: 200 });
    expect(roomy.rolledUp).toBe(0);
    expect(roomy.nodes.filter((n) => n.region === "out")).toHaveLength(80);
  });

  it("never rolls a neighbor into a folder that contains the focus", () => {
    const idx = buildIndex(wideRepo(80));
    const vm = buildViewModel(idx, { focusId: "lib/g0/f0.ts", budget: 10 });
    expect(vm.nodes.every((n) => n.graphId === "lib/g0/f0.ts" || !"lib/g0/f0.ts".startsWith(n.graphId + "/"))).toBe(true);
    expect(vm.nodes.find((n) => n.graphId === "")).toBeUndefined();
  });

  it("hides tests and externals by default", () => {
    const g = fixture as DependencyGraphContract;
    expect(g.nodes.some((n) => n.isTest)).toBe(true);
    const filtered = applyFilters(g, DEFAULT_FILTERS);
    expect(filtered.nodes.some((n) => n.isTest || n.kind === "external")).toBe(false);
    const all = applyFilters(g, { showExternal: true, showTests: true, showTypeOnly: true });
    expect(all.nodes.some((n) => n.kind === "external")).toBe(true);
  });

  it("drops type-only edges unless asked for", () => {
    const g = fixture as DependencyGraphContract;
    const typeOnly = g.edges.filter((e) => e.typeOnly);
    expect(typeOnly.length).toBeGreaterThan(0);
    const hidden = applyFilters(g, { ...DEFAULT_FILTERS, showTests: true, showExternal: true });
    expect(hidden.edges.some((e) => e.typeOnly)).toBe(false);
    const shown = applyFilters(g, { showExternal: true, showTests: true, showTypeOnly: true });
    expect(shown.edges.filter((e) => e.typeOnly)).toHaveLength(typeOnly.length);
  });
});
