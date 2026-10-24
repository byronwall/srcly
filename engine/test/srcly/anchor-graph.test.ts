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

  it("keeps two calls of one helper apart: each argument lands at its own call's slot (T13)", () => {
    const a = anchorGraphOp(session, { ...find(basics, "src/two-call-identity-helper.tsx", "props.a", "id(props.a)"), direction: "forward" });
    expect(a.outcome).toBe("ok");
    expect(boxes(a, "terminal").map((node) => [node.label, node.line])).toEqual([["id(props.a)", 11]]);
    expect(boxes(a, "boundary")).toEqual([]);
    expect(a.nodes.some((node) => node.line === 12 && node.kind !== "scope")).toBe(false);
    const b = anchorGraphOp(session, { ...find(basics, "src/two-call-identity-helper.tsx", "props.b", "id(props.b)"), direction: "forward" });
    expect(boxes(b, "terminal").map((node) => [node.label, node.line])).toEqual([["id(props.b)", 12]]);
    expect(b.nodes.some((node) => node.line === 11 && node.kind !== "scope")).toBe(false);
  });

  it("still stops at a boundary when the walk starts inside the helper and leaves through its return (R7)", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/two-call-identity-helper.tsx", "value", "return value;"), direction: "forward" });
    expect(graph.outcome).toBe("partial");
    const boundary = boxes(graph, "boundary");
    expect(boundary.map((node) => node.line).sort()).toEqual([11, 12]);
    expect(boundary.every((node) => node.reason === "unproven-handoff" && /2 call sites/.test(node.note ?? ""))).toBe(true);
    expect(graph.counts.terminals).toBe(0);
  });

  it("never lets an argument the callee does not return reach the call's result (T13)", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/returns-other-argument.tsx", "props.first", "pick(props.first"), direction: "forward" });
    expect(graph.outcome).toBe("partial");
    expect(graph.counts.terminals).toBe(0);
    expect(boxes(graph, "frontier").map((node) => [node.reason, node.line])).toEqual([["disconnected", 4]]);
  });

  it("enters a helper through its binding and ends where the body hands the value to external code", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/two-call-helper.tsx", "props.a", "shout(props.a)"), direction: "forward" });
    expect(graph.outcome).toBe("partial");
    expect(boxes(graph, "boundary")).toEqual([]);
    expect(boxes(graph, "frontier").map((node) => [node.reason, node.line])).toEqual([["disconnected", 2]]);
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

  it("finds a destructured parameter's reads through the engine's relations, and reads partial with no caller", () => {
    const graph = anchorGraphOp(session, { file: "src/destructured-props.tsx", name: "Badge", line: 5, direction: "both" });
    const param = graph.nodes.find((node) => node.elementKind === "parameter")!;
    expect(param).toMatchObject({ label: "viewer", side: "up" });
    const read = graph.edges.find((edge) => edge.kind === "prop-read")!;
    expect(read).toMatchObject({ target: param.id, label: "name", status: "proven" });
    expect(read.proof.length).toBe(1);
    expect(graph.edges.filter((edge) => edge.kind === "parameter").every((edge) => edge.status === "structural")).toBe(true);
    // Nothing renders Badge, so where `viewer` comes from is unknown: not `ok`.
    expect(graph.outcome).toBe("partial");
  });

  it("reads partial when one of a component's prop walks stops short of an origin", () => {
    const graph = anchorGraphOp(session, { file: "src/half-landed.tsx", name: "Pair", line: 7, direction: "both" });
    expect(graph.outcome).toBe("partial");
    expect(boxes(graph, "origin").length).toBe(1);
    const reads = graph.edges.filter((edge) => edge.kind === "prop-read").map((edge) => edge.label).sort();
    expect(reads).toEqual(["count", "title"]);
  });

  it("draws a dead end where a value stops short of a terminal: a local nothing reads, an untyped callback", () => {
    const unused = anchorGraphOp(session, { ...find(basics, "src/dead-end.tsx", "props.label", "unused ="), direction: "forward" });
    expect(unused.outcome).toBe("partial");
    const [stop] = boxes(unused, "frontier");
    expect(stop).toMatchObject({ reason: "disconnected", status: "partial", side: "down", elementKind: "alias", label: "dead end · nothing continues from here", line: 6 });
    expect(unused.counts).toMatchObject({ terminals: 0, frontiers: 1 });
    const callback = anchorGraphOp(session, { ...find(basics, "src/dead-end.tsx", "props.onPick"), direction: "forward" });
    expect(callback.outcome).toBe("partial");
    expect(boxes(callback, "frontier").map((node) => [node.reason, node.elementKind, node.line])).toEqual([["disconnected", "alias", 8]]);
  });

  it("ends a backward walk at a literal with no frontier: that is where the value begins", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/literal-start.tsx", "label", "{label}"), direction: "backward" });
    expect(graph.outcome).toBe("ok");
    expect(graph.counts).toMatchObject({ frontiers: 0, origins: 0 });
    expect(boxes(graph).some((node) => node.label === "\"x\"")).toBe(true);
  });

  it("refuses a direction it does not know and a name without a line", () => {
    expect(() => anchorGraphOp(session, { ...find(basics, "src/direct-property.tsx", "props.item.title"), direction: "sideways" })).toThrow(/direction/);
    expect(() => anchorGraphOp(session, { file: "src/direct-property.tsx", name: "props" })).toThrow(/line/);
  });
});

describe("anchor-graph fixtures never claim proof they do not carry", () => {
  const fixtures = fs.readdirSync(fileURLToPath(new URL("./__fixtures__", import.meta.url))).filter((name) => name.endsWith(".anchor-graph.json"));
  it.each(fixtures)("%s has no proven edge with empty proof", (name) => {
    const graph = JSON.parse(fs.readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as AnchorGraphResult;
    for (const edge of graph.edges) expect(edge.status === "proven" && edge.proof.length === 0, `${edge.kind} ${edge.id}`).toBe(false);
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
    // The parameter and return links are found by syntax: structural, never proven.
    expect(viewer.edges.find((edge) => edge.kind === "parameter" && edge.source === param.id && edge.target === component.id)).toMatchObject({ status: "structural", proof: [] });
    expect(viewer.edges.filter((edge) => edge.kind === "returns").every((edge) => edge.status === "structural")).toBe(true);
    // Its prop reads come from the engine's relations, each with that relation's proof.
    const reads = viewer.edges.filter((edge) => edge.kind === "prop-read");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((edge) => edge.target === param.id && edge.status === "proven" && edge.proof.length === 1 && edge.label === "viewer")).toBe(true);
    // Both prop walks reach the viewer resource, so the component reads ok.
    expect(viewer.outcome).toBe("ok");
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
