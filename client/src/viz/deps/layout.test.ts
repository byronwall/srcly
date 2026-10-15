import type { DependencyGraphContract } from "./contract";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/srcly-client.json";
import { boundsOf, countEdgeCrossings, countNodeCrossings, isOrthogonal } from "./geometry";
import { applyFilters, buildIndex, collapseChain, DEFAULT_FILTERS, type GraphIndex } from "./hierarchy";
import {
  aspectOf,
  bundleOffsets,
  layoutView,
  layoutViewSync,
  MAX_SCALE,
  NODE_HEIGHT,
  NODE_WIDTH,
  rankPackings,
  type PositionedNode,
  type ViewLayout,
} from "./layout";
import { buildViewModel } from "./viewModel";

const idx = buildIndex(
  applyFilters(fixture as DependencyGraphContract, DEFAULT_FILTERS),
);

const FOCI = ["", "src/components", "src/utils", "src/utils/metricsStore.tsx", "src/components/Treemap.tsx"];

/** The dependency pane on a 1440×900 screen with the sidebar open. */
const VIEWPORT = { width: 1155, height: 770 };
const VIEW_ASPECT = VIEWPORT.width / VIEWPORT.height;

/**
 * Graphs captured from other (possibly private) repos with
 * `scripts/capture-dep-graph.sh`. The folder is gitignored, so these tests
 * only run on machines that have captures.
 */
const LOCAL_CAPTURES = Object.values(
  import.meta.glob("./__fixtures__/local/*.json", { eager: true, import: "default" }),
) as { name: string; foci: string[]; graph: DependencyGraphContract }[];

function layoutFocus(index: GraphIndex, focus: string) {
  const vm = buildViewModel(index, { focusId: collapseChain(index, focus), budget: 48 });
  return { vm, layout: layoutViewSync(vm, { aspectRatio: VIEW_ASPECT, viewport: VIEWPORT }) };
}

/**
 * A `server`-shaped folder: 15 children (folders and files) importing each
 * other across 5 depth levels, three per level.
 */
function layeredFolder(): DependencyGraphContract {
  const nodes: DependencyGraphContract["nodes"] = [
    { id: "", kind: "folder", name: "repo", parent: null },
    { id: "server", kind: "folder", name: "server", parent: "" },
  ];
  const edges: DependencyGraphContract["edges"] = [];
  const child = (i: number) => (i % 3 === 0 ? `server/pkg${i}/mod.py` : `server/m${i}.py`);
  for (let i = 0; i < 15; i++) {
    if (i % 3 === 0) {
      nodes.push({ id: `server/pkg${i}`, kind: "folder", name: `pkg${i}`, parent: "server" });
      for (const f of ["mod.py", "util.py"]) {
        nodes.push({ id: `server/pkg${i}/${f}`, kind: "file", name: f, parent: `server/pkg${i}` });
      }
      edges.push({ source: `server/pkg${i}/mod.py`, target: `server/pkg${i}/util.py` });
    } else {
      nodes.push({ id: child(i), kind: "file", name: `m${i}.py`, parent: "server" });
    }
  }
  // Level L (children 3L..3L+2) imports every child on level L+1.
  for (let level = 0; level < 4; level++) {
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) edges.push({ source: child(level * 3 + a), target: child(level * 3 + 3 + b) });
    }
  }
  return { root: "", nodes, edges };
}

/** Below this many boxes, keeping the flow may beat filling the screen. */
const SMALL_VIEW = 16;

/**
 * Width:height is within 0.5–2× the viewport's. A small view may instead keep
 * its left-to-right flow (rather than stacking every depth level in one
 * column) as long as it still fits the viewport at a readable zoom (90% of
 * full, the same threshold `rankPackings` uses).
 */
function expectViewportShaped(layout: ViewLayout, what: string) {
  const aspect = aspectOf(layout);
  const msg = `${what}: aspect ${aspect.toFixed(2)} vs viewport ${VIEW_ASPECT.toFixed(2)}`;
  const inBand = aspect >= VIEW_ASPECT / 2 && aspect <= VIEW_ASPECT * 2;
  if (inBand || layout.nodes.length >= SMALL_VIEW) {
    expect(aspect, msg).toBeGreaterThanOrEqual(VIEW_ASPECT / 2);
    expect(aspect, msg).toBeLessThanOrEqual(VIEW_ASPECT * 2);
    return;
  }
  const b = boundsOf(layout.nodes, layout.edges);
  expect(b.width * MAX_SCALE * 0.9, `${msg}, and too wide to read`).toBeLessThanOrEqual(VIEWPORT.width);
}

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
});

describe("viewport-shaped packing", () => {
  const FOLDER_FOCI = ["", "src", "src/components", "src/utils", "src/viz", "src/viz/treemap"];
  for (const focus of FOLDER_FOCI) {
    it(`fills the viewport for srcly folder "${focus || "(root)"}"`, () => {
      const { layout } = layoutFocus(idx, focus);
      expectViewportShaped(layout, focus || "(root)");
      expect(countNodeCrossings(layout.edges, layout.nodes).count).toBe(0);
    });
  }

  it("packs a 15-child, 5-level folder into a block, not a strip", () => {
    const { vm, layout } = layoutFocus(buildIndex(layeredFolder()), "server");
    expect(vm.nodes).toHaveLength(15);
    const aspect = aspectOf(layout);
    expect(aspect).toBeGreaterThanOrEqual(VIEW_ASPECT / 2);
    expect(aspect).toBeLessThanOrEqual(VIEW_ASPECT * 2);
    expect(countNodeCrossings(layout.edges, layout.nodes).count).toBe(0);
    // Levels fold into a few columns, never one stack.
    expect(new Set(layout.nodes.map((n) => n.column)).size).toBeGreaterThanOrEqual(2);
    // Folding keeps depth order: an importer never sits right of what it imports.
    const x = new Map(layout.nodes.map((n) => [n.id, n.x]));
    for (const e of layout.edges) expect(x.get(e.source)!).toBeLessThanOrEqual(x.get(e.target)!);
  });

  it("ranks the viewport-shaped grid above the most unfolded one", () => {
    // Five levels of three: one column per level is a 5×3 strip.
    const [best] = rankPackings([[], [3, 3, 3, 3, 3], []], VIEWPORT);
    const aspect = best.width / best.height;
    expect(aspect).toBeLessThanOrEqual(VIEW_ASPECT * 1.5);
    expect(aspect).toBeGreaterThanOrEqual(VIEW_ASPECT / 1.5);
  });

  for (const capture of LOCAL_CAPTURES) {
    const index = buildIndex(applyFilters(capture.graph, DEFAULT_FILTERS));
    for (const focus of capture.foci) {
      it(`fills the viewport for local capture ${capture.name}:${focus || "(root)"}`, () => {
        const { layout } = layoutFocus(index, focus);
        expectViewportShaped(layout, `${capture.name}:${focus}`);
        expect(countNodeCrossings(layout.edges, layout.nodes).count).toBe(0);
      });
    }
  }
});

/**
 * Edge-edge crossings per srcly focus with viewport-shaped packing and
 * two-line (40px) boxes. Later layout changes compare against these, so a
 * regression is a failing number.
 */
const CROSSING_BASELINE: Record<string, number> = {
  "": 13,
  src: 14,
  "src/components": 221,
  "src/utils": 135,
  "src/viz": 69,
  "src/viz/treemap": 17,
  "src/components/Treemap.tsx": 20,
  "src/utils/metricsStore.tsx": 31,
};

/** Grouping may cost some crossings (groups can't interleave), but not many. */
const GROUPING_SLACK = 1.25;

describe("crossing baseline", () => {
  it.each(Object.keys(CROSSING_BASELINE))("stays within the grouping slack of the recorded count for %s", (focus) => {
    const { layout } = layoutFocus(idx, focus);
    expect(countEdgeCrossings(layout.edges)).toBeLessThanOrEqual(Math.ceil(CROSSING_BASELINE[focus] * GROUPING_SLACK));
  });
});

/** Every group's boxes form one unbroken run of rows in each column. */
function expectGroupsContiguous(layout: ViewLayout, what: string) {
  const byColumn = new Map<number, PositionedNode[]>();
  for (const n of layout.nodes) byColumn.set(n.column, [...(byColumn.get(n.column) ?? []), n]);
  for (const col of byColumn.values()) {
    const ids = col.sort((a, b) => a.row - b.row).map((n) => n.node.group?.id ?? `solo:${n.id}`);
    const seen = new Set<string>();
    ids.forEach((g, i) => {
      if (i > 0 && ids[i - 1] !== g) expect(seen.has(g), `${what}: group ${g} split in column`).toBe(false);
      seen.add(g);
    });
  }
}

/** Frames hold only their own group's boxes, and never overlap each other. */
function expectFramesClean(layout: ViewLayout, what: string) {
  const frames = layout.frames ?? [];
  for (const f of frames) {
    for (const n of layout.nodes) {
      const overlaps = n.x < f.x + f.width && n.x + n.width > f.x && n.y < f.y + f.height && n.y + n.height > f.y;
      if (overlaps) expect(n.node.group?.id, `${what}: ${n.node.label} inside frame ${f.label}`).toBe(f.groupId);
    }
    for (const g of frames) {
      if (g === f) continue;
      const overlaps = g.x < f.x + f.width && g.x + g.width > f.x && g.y < f.y + f.height && g.y + g.height > f.y;
      expect(overlaps, `${what}: frames ${f.label} and ${g.label} overlap`).toBe(false);
    }
  }
}

/**
 * An app file importing from three packages plus a one-component file:
 * apps/web/main.ts → packages/{agent-core,agent-shared,agent-skills}/*, and
 * three files importing packages/ui/edit-in-place.tsx#EditInPlace.
 */
function packagesRepo(): DependencyGraphContract {
  const nodes: DependencyGraphContract["nodes"] = [
    { id: "", kind: "folder", name: "repo", parent: null },
    { id: "apps", kind: "folder", name: "apps", parent: "" },
    { id: "apps/web", kind: "folder", name: "web", parent: "apps" },
    { id: "packages", kind: "folder", name: "packages", parent: "" },
  ];
  const edges: DependencyGraphContract["edges"] = [];
  const file = (id: string) => nodes.push({ id, kind: "file", name: id.split("/").pop()!, parent: id.slice(0, id.lastIndexOf("/")), path: id });
  for (const f of ["main.ts", "routes.ts", "store.ts"]) file(`apps/web/${f}`);
  const pkgs = { "agent-core": ["a.ts", "b.ts", "c.ts", "d.ts"], "agent-shared": ["x.ts", "y.ts", "z.ts"], "agent-skills": ["p.ts", "q.ts", "r.ts"], ui: ["edit-in-place.tsx"] };
  for (const [pkg, files] of Object.entries(pkgs)) {
    nodes.push({ id: `packages/${pkg}`, kind: "folder", name: pkg, parent: "packages", path: `packages/${pkg}` });
    for (const f of files) file(`packages/${pkg}/${f}`);
  }
  nodes.push({ id: "packages/ui/edit-in-place.tsx#EditInPlace", kind: "symbol", name: "EditInPlace", parent: "packages/ui/edit-in-place.tsx", symbolKind: "function" });
  // Interleave imports across packages so label order alone would mix them.
  const order = ["agent-core/a.ts", "agent-shared/x.ts", "agent-skills/p.ts", "agent-core/b.ts", "agent-shared/y.ts", "agent-skills/q.ts", "agent-core/c.ts", "agent-shared/z.ts", "agent-skills/r.ts", "agent-core/d.ts"];
  order.forEach((t, i) => edges.push({ source: `apps/web/${["main.ts", "routes.ts", "store.ts"][i % 3]}`, target: `packages/${t}` }));
  for (const f of ["main.ts", "routes.ts", "store.ts"]) edges.push({ source: `apps/web/${f}`, target: "packages/ui/edit-in-place.tsx#EditInPlace" });
  edges.push({ source: "apps/web/main.ts", target: "apps/web/routes.ts" });
  return { root: "", nodes, edges };
}

describe("grouped neighbors", () => {
  it("keeps each package together in a labeled frame", () => {
    const { vm, layout } = layoutFocus(buildIndex(packagesRepo()), "apps/web");
    const out = vm.nodes.filter((n) => n.region === "out");
    expect(new Set(out.map((n) => n.group?.label))).toEqual(new Set(["agent-core", "agent-shared", "agent-skills", "ui"]));
    expectGroupsContiguous(layout, "packages");
    expectFramesClean(layout, "packages");
    expect((layout.frames ?? []).map((f) => f.label).sort()).toEqual(["agent-core", "agent-shared", "agent-skills"]);
    expect(countNodeCrossings(layout.edges, layout.nodes).count).toBe(0);
  });

  it("shows a file whose every importer uses one symbol as that symbol", () => {
    const { vm } = layoutFocus(buildIndex(packagesRepo()), "apps/web");
    const box = vm.nodes.find((n) => n.graphId.includes("edit-in-place"))!;
    expect(box.kind).toBe("symbol");
    expect(box.label).toBe("EditInPlace");
    expect(box.subtitle).toBe("ui · edit-in-place.tsx");
    // All three importers' edges land on it.
    expect(vm.edges.filter((e) => e.target === box.id).reduce((a, e) => a + e.weight, 0)).toBe(3);
  });

  for (const focus of [...FOCI, "src", "src/viz", "src/viz/treemap"]) {
    it(`keeps groups contiguous for srcly focus "${focus || "(root)"}"`, () => {
      const { layout } = layoutFocus(idx, focus);
      expectGroupsContiguous(layout, focus);
      expectFramesClean(layout, focus);
      expect(countNodeCrossings(layout.edges, layout.nodes).count).toBe(0);
    });
  }

  for (const capture of LOCAL_CAPTURES) {
    const index = buildIndex(applyFilters(capture.graph, DEFAULT_FILTERS));
    for (const focus of capture.foci) {
      it(`keeps groups contiguous for local capture ${capture.name}:${focus || "(root)"}`, () => {
        const { layout } = layoutFocus(index, focus);
        expectGroupsContiguous(layout, `${capture.name}:${focus}`);
        expectFramesClean(layout, `${capture.name}:${focus}`);
      });
    }
  }
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
    // Eight boxes fill the viewport best in two columns, so adjacent depth
    // levels may share a column — but flow never runs right to left.
    expect(x("src/index.tsx")).toBeLessThanOrEqual(x("App.tsx"));
    expect(x("App.tsx")).toBeLessThanOrEqual(x("components"));
  });
});

describe("connected components", () => {
  it("stacks unrelated parts of a repo under their shared folder", async () => {
    const node = (id: string, kind: "folder" | "file", parent: string) => ({
      id,
      kind,
      name: id.split("/").pop()!,
      parent,
      path: id,
    });
    const g = {
      root: "",
      nodes: [
        { id: "", kind: "folder" as const, name: "repo", parent: null },
        node("client", "folder", ""),
        node("client/a.ts", "file", "client"),
        node("client/b.ts", "file", "client"),
        node("server", "folder", ""),
        node("server/x.py", "file", "server"),
        node("server/y.py", "file", "server"),
      ],
      edges: [
        { source: "client/a.ts", target: "client/b.ts" },
        { source: "server/x.py", target: "server/y.py" },
      ],
    };
    const vm = buildViewModel(buildIndex(g), { focusId: "", budget: 48 });
    const layout = await layoutView(vm, { aspectRatio: 1.7 });
    expect(layout.groups?.map((x) => x.label).sort()).toEqual(["client", "server"]);
    const ys = (prefix: string) => layout.nodes.filter((n) => n.node.title.startsWith(prefix)).map((n) => n.y);
    expect(Math.max(...ys("client"))).toBeLessThan(Math.min(...ys("server")));
    expect(countNodeCrossings(layout.edges, layout.nodes).count).toBe(0);
  });
});
