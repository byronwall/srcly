// @vitest-environment jsdom
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import fixture from "../../../../../engine/test/srcly/__fixtures__/solid-route.anchor-graph.json";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import { anchorGraphToViewModel } from "./anchorAdapter";
import { canAnchorBox } from "./inspectorModel";
import { FlowInspector } from "./FlowInspector";

vi.mock("lucide-solid", () => ({ ExternalLink: () => null, X: () => null }));
const graph = fixture as unknown as AnchorGraphResult;

describe("anchor continuation actions", () => {
  it("keeps frontier source recovery but never offers its synthetic id as an anchor", () => {
    const frontier = { ...graph.nodes[1], id: "frontier:end:program-element:example", kind: "frontier" as const, reason: "unbound-read" };
    const withFrontier = { ...graph, nodes: [...graph.nodes, frontier] };
    expect(frontier).toBeDefined();
    const container = document.createElement("div");
    document.body.append(container);
    const open = vi.fn();
    const dispose = render(() => createComponent(FlowInspector, { graph: null, model: anchorGraphToViewModel(withFrontier), rootPath: "/root", selected: frontier.id, reach: null, open: [], onOpen: open, onSelect: () => {}, onPickOrigin: () => {}, onToggleFrame: () => {}, onClose: () => {}, onTraceFrom: vi.fn(), onAddAnchor: vi.fn() }), container);
    try {
      expect(container.querySelector("[data-trace-from]")).toBeNull();
      expect(container.textContent).not.toContain("Add to the trace");
      expect(container.textContent).toContain("Open its source");
      (container.querySelector('[title="Open in the code viewer"]') as HTMLButtonElement).click();
      expect(open).toHaveBeenCalledWith(frontier.absPath, frontier.line);
    } finally { dispose(); container.remove(); }
  });
});

it("only permits actual anchor-graph nodes as continuation targets", () => {
  const node = graph.nodes.find((n) => n.kind !== "scope" && n.kind !== "anchor")!;
  expect(canAnchorBox(node)).toBe(true);
  expect(canAnchorBox({ ...node, id: "frontier:end:" + node.id, kind: "frontier" })).toBe(false);
  expect(canAnchorBox(undefined)).toBe(false);
});

it("keeps both continuation actions for a real program element", () => {
  const node = graph.nodes.find((n) => n.kind !== "scope" && n.kind !== "anchor")!;
  const container = document.createElement("div");
  document.body.append(container);
  const trace = vi.fn(), add = vi.fn();
  const dispose = render(() => createComponent(FlowInspector, {
    graph: null, model: anchorGraphToViewModel(graph), rootPath: "/root", selected: node.id, reach: null, open: [],
    onOpen: () => {}, onSelect: () => {}, onPickOrigin: () => {}, onToggleFrame: () => {}, onClose: () => {},
    onTraceFrom: trace, onAddAnchor: add,
  }), container);
  try {
    (container.querySelector("[data-trace-from]") as HTMLButtonElement).click();
    const addButton = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Add to the trace"))!;
    addButton.click();
    expect(trace).toHaveBeenCalledWith(node.id);
    expect(add).toHaveBeenCalledWith(node.id);
  } finally { dispose(); container.remove(); }
});
