import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.anchor-graph.json";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import { layoutWithHubs } from "../hubs";
import { anchorGraphToViewModel } from "./anchorAdapter";
import { FLOW_MARKS } from "./marks";
import { reachFrom } from "./reach";

// Captured from engine/examples/solid-route by `cd engine && pnpm capture-anchor-graph`:
// both directions from `props.viewer?.name` in ViewerCard.
const graph = fixture as unknown as AnchorGraphResult;

describe("anchor graph → ViewModel", () => {
  const m = anchorGraphToViewModel(graph);
  const byLabel = (label: string) => m.vm.nodes.find((n) => n.label === label)!;

  it("puts the anchor in the center, what it comes from on the left and what it goes to on the right", () => {
    const anchor = byLabel("props.viewer?.name");
    expect(anchor).toMatchObject({ region: "center", isFocus: true, symbolKind: "anchor", tint: FLOW_MARKS.anchor.color });
    expect(m.vm.focusId).toBe(anchor.id);
    expect(m.vm.focusLabel).toBe("props.viewer?.name");
    const origin = byLabel("createResource(loadViewer)");
    expect(origin).toMatchObject({ region: "in", symbolKind: "origin", status: "proven" });
    const slots = m.vm.nodes.filter((n) => n.symbolKind === "terminal");
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((n) => n.region === "out")).toBe(true);
    // Scopes are frames, never boxes.
    expect(m.vm.nodes.some((n) => n.label === "ViewerCard" && !n.group)).toBe(false);
    expect(m.vm.nodes.length).toBe(graph.nodes.filter((n) => n.kind !== "scope").length);
  });

  it("frames every box by the function that owns it, with the file in the frame's name", () => {
    expect(byLabel("props.viewer?.name").group).toMatchObject({ label: "ViewerCard · ViewerCard.tsx", opened: true });
    expect(byLabel("createResource(loadViewer)").group?.label).toMatch(/^RecordsRoute · records\.tsx$/);
    expect(m.vm.nodes.every((n) => n.group)).toBe(true);
  });

  it("keeps the engine's relation kind, status, proof and field label on each edge, dashing calls and props", () => {
    expect(m.vm.edges.length).toBe(graph.edges.length);
    const field = m.vm.edges.find((e) => e.label);
    expect(field).toMatchObject({ relation: "field-input", status: "proven" });
    expect(field!.proof!.length).toBe(1);
    const prop = m.vm.edges.find((e) => e.relation === "component-prop-binding");
    expect(prop?.style).toBe("handoff");
    const plain = m.vm.edges.find((e) => e.relation === "references");
    expect(plain?.style).toBeUndefined();
    expect(m.vm.edges.every((e) => e.faint === (e.status !== "proven"))).toBe(true);
  });

  it("notes a boundary's reason and a box's type, and draws boundaries dotted", () => {
    const boundary = m.vm.nodes.find((n) => n.symbolKind === "boundary")!;
    expect(boundary.outline).toBe("dotted");
    expect(boundary.note).toContain("framework-runtime");
    expect(byLabel("props.viewer?.name").note).toContain("string");
  });

  it("lays out, and reach emphasis walks it: the anchor is reached from the origin and reaches the slot", () => {
    const layout = layoutWithHubs(m.vm, { aspectRatio: 1440 / 800, viewport: { width: 1440, height: 800 }, hidden: m.hidden });
    expect(layout.nodes.length).toBe(m.vm.nodes.length);
    const r = reachFrom(m.vm, m.vm.focusId, "both", { exclude: m.notFlow });
    expect(r.strong.nodes.has(byLabel("createResource(loadViewer)").id)).toBe(true);
    expect([...r.light.nodes, ...r.strong.nodes].some((id) => m.vm.nodes.find((n) => n.id === id)?.symbolKind === "terminal")).toBe(true);
  });
});
