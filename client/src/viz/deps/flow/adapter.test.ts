import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.route-graph.json";
import type { RouteGraphResult } from "../../../dataflow/contract.generated";
import { layoutWithHubs } from "../hubs";
import { routeGraphToViewModel } from "./adapter";

// Captured from engine/examples/solid-route by `cd engine && pnpm capture-route-graph`.
const graph = fixture as unknown as RouteGraphResult;
const nodeId = (label: string) => graph.nodes.find((n) => n.label === label)!.id;

describe("route graph → ViewModel", () => {
  it("draws the route as the root and every other box inside its parent's frame", () => {
    const { vm } = routeGraphToViewModel(graph);
    const root = vm.nodes.filter((n) => !n.group);
    expect(root.map((n) => n.label)).toEqual(["/records"]);
    expect(root[0].isFocus).toBe(true);
    expect(vm.nodes.every((n) => n.region === "center")).toBe(true);
    const frame = nodeId("RouteFrame");
    const inFrame = vm.nodes.filter((n) => n.group?.id === frame).map((n) => n.label).sort();
    expect(inFrame).toEqual(["Show", "Solid route fixture", "ViewerCard", "props.title"]);
    expect(vm.nodes.find((n) => n.label === "ViewerCard")!.group).toMatchObject({ label: "RouteFrame", opened: true });
  });

  it("keeps MetricCard's two occurrences as two boxes in RecordSummary's frame", () => {
    const { vm } = routeGraphToViewModel(graph);
    const cards = vm.nodes.filter((n) => n.label === "MetricCard");
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((n) => n.group?.id))).toEqual(new Set([nodeId("RecordSummary")]));
    expect(new Set(cards.map((n) => n.subtitle))).toEqual(new Set(["MetricCard.tsx · RecordSummary.tsx:7", "MetricCard.tsx · RecordSummary.tsx:8"]));
  });

  it("draws render edges between frames and hides containment of terminals and origins", () => {
    const { vm, hidden } = routeGraphToViewModel(graph);
    const label = new Map(vm.nodes.map((n) => [n.id, n.label]));
    const drawn = vm.edges.filter((e) => !hidden.has(e.id) && !e.style).map((e) => `${label.get(e.source)}>${label.get(e.target)}`);
    expect(drawn).toContain("/records>RouteFrame");
    expect(drawn).toContain("For>RecordRow");
    expect(drawn.some((e) => e.endsWith(">row.title"))).toBe(false);
    const handoffs = vm.edges.filter((e) => e.style === "handoff");
    expect(handoffs.length).toBeGreaterThan(0);
    expect(handoffs.every((e) => label.get(e.source) === "createResource(loadViewer)")).toBe(true);
  });

  it("folds deep frames past the budget and opens them in place on request", () => {
    const small = routeGraphToViewModel(graph, { budget: 8 });
    expect(small.vm.nodes.length).toBeLessThanOrEqual(12);
    const folded = small.vm.nodes.filter((n) => n.expandable);
    expect(folded.length).toBeGreaterThan(0);
    const frame = folded[0];
    expect(frame.note).toMatch(/\+\d+ inside/);
    const opened = routeGraphToViewModel(graph, { budget: 8, expanded: [frame.id] });
    expect(opened.vm.nodes.some((n) => n.group?.id === frame.id)).toBe(true);
    // A folded node is shown as the frame that holds it.
    const hiddenLeaf = graph.nodes.find((n) => !small.vm.nodes.some((v) => v.id === n.id))!;
    expect(small.vm.nodes.some((v) => v.id === small.shownAs.get(hiddenLeaf.id))).toBe(true);
  });

  it("lays out with today's packing: each frame is one block of adjacent columns", () => {
    const { vm, hidden } = routeGraphToViewModel(graph);
    const layout = layoutWithHubs(vm, { aspectRatio: 1440 / 800, viewport: { width: 1440, height: 800 }, hidden });
    const columns = new Map<string, Set<number>>();
    for (const n of layout.nodes) {
      if (!n.node.group) continue;
      (columns.get(n.node.group.id) ?? columns.set(n.node.group.id, new Set()).get(n.node.group.id)!).add(n.column);
    }
    for (const [group, cols] of columns) {
      const sorted = [...cols].sort((a, b) => a - b);
      expect(sorted.at(-1)! - sorted[0], group).toBe(sorted.length - 1);
    }
    // Containment edges order the columns without being drawn.
    expect(layout.hiddenEdges?.length).toBeGreaterThan(0);
    // Hierarchy reads left to right: a frame never sits left of the box it
    // opens (the packer may fold adjacent levels into one column).
    const column = new Map(layout.nodes.map((n) => [n.id, n.column]));
    for (const n of layout.nodes) if (n.node.group) expect(column.get(n.id)!).toBeGreaterThanOrEqual(column.get(n.node.group.id)!);
  });
});

describe("selected origin", () => {
  it("lights its proven destinations and the edges that reach them", () => {
    const origin = graph.origins.find((o) => o.label === "createResource(loadViewer)")!.nodeId;
    const destinations = graph.edges.filter((e) => e.source === origin && e.kind === "handoff").map((e) => e.target);
    const selected = { ...graph, selectedSource: origin, destinations } as RouteGraphResult;
    const { vm, lit } = routeGraphToViewModel(selected);
    expect(lit?.nodes.has(origin)).toBe(true);
    const litLabels = vm.nodes.filter((n) => n.lit).map((n) => n.label).sort();
    expect(litLabels).toEqual(["ViewerCard", 'props.viewer?.name ?? "loading viewer"', 'props.viewer?.team ?? "loading team"'].sort());
    expect(vm.nodes.some((n) => n.lit && n.group?.label === "RecordRow")).toBe(false);
    expect(lit!.edges.size).toBe(destinations.length);
  });

  it("lights nothing without a selection", () => {
    expect(routeGraphToViewModel(graph).lit).toBeNull();
  });
});

describe("edges carry what their cards and labels need", () => {
  it("names an origin's containment as ownership, not flow", () => {
    const { vm, notFlow, hidden } = routeGraphToViewModel(graph);
    const origins = new Set(graph.nodes.filter((n) => n.kind === "origin").map((n) => n.id));
    const owned = vm.edges.filter((e) => origins.has(e.target) && e.id.startsWith("contains:"));
    expect(owned.length).toBe(origins.size);
    for (const e of owned) {
      expect(notFlow.has(e.id)).toBe(true);
      expect(hidden.has(e.id)).toBe(true);
    }
    expect(vm.edges.filter((e) => notFlow.has(e.id)).length).toBe(owned.length);
  });

  it("keeps a handoff's status and proof, and a field edge's path as its label", () => {
    const origin = graph.origins.find((o) => o.label === "createResource(loadViewer)")!.nodeId;
    const viewer = graph.nodes.find((n) => n.label === "ViewerCard")!.id;
    const field: RouteGraphResult["edges"][number] = {
      id: "field:1",
      source: origin,
      target: viewer,
      kind: "field",
      label: "viewer.name",
      status: "proven",
      proof: [{ kind: "field-read", detail: "reads .name from viewer", status: "proven", locations: [{ file: "src/components/ViewerCard.tsx", line: 6, column: 3, span: { startLine: 6, startColumn: 3, endLine: 6, endColumn: 20 } }] }],
      pathIds: null,
    };
    const { vm } = routeGraphToViewModel({ ...graph, edges: [...graph.edges, field] });
    const handoff = vm.edges.find((e) => e.style === "handoff")!;
    expect(handoff.status).toBe("proven");
    expect(handoff.proof?.length).toBeGreaterThan(0);
    expect(handoff.label).toBeUndefined();
    const drawn = vm.edges.find((e) => e.id === "field:field:1")!;
    expect(drawn).toMatchObject({ style: "field", label: "viewer.name", status: "proven" });
    expect(drawn.proof).toEqual([{ kind: "field-read", detail: "reads .name from viewer", status: "proven", at: "ViewerCard.tsx:6" }]);
  });
});
