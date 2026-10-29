import { describe, expect, it } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.anchor-graph.json";
import declarationFixture from "../../../../../engine/test/srcly/__fixtures__/solid-route-viewer-card.anchor-graph.json";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import { layoutWithHubs } from "../hubs";
import { ANCHOR_FOLD_BUDGET, anchorGraphToViewModel } from "./anchorAdapter";
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
    // Every box but the one `props` reference that only repeats the parameter.
    expect(m.vm.nodes.length).toBe(graph.nodes.filter((n) => n.kind !== "scope").length - 1);
  });

  it("folds a reference that only repeats a value into that value, so its edges leave from the value", () => {
    const refs = graph.nodes.filter((n) => n.kind === "value" && n.elementKind === "value" && n.label === "props");
    expect(refs).toHaveLength(1);
    const [ref] = refs;
    const param = graph.edges.find((e) => e.target === ref.id && e.kind === "references")!.source;
    expect(m.vm.nodes.some((n) => n.id === ref.id)).toBe(false);
    expect(m.shownAs.get(ref.id)).toBe(param);
    expect(m.vm.rolledUp).toBe(1);
    // `props.viewer` is read from the parameter itself now.
    const read = graph.edges.find((e) => e.source === ref.id && e.kind === "field-input")!;
    expect(m.vm.edges.some((e) => e.source === param && e.target === read.target && e.relation === "field-input")).toBe(true);
  });

  it("frames every box by the function that owns it, with the file in the frame's name", () => {
    expect(byLabel("props.viewer?.name").group).toMatchObject({ label: "ViewerCard · ViewerCard.tsx", opened: true });
    expect(byLabel("createResource(loadViewer)").group?.label).toMatch(/^RecordsRoute · records\.tsx$/);
    expect(m.vm.nodes.every((n) => n.group)).toBe(true);
  });

  it("keeps the engine's relation kind, status, proof and field label on each edge, dashing calls and props", () => {
    // Less the folded reference's own link.
    expect(m.vm.edges.length).toBe(graph.edges.length - 1);
    const field = m.vm.edges.find((e) => e.label);
    expect(field).toMatchObject({ relation: "field-input", status: "proven" });
    expect(field!.proof!.length).toBe(1);
    const prop = m.vm.edges.find((e) => e.relation === "component-prop-binding");
    expect(prop?.style).toBe("handoff");
    const plain = m.vm.edges.find((e) => e.relation === "references");
    expect(plain?.style).toBeUndefined();
    expect(m.vm.edges.every((e) => e.faint === (e.status !== "proven"))).toBe(true);
  });

  it("labels a frontier by why it stops and names its place below, since the read beside it carries the name", () => {
    const read = graph.nodes.find((n) => n.label === "props.viewer?.name")!;
    const stop = { ...read, id: "frontier:1", kind: "frontier" as const, reason: "unbound-read", status: "partial" as const };
    const box = anchorGraphToViewModel({ ...graph, nodes: [...graph.nodes, stop] }).vm.nodes.find((n) => n.id === "frontier:1")!;
    expect(box).toMatchObject({ label: "Binding not traced", outline: "hatched", note: undefined });
    expect(box.subtitle).toMatch(/^props\.viewer\?\.name · ViewerCard\.tsx:\d+$/);
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

describe("a trace over the fold budget", () => {
  // Pad the anchor's own component past the budget: its boxes stay drawn. RecordsRoute hands it `viewer`.
  const anchor = graph.nodes.find((n) => n.kind === "anchor")!;
  const route = graph.nodes.find((n) => n.kind === "scope" && n.label === "RecordsRoute")!;
  const pad = Array.from({ length: ANCHOR_FOLD_BUDGET }, (_, i) => ({ ...anchor, id: `pad:${i}`, kind: "value" as const, symbol: null, field: null }));
  // A callback written inside RecordsRoute belongs to its component.
  const callback = { ...route, id: "scope:callback", label: "createMemo callback", span: { ...route.span, startLine: route.span.startLine + 2, endLine: route.span.startLine + 4 } };
  const inCallback = { ...anchor, id: "in-callback", kind: "value" as const, parent: callback.id, side: "up" as const };
  const big = { ...graph, nodes: [...graph.nodes, ...pad, callback, inCallback] };
  const handoff = graph.edges.find((e) => e.kind === "component-prop-binding")!;
  const rest = graph.nodes.filter((n) => n.parent === route.id && n.id !== handoff.source);

  it("draws the first box of a component the value comes from, and folds the rest of it, callbacks too, into one box", () => {
    const m = anchorGraphToViewModel(big, { expanded: [], model: "steps" });
    expect(m.vm.nodes.some((n) => n.id === handoff.source)).toBe(true);
    expect(m.vm.nodes.some((n) => n.id === rest[0].id || n.id === "in-callback")).toBe(false);
    const box = m.vm.nodes.find((n) => n.id === route.id)!;
    expect(box).toMatchObject({ expandable: true, outline: "dotted", memberCount: rest.length + 1 });
    expect(m.shownAs.get("in-callback")).toBe(route.id);
    expect(m.vm.nodes.some((n) => n.id === "pad:0")).toBe(true);
    expect(m.vm.edges.every((e) => m.vm.nodes.some((n) => n.id === e.source) && m.vm.nodes.some((n) => n.id === e.target))).toBe(true);
  });

  it("draws an opened component's boxes under its id, and folds nothing without options", () => {
    const opened = anchorGraphToViewModel(big, { expanded: [route.id], model: "steps" });
    expect(opened.vm.nodes.find((n) => n.id === "in-callback")?.graphId).toBe(`${route.id}#in-callback`);
    expect(opened.vm.nodes.some((n) => n.expandable)).toBe(false);
    expect(anchorGraphToViewModel(big).vm.nodes.some((n) => n.id === route.id)).toBe(false);
  });
});

describe("a declaration anchor's structural links", () => {
  // ViewerCard by name: its parameter and return links are found by syntax.
  const graph = declarationFixture as unknown as AnchorGraphResult;
  const m = anchorGraphToViewModel(graph);
  const structural = m.vm.edges.filter((e) => e.status === "structural");

  it("draws a structural edge in its own style, faint, and never as a handoff", () => {
    expect(structural.length).toBeGreaterThan(0);
    expect(new Set(structural.map((e) => e.relation))).toEqual(new Set(["parameter", "returns"]));
    expect(structural.every((e) => e.style === "structural" && e.faint)).toBe(true);
    // Every other edge carries the engine's proof.
    expect(m.vm.edges.filter((e) => e.status === "proven").every((e) => e.proof!.length > 0)).toBe(true);
  });

  it("is walked by reach emphasis without being lit as proven", () => {
    const r = reachFrom(m.vm, m.vm.focusId, "both", { exclude: m.notFlow });
    for (const e of structural) {
      expect(r.strong.edges.has(e.id)).toBe(false);
      expect(r.light.edges.has(e.id)).toBe(false);
    }
    expect(r.structural.size).toBeGreaterThan(0);
    // Through the parameter link, the anchor is still reached from the viewer resource.
    const origin = m.vm.nodes.find((n) => n.symbolKind === "origin")!;
    expect(r.strong.nodes.has(origin.id)).toBe(true);
  });
});
