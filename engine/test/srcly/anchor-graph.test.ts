import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnchorGraphResult, AnchorNode } from "../../src/srcly/contracts/anchor-graph";
import { ANCHOR_LIMITS } from "../../src/srcly/anchor-slice";
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

  it("enters a helper through its binding, through the library method its body calls, and back out at its own call's slot", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/two-call-helper.tsx", "props.a", "shout(props.a)"), direction: "forward" });
    // It lands with no stop; what `toUpperCase` does is the standard library's, modelled: ok.
    expect(graph.outcome).toBe("ok");
    expect(boxes(graph, "boundary")).toEqual([]);
    expect(boxes(graph, "frontier")).toEqual([]);
    // `value.toUpperCase()` has no body to enter: the call consumes its receiver, modelled as the standard library.
    const upper = boxes(graph).find((node) => node.elementKind === "call" && node.label === "value.toUpperCase()")!;
    expect(graph.edges.find((edge) => edge.target === upper.id)).toMatchObject({ status: "proven", proof: [expect.anything(), expect.objectContaining({ kind: "standard-library" })] });
    // `shout` has a body the walk enters: into it and back out assumes nothing either.
    expect(graph.edges.filter((edge) => edge.status !== "proven")).toEqual([]);
    expect(graph.edges.filter((edge) => edge.kind === "argument-binding" || edge.kind === "return-value")).toMatchObject([{ status: "proven" }, { status: "proven" }]);
    // Paired with its own call (T13): only line 8's slot, never line 9's.
    expect(boxes(graph, "terminal").map((node) => node.line)).toEqual([8]);
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

  it("takes a component's own parameters and returns, not those of the helpers nested inside it", () => {
    const graph = anchorGraphOp(session, { file: "src/nested-helpers.tsx", name: "Rail", line: 5, direction: "both" });
    const anchor = graph.nodes.find((node) => node.kind === "anchor")!;
    const params = graph.edges.filter((edge) => edge.kind === "parameter" && edge.target === anchor.id).map((edge) => graph.nodes.find((node) => node.id === edge.source)!);
    expect(labels(params)).toEqual(["props"]);
    const returns = graph.edges.filter((edge) => edge.kind === "returns").map((edge) => graph.nodes.find((node) => node.id === edge.target)!);
    // `widthOf`'s two returns are its own; only the JSX return is Rail's.
    expect(returns.map((node) => node.line)).toEqual([11]);
    // Where it is rendered is where its value ends: the occurrence is drawn, its body is not walked again.
    const use = graph.nodes.find((node) => node.note === "rendered here")!;
    expect(use).toMatchObject({ side: "down", line: 19 });
    // Nothing walks into Rail's body from its render site, and every read lands: `props.size` inside `tall`, and `label="toc"`.
    expect(boxes(graph, "frontier")).toEqual([]);
    expect(graph.outcome).toBe("ok");
  });

  it("never binds a read that only looks like the prop: a shadowed `props`, another object's field", () => {
    const tier1 = session.tier1();
    const provider = tier1.provider();
    const reads = provider.facts.fileCandidates("src/closure-props.tsx").filter((fact) => fact.kind === "field-read" && fact.label === "tone");
    const bound = (id: string) => provider.getRelations(id, "backward").some((relation) => relation.kind === "component-prop-binding");
    // Chip's own `props.tone`, the shadowed parameter's, and `other.tone`: only the first is bound.
    expect(reads.map((read) => [read.location.span.startLine, bound(read.id)])).toEqual([[5, true], [10, false], [13, false]]);
  });

  it("folds the gaps of one element limit into one frontier that names what it did not follow", () => {
    const graph = anchorGraphOp(session, { file: "src/wide-walk.tsx", name: "props", line: 5, direction: "forward" });
    const stops = boxes(graph, "frontier");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ reason: "budget-exhausted", side: "down" });
    expect(stops[0].label).toMatch(/^\d+ places not followed$/);
    expect(stops[0].note).toMatch(new RegExp(`^The walk stops at ${ANCHOR_LIMITS.maxElements} elements; it did not follow (props\\.)?n`));
    // A limit hit is the budget exhausted, whichever limit it was.
    expect(graph.coverage.budget.exhausted).toBe(true);
    expect(graph.outcome).toBe("partial");
  });

  it("follows a value through a big helper without spending its limits on everything the helper's body contains", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/big-helper.tsx", "props.title"), direction: "forward" });
    expect(graph.nodes.filter((node) => node.reason === "budget-exhausted")).toEqual([]);
    expect(graph.coverage.budget.exhausted).toBe(false);
    // Into `shout`, out through its return, to the heading's slot; none of its 220 `noise.push` lines.
    expect(graph.nodes.some((node) => node.label === "text")).toBe(true);
    expect(boxes(graph, "terminal").length).toBeGreaterThan(0);
    expect(graph.nodes.some((node) => /noise/.test(node.label))).toBe(false);
    expect(graph.coverage.elements).toBeLessThan(40);
  });

  it("draws every use of a hub but walks only its first ones, folding the rest into one frontier", () => {
    const graph = anchorGraphOp(session, { file: "src/many-uses.ts", name: "label", line: 4, direction: "forward" });
    expect(graph.nodes.filter((node) => node.note === "called here")).toHaveLength(40);
    const stops = boxes(graph, "frontier").filter((node) => node.reason === "budget-exhausted");
    expect(stops.map((node) => node.label)).toEqual([`${40 - ANCHOR_LIMITS.maxWalkedUses} uses not followed`]);
    expect(stops[0].note).toMatch(/did not follow label\(32\)/);
    expect(graph.coverage.budget.exhausted).toBe(true);
    // A declaration used in fewer places walks every use: no such frontier.
    const few = anchorGraphOp(session, { file: "src/function-field-reads.ts", name: "describeItem", line: 5, direction: "forward" });
    expect(boxes(few, "frontier").filter((node) => node.reason === "budget-exhausted")).toEqual([]);
  });

  it("names an inline function's frame by where it is written, never \"(anonymous)\"", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/match-callbacks.tsx", "props.doc", "<Match when={props.doc}>"), direction: "forward" });
    const frames = graph.nodes.filter((node) => node.kind === "scope").map((node) => node.label);
    expect(frames).toContain("<Match> child");
    expect(frames).toContain("<Show> child");
    expect(frames.some((label) => label.includes("(anonymous)"))).toBe(false);
  });

  it("hands a library call's receiver to its callback's parameter alone (the rest is annotated in the fixture)", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/library-callbacks.tsx", "props.items", "props.items.reduce"), direction: "forward" });
    const item = graph.nodes.find((node) => node.elementKind === "parameter" && node.label === "item")!;
    expect(graph.edges.find((edge) => edge.kind === "callback-parameter" && edge.target === item.id)).toMatchObject({ status: "proven" });
    // Only the receiver is handed in: never the call's other argument (`0`).
    const handed = graph.edges.filter((edge) => edge.kind === "callback-parameter");
    expect(handed.map((edge) => graph.nodes.find((node) => node.id === edge.source)?.label)).toEqual(["props.items"]);
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

describe("anchorGraph by element id (T20)", () => {
  it("anchors at a drawn box's own element, so its graph shares ids with the trace that drew the box", () => {
    const session = sessionFor(solidRoute);
    const first = anchorGraphOp(session, { file: "src/components/ViewerCard.tsx", name: "ViewerCard", line: 3, direction: "backward" });
    const box = first.nodes.find((n) => n.kind !== "anchor" && n.kind !== "scope" && n.file === "src/routes/records.tsx")!;
    const second = anchorGraphOp(session, { file: box.file, elementId: box.id, direction: "backward" });
    expect(second.anchor.elementId).toBe(box.id);
    expect(second.nodes.find((n) => n.kind === "anchor")?.id).toBe(box.id);
    const firstIds = new Set(first.nodes.map((n) => n.id));
    expect(second.nodes.filter((n) => firstIds.has(n.id)).length).toBeGreaterThan(1);
    expect(() => anchorGraphOp(session, { file: box.file, elementId: "program-element:nope", direction: "both" })).toThrowError(expect.objectContaining({ code: "not-found" }));
  }, 60_000);
});

describe("anchorGraph symbols on symbol-graph", () => {
  const root = fileURLToPath(new URL("../../examples/symbol-graph", import.meta.url));
  const session = sessionFor(root);
  const graph = anchorGraphOp(session, { file: "src/routes/notes/[id].tsx", name: "NotePage", line: 6, direction: "forward" });
  const of = (label: string, elementKind?: string) => graph.nodes.filter((n) => n.label === label && (!elementKind || n.elementKind === elementKind));

  it("names the local binding every read of a value reads: as is, called as an accessor, through a field, and as a Match test", () => {
    const note = of("[note]")[0].symbol;
    expect(note).toMatch(/^note@src\/routes\/notes\/\[id\]\.tsx:\d+$/);
    for (const n of [...of("note", "value"), ...of("note()", "call"), ...of("note()", "dom-terminal")]) expect(n.symbol).toBe(note);
    for (const n of of("error", "field-read")) expect(n).toMatchObject({ symbol: note, field: "error" });
    // A prop handed on reads the accessor it is given.
    expect(of("note={n()}")[0].symbol).toBe(of("n", "parameter")[0].symbol);
  }, 60_000);

  it("names the state a framework call made, and the operation a step performs", () => {
    expect(of("[note]")[0].state).toBe("resource");
    expect(graph.nodes.find((n) => n.symbol?.startsWith("draft@"))?.state).toBe("store");
    expect(graph.nodes.find((n) => n.symbol?.startsWith("label@"))?.state).toBe("memo");
    expect(of("n", "parameter")[0].state).toBeNull();
    expect(graph.nodes.some((n) => n.operation === "object-pack")).toBe(true);
  }, 60_000);

  it("names each frame's role: component, fetcher, server code, handler, helper and callback", () => {
    const role = (g: AnchorGraphResult, label: string) => g.nodes.filter((n) => n.kind === "scope" && n.label === label).map((n) => n.role);
    expect(role(graph, "NotePage")).toEqual(["component"]);
    expect(role(graph, "createResource callback").sort()).toEqual(["callback", "fetcher"]);
    expect(role(graph, "fetchNote")).toEqual(["server"]);
    // Plain TS helpers, each traced from itself so no walk limit decides whether it is drawn.
    const helper = anchorGraphOp(session, { file: "src/lib/notes.ts", name: "formatTags", line: 15, direction: "forward" });
    expect(role(helper, "formatTags")).toEqual(["helper"]);
    expect(role(helper, "tags.map callback")).toEqual(["callback"]);
    const view = anchorGraphOp(session, { file: "src/components/NoteView.tsx", name: "NoteView", line: 6, direction: "forward" });
    expect(role(view, "NoteView")).toEqual(["component"]);
    expect(role(view, "save")).toEqual(["handler"]);
  }, 60_000);

  it("links each drawn function to the drawn functions it calls and the outer bindings it reads", () => {
    const said = (g: AnchorGraphResult) => {
      const label = new Map(g.nodes.map((n) => [n.id, n.label]));
      return g.links.map((l) => `${l.kind} ${label.get(l.source)} > ${label.get(l.target)}`);
    };
    expect(said(graph)).toEqual(expect.arrayContaining(["reads createResource callback > params"]));
    // Traced from the server read itself, so no walk limit decides which helpers are drawn.
    const server = anchorGraphOp(session, { file: "src/server/notes.ts", name: "fetchNote", line: 4, direction: "forward" });
    expect(said(server)).toEqual(expect.arrayContaining(["calls fetchNote > toDetail", "calls toDetail > parseTags"]));
    const view = anchorGraphOp(session, { file: "src/components/NoteView.tsx", name: "NoteView", line: 6, direction: "forward" });
    expect(said(view)).toEqual(expect.arrayContaining(["calls save > saveTitle"]));
    for (const g of [graph, server, view]) {
      const ids = new Set(g.nodes.map((n) => n.id));
      for (const l of g.links) expect(ids.has(l.source) && ids.has(l.target)).toBe(true);
    }
  }, 60_000);

  it("gives no binding to a call that is not an accessor, a render slot, or an origin, and keeps two `id`s apart", () => {
    expect(of("fetchNote(id)")[0].symbol).toBeNull();
    expect(of("n().title", "render-terminal")[0].symbol).toBeNull();
    for (const n of graph.nodes.filter((x) => x.kind === "origin" || x.kind === "scope")) expect(n.symbol).toBeNull();
    expect(new Set(of("id", "parameter").map((n) => n.symbol)).size).toBe(of("id", "parameter").length);
  }, 60_000);
});
