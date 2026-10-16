import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/srcly-client.json";
import type { DependencyGraphContract } from "./contract";
import { applyFilters, buildIndex, DEFAULT_FILTERS, folderStats } from "./hierarchy";
import { buildViewModel, subtitleFor } from "./viewModel";

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
    const regionsOf = (file: string) =>
      new Set(vm.nodes.filter((n) => n.graphId === file || n.graphId.startsWith(file + "#")).map((n) => n.region));
    expect([...regionsOf("src/components/Treemap.tsx")]).toEqual(["center"]);
    expect([...regionsOf("src/App.tsx")]).toEqual(["in"]);
    expect([...regionsOf("src/utils/metricsStore.tsx")]).toEqual(["out"]);
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
    const inFocus = (id: string) => id === focus || id.startsWith(focus + "#");
    const touching = idx.edges.filter((e) => inFocus(e.source) !== inFocus(e.target)).length;
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

  it("expands a focused file into its symbols and shows using functions", () => {
    const vm = buildViewModel(srcly(), { focusId: "src/utils/metricsStore.tsx", budget: 48 });
    const center = vm.nodes.filter((n) => n.region === "center");
    expect(center.every((n) => n.kind === "symbol" && n.isFocus)).toBe(true);
    expect(center.map((n) => n.label)).toContain("HOTSPOT_METRICS");
    const explorer = vm.nodes.find((n) => n.label === "Explorer");
    expect(explorer?.region).toBe("in");
    const edge = vm.edges.find(
      (e) => e.source === explorer!.id && e.target.endsWith("#HOTSPOT_METRICS"),
    );
    expect(edge).toBeDefined();
  });

  it("rolls side symbols up to their files when over budget", () => {
    const vm = buildViewModel(srcly(), { focusId: "src/utils/metricsStore.tsx", budget: 12 });
    expect(vm.nodes.length).toBeLessThanOrEqual(12);
    expect(vm.nodes.some((n) => n.region === "in" && n.kind !== "symbol")).toBe(true);
  });

  it("disambiguates duplicate labels with parent folders", () => {
    const g: DependencyGraphContract = {
      root: "",
      nodes: [
        { id: "", kind: "folder", name: "repo", parent: null },
        { id: "routers", kind: "folder", name: "routers", parent: "", path: "routers" },
        { id: "services", kind: "folder", name: "services", parent: "", path: "services" },
        { id: "routers/analysis.py", kind: "file", name: "analysis.py", parent: "routers", path: "routers/analysis.py" },
        { id: "services/analysis.py", kind: "file", name: "analysis.py", parent: "services", path: "services/analysis.py" },
      ],
      edges: [{ source: "routers/analysis.py", target: "services/analysis.py" }],
    };
    const vm = buildViewModel(buildIndex(g), { focusId: "services/analysis.py", budget: 48 });
    expect(vm.nodes.map((n) => n.label).sort()).toEqual(["routers/analysis.py", "services/analysis.py"]);
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

  describe("two-line boxes", () => {
    /** model_making/relationship_focus.py exports RelationshipFocus, used by pipeline.py. */
    const g: DependencyGraphContract = {
      root: "",
      nodes: [
        { id: "", kind: "folder", name: "repo", parent: null },
        { id: "server", kind: "folder", name: "server", parent: "", path: "server" },
        { id: "server/model_making", kind: "folder", name: "model_making", parent: "server", path: "server/model_making" },
        { id: "server/model_making/sub", kind: "folder", name: "sub", parent: "server/model_making", path: "server/model_making/sub" },
        {
          id: "server/model_making/relationship_focus.py",
          kind: "file",
          name: "relationship_focus.py",
          parent: "server/model_making",
          path: "server/model_making/relationship_focus.py",
        },
        {
          id: "server/model_making/relationship_focus.py#RelationshipFocus",
          kind: "symbol",
          name: "RelationshipFocus",
          parent: "server/model_making/relationship_focus.py",
          symbolKind: "class",
          line: 12,
        },
        { id: "server/model_making/sub/a.py", kind: "file", name: "a.py", parent: "server/model_making/sub", path: "server/model_making/sub/a.py" },
        { id: "server/pipeline.py", kind: "file", name: "pipeline.py", parent: "server", path: "server/pipeline.py" },
      ],
      edges: [
        { source: "server/pipeline.py", target: "server/model_making/relationship_focus.py#RelationshipFocus" },
        { source: "server/model_making/sub/a.py", target: "server/pipeline.py" },
      ],
    };
    const index = buildIndex(g);

    it("labels a side symbol by its bare name over folder/file", () => {
      const vm = buildViewModel(index, { focusId: "server/pipeline.py", budget: 48 });
      const sym = vm.nodes.find((n) => n.kind === "symbol")!;
      expect(sym.region).toBe("out");
      expect(sym.label).toBe("RelationshipFocus");
      expect(sym.subtitle).toBe("model_making/relationship_focus.py");
    });

    it("gives a focused file's symbols their kind and line", () => {
      const vm = buildViewModel(index, { focusId: "server/model_making/relationship_focus.py", budget: 48 });
      const sym = vm.nodes.find((n) => n.region === "center")!;
      expect(sym.subtitle).toBe("class · line 12");
    });

    it("gives a center file its folder relative to the focus", () => {
      const vm = buildViewModel(index, { focusId: "server", budget: 48 });
      expect(vm.nodes.find((n) => n.graphId === "server/model_making/sub/a.py")!.subtitle).toBe("model_making/sub");
    });

    it("gives a file its folder", () => {
      const vm = buildViewModel(index, { focusId: "server/pipeline.py", budget: 48 });
      expect(vm.nodes.find((n) => n.graphId === "server/pipeline.py")!.subtitle).toBe("server");
      // Relative to the folder it shares with the focus (server).
      expect(vm.nodes.find((n) => n.graphId === "server/model_making/sub/a.py")!.subtitle).toBe("model_making/sub");
    });

    it("tells a folder's files and subfolders", () => {
      expect(subtitleFor(index, "server/model_making", "center")).toBe("2 files · 1 folder");
      expect(subtitleFor(index, "server/model_making/sub", "in")).toBe("1 file");
      expect(folderStats(index, "server")).toEqual({ files: 3, folders: 1 });
    });

    it("counts the big folders in srcly", () => {
      const vm = buildViewModel(srcly(), { focusId: "src", budget: 48 });
      const comp = vm.nodes.find((n) => n.label === "components")!;
      expect(comp.subtitle).toMatch(/^\d+ files · \d+ folders$/);
      expect(comp.fileCount).toBeGreaterThan(20);
      for (const n of vm.nodes.filter((x) => x.kind === "folder")) expect(n.subtitle, n.label).toBeTruthy();
      // Files directly in the focus need no folder line.
      expect(vm.nodes.find((n) => n.label === "App.tsx")!.subtitle).toBeUndefined();
    });
  });
});

describe("frame labels", () => {
  it("adds parent folders when two packages share a name", () => {
    const nodes: DependencyGraphContract["nodes"] = [{ id: "", kind: "folder", name: "repo", parent: null }];
    const edges: DependencyGraphContract["edges"] = [];
    for (const top of ["x", "y"]) {
      nodes.push({ id: top, kind: "folder", name: top, parent: "" }, { id: `${top}/ui`, kind: "folder", name: "ui", parent: top, path: `${top}/ui` });
      for (const f of ["a", "b"]) nodes.push({ id: `${top}/ui/${f}.ts`, kind: "file", name: `${f}.ts`, parent: `${top}/ui`, path: `${top}/ui/${f}.ts` });
    }
    nodes.push({ id: "main.ts", kind: "file", name: "main.ts", parent: "", path: "main.ts" });
    // x/ui imports main; main imports y/ui: two `ui` packages on two sides.
    for (const f of ["a", "b"]) {
      edges.push({ source: `x/ui/${f}.ts`, target: "main.ts" }, { source: "main.ts", target: `y/ui/${f}.ts` });
    }
    const vm = buildViewModel(buildIndex({ root: "", nodes, edges }), { focusId: "main.ts", budget: 48 });
    const labels = new Set(vm.nodes.filter((n) => n.group).map((n) => n.group!.label));
    expect(labels).toEqual(new Set(["x/ui", "y/ui"]));
  });
});
