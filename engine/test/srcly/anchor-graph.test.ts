import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnchorGraphResult, AnchorNode } from "../../src/srcly/contracts/anchor-graph";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";
import { solidRoute } from "./engine-process";

const basics = fileURLToPath(new URL("../../examples/value-flow-basics", import.meta.url));

function sessionFor(root: string) {
  const source = path.join(root, "src");
  return createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
}

/** The span of `text` on the first line of `file` that contains it. */
function find(root: string, file: string, text: string, marker = text) {
  const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes(marker));
  if (index < 0) throw new Error(`${marker} is not in ${file}`);
  const column = lines[index].indexOf(text) + 1;
  return { file, text, span: { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length } };
}

const boxes = (graph: AnchorGraphResult, kind?: AnchorNode["kind"]) => graph.nodes.filter((node) => node.kind !== "scope" && (!kind || node.kind === kind));
const labels = (nodes: AnchorNode[]) => nodes.map((node) => node.label).sort();

describe("anchorGraph on value-flow-basics", () => {
  const session = sessionFor(basics);

  it("walks forward from a prop read to its render slot, framed by the component that owns it", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/direct-property.tsx", "props.item.title"), direction: "forward" });
    expect(graph.outcome).toBe("ok");
    expect(graph.direction).toBe("forward");
    const anchor = graph.nodes.find((node) => node.kind === "anchor")!;
    expect(anchor).toMatchObject({ label: "props.item.title", side: "seed", status: "proven", detail: "property read" });
    expect(graph.anchor.elementId).toBeTruthy();
    expect(anchor.elementKind).toBe("field-read");
    expect(anchor.typeText).toBe("string");
    const terminals = boxes(graph, "terminal");
    expect(terminals.length).toBe(1);
    expect(terminals[0]).toMatchObject({ side: "down", line: 2, status: "proven" });
    expect(graph.terminals).toEqual([{ nodeId: terminals[0].id, label: terminals[0].label, roles: expect.any(Array), status: "proven" }]);
    // The anchor and the slot sit in the same component frame.
    const scope = graph.nodes.find((node) => node.id === anchor.parent)!;
    expect(scope).toMatchObject({ kind: "scope", parent: null, detail: "direct-property.tsx" });
    expect(terminals[0].parent).toBe(scope.id);
    expect(graph.counts).toMatchObject({ up: 0, terminals: 1, boundaries: 0, frontiers: 0 });
    expect(graph.counts.down).toBeGreaterThanOrEqual(1);
    // Every edge joins two drawn boxes, and its proof is the engine's relation proof.
    const ids = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) {
      expect(ids.has(edge.source) && ids.has(edge.target), edge.id).toBe(true);
      expect(edge.proof.length).toBe(1);
    }
  }, 60_000);

  it("walks backward from the render slot to the prop read, and both ways from the middle", () => {
    const forward = anchorGraphOp(session, { ...find(basics, "src/direct-property.tsx", "props.item.title"), direction: "forward" });
    const slot = boxes(forward, "terminal")[0];
    const back = anchorGraphOp(session, { file: "src/direct-property.tsx", span: slot.span, direction: "backward" });
    expect(back.direction).toBe("backward");
    expect(back.counts.down).toBe(0);
    // The field read at the slot's own span is the anchor itself; above it sits the component's `props`.
    expect(boxes(back).some((node) => node.side === "up" && node.label === "props")).toBe(true);
    const both = anchorGraphOp(session, { ...find(basics, "src/direct-property.tsx", "props.item.title") });
    expect(both.direction).toBe("both");
    expect(both.counts.down).toBeGreaterThanOrEqual(1);
    expect(boxes(both).every((node) => node.side === "seed" || node.side === "up" || node.side === "down" || node.side === "both")).toBe(true);
  });

  it("stops at a helper with two call sites as a boundary, never guessing which caller's value returns", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/two-call-helper.tsx", "props.a"), direction: "forward" });
    expect(graph.outcome).toBe("partial");
    const boundary = boxes(graph, "boundary");
    expect(boundary.length).toBeGreaterThan(0);
    expect(boundary[0]).toMatchObject({ status: "partial", reason: "unproven-handoff" });
    expect(boundary[0].note).toMatch(/2 call sites/);
    expect(graph.counts.boundaries).toBe(boundary.length);
  });

  it("anchors at a symbol by name and line, as the import graph names one", () => {
    const line = find(basics, "src/direct-property.tsx", "props.item.title").span.startLine;
    const graph = anchorGraphOp(session, { file: "src/direct-property.tsx", name: "props", line, direction: "forward" });
    const anchor = graph.nodes.find((node) => node.kind === "anchor")!;
    expect(anchor.label).toBe("props");
    expect(anchor.span.startLine).toBe(line);
    expect(graph.anchor.kind).toBe("Identifier");
  });

  it("is unsupported, with the anchor still drawn, where the engine has no evidence element", () => {
    // The `h2` tag name is a supported identifier with no evidence element behind it.
    const graph = anchorGraphOp(session, { ...find(basics, "src/direct-property.tsx", "h2", "<h2>"), direction: "forward" });
    expect(graph.outcome).toBe("unsupported");
    expect(graph.reason).toBe("no-evidence-element");
    expect(graph.nodes.filter((node) => node.kind === "anchor")).toHaveLength(1);
    expect(graph.nodes.find((node) => node.kind === "anchor")!.status).toBe("partial");
  });

  it("refuses a direction it does not know and a name without a line", () => {
    expect(() => anchorGraphOp(session, { ...find(basics, "src/direct-property.tsx", "props.item.title"), direction: "sideways" })).toThrow(/direction/);
    expect(() => anchorGraphOp(session, { file: "src/direct-property.tsx", name: "props" })).toThrow(/line/);
  });
});

describe("anchorGraph on solid-route", () => {
  const session = sessionFor(solidRoute);

  it("reaches the viewer resource backward from a ViewerCard prop read, across the component boundary", () => {
    const graph = anchorGraphOp(session, { ...find(solidRoute, "src/components/ViewerCard.tsx", "props.viewer?.name"), direction: "both" });
    const origins = boxes(graph, "origin");
    expect(labels(origins).some((label) => /loadViewer|viewer/i.test(label))).toBe(true);
    expect(graph.origins.length).toBe(origins.length);
    expect(graph.origins.every((origin) => origin.roles.length > 0)).toBe(true);
    const files = new Set(graph.nodes.map((node) => node.file));
    expect(files.has("src/components/ViewerCard.tsx")).toBe(true);
    expect(files.size).toBeGreaterThan(1);
    expect(boxes(graph, "terminal").some((node) => node.side === "down")).toBe(true);
    expect(graph.generation).toBe(1);
  }, 120_000);

  it("anchors a symbol by name where the engine's evidence sits: a resource's initializer, a component's whole definition", () => {
    const records = anchorGraphOp(session, { file: "src/routes/records.tsx", name: "records", line: 16, direction: "forward" });
    expect(records.outcome).not.toBe("unsupported");
    const anchor = records.nodes.find((node) => node.kind === "anchor")!;
    expect(anchor.label).toBe("records");
    expect(anchor.span.startLine).toBe(16);
    expect(anchor.span.startColumn).toBeGreaterThan(records.anchor.span.startColumn - 1);
    expect(["resource-input", "alias", "call"]).toContain(anchor.elementKind);
    const viewer = anchorGraphOp(session, { file: "src/components/ViewerCard.tsx", name: "ViewerCard", line: 3, direction: "both" });
    expect(viewer.outcome).not.toBe("unsupported");
    const component = viewer.nodes.find((node) => node.kind === "anchor")!;
    expect(component).toMatchObject({ label: "ViewerCard", elementKind: "component-definition" });
    // A component by name: its parameter is what comes in, its return and its occurrences are where it goes.
    const param = viewer.nodes.find((node) => node.elementKind === "parameter")!;
    expect(param).toMatchObject({ side: "up", label: "props" });
    expect(viewer.edges.some((edge) => edge.kind === "parameter" && edge.source === param.id && edge.target === component.id)).toBe(true);
    expect(viewer.nodes.some((node) => node.side === "up" && node.file === "src/routes/records.tsx")).toBe(true);
    expect(viewer.edges.some((edge) => edge.kind === "returns" && edge.source === component.id)).toBe(true);
    const use = viewer.nodes.find((node) => node.note === "rendered here")!;
    expect(use).toMatchObject({ side: "down", file: "src/routes/records.tsx" });
    expect(viewer.edges.some((edge) => edge.kind === "used-by" && edge.target === use.id)).toBe(true);
  }, 120_000);

  it("anchors a JSX tag by name at the occurrence it opens", () => {
    const lines = fs.readFileSync(path.join(solidRoute, "src/routes/records.tsx"), "utf8").split("\n");
    const line = lines.findIndex((text) => text.includes("<RouteFrame")) + 1;
    const graph = anchorGraphOp(session, { file: "src/routes/records.tsx", name: "RouteFrame", line, direction: "backward" });
    expect(graph.outcome).not.toBe("unsupported");
    expect(graph.nodes.find((node) => node.kind === "anchor")).toMatchObject({ label: "RouteFrame" });
    expect(["jsx-occurrence", "component-occurrence"]).toContain(graph.anchor.elementId ? graph.nodes.find((node) => node.kind === "anchor")!.elementKind : null);
  }, 120_000);
});
