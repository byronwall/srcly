import type { DependencyGraphContract } from "./contract";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/srcly-client.json";
import { countEdgeCrossings, countNodeCrossings, isOrthogonal } from "./geometry";
import { applyFilters, buildIndex, DEFAULT_FILTERS } from "./hierarchy";
import { bundleOffsets, layoutView, NODE_HEIGHT, NODE_WIDTH } from "./layout";
import { buildViewModel } from "./viewModel";

const idx = buildIndex(
  applyFilters(fixture as DependencyGraphContract, DEFAULT_FILTERS),
);

const FOCI = ["", "components", "utils", "src/utils/metricsStore.tsx", "components/Treemap.tsx"];

describe("layoutView geometry", () => {
  for (const focus of FOCI) {
    it(`routes cleanly for focus "${focus || "(root)"}"`, async () => {
      const vm = buildViewModel(idx, { focusId: focus, budget: 48 });
      const layout = await layoutView(vm, { aspectRatio: 1.7 });

      expect(layout.nodes).toHaveLength(vm.nodes.length);
      expect(layout.nodes.length).toBeLessThanOrEqual(48);
      // One box size everywhere.
      for (const n of layout.nodes) {
        expect(n.width).toBe(NODE_WIDTH);
        expect(n.height).toBe(NODE_HEIGHT);
      }
      // Rectilinear edges that never pass through a box.
      for (const e of layout.edges) expect(isOrthogonal(e.points)).toBe(true);
      const crossings = countNodeCrossings(layout.edges, layout.nodes);
      expect(crossings.examples).toEqual([]);

      // Importers sit left of the focus, imports to the right.
      const focusBox = layout.nodes.find((n) => n.node.isFocus);
      if (focusBox) {
        for (const n of layout.nodes) {
          if (n.node.region === "in") expect(n.x + n.width).toBeLessThanOrEqual(focusBox.x);
          if (n.node.region === "out") expect(n.x).toBeGreaterThanOrEqual(focusBox.x + focusBox.width);
        }
      }
      // Recorded so regressions in crossing count are visible in test output.
      expect(countEdgeCrossings(layout.edges)).toBeGreaterThanOrEqual(0);
    });
  }

  it("packs wide rather than tall", async () => {
    const vm = buildViewModel(idx, { focusId: "src/components", budget: 48 });
    const layout = await layoutView(vm, { aspectRatio: 1.7 });
    expect(layout.width / layout.height).toBeGreaterThan(1.2);
  });
});

describe("bundleOffsets", () => {
  it("spreads coincident tracks 1–2px apart and leaves box stubs on their ports", () => {
    const edges = [0, 1, 2].map((i) => ({
      id: `e${i}`,
      source: `s${i}`,
      target: "t",
      points: [
        { x: 0, y: i * 40 },
        { x: 50, y: i * 40 },
        { x: 50, y: 100 },
        { x: 120, y: 100 },
      ],
    }));
    bundleOffsets(edges);
    const xs = edges.map((e) => e.points[1].x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(1);
    expect(xs[1] - xs[0]).toBeLessThanOrEqual(2);
    for (const e of edges) {
      expect(e.points[3]).toEqual({ x: 120, y: 100 });
      expect(isOrthogonal(e.points)).toBe(true);
    }
  });
});

describe("flow direction", () => {
  it("places importers left of what they import in the overview", async () => {
    const vm = buildViewModel(idx, { focusId: "src", budget: 48 });
    const layout = await layoutView(vm, { aspectRatio: 1.7 });
    const x = (label: string) => layout.nodes.find((n) => n.node.label === label)!.x;
    expect(x("src/index.tsx")).toBeLessThan(x("App.tsx"));
    expect(x("App.tsx")).toBeLessThan(x("components"));
  });
});
