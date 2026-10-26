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

  it("leaves a helper through every call when the walk starts inside it: each call site is a true destination", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/two-call-identity-helper.tsx", "value", "return value;"), direction: "forward" });
    expect(graph.outcome).toBe("ok");
    expect(boxes(graph, "boundary")).toEqual([]);
    expect(boxes(graph, "terminal").map((node) => node.line).sort()).toEqual([11, 12]);
    // From the parameter up, every caller is a true source.
    const up = anchorGraphOp(session, { ...find(basics, "src/two-call-identity-helper.tsx", "value", "function id"), direction: "backward" });
    expect(boxes(up, "boundary")).toEqual([]);
    expect(boxes(up).filter((node) => node.elementKind === "field-read").map((node) => node.label).sort()).toEqual(["a", "b"]);
  });

  it("never leaves a helper at another call than the one it entered by, backward either (T13)", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/two-call-identity-helper.tsx", "id(props.b)", "<em>"), direction: "backward" });
    expect(boxes(graph, "boundary")).toEqual([]);
    expect(boxes(graph).filter((node) => node.elementKind === "field-read").map((node) => node.label)).toEqual(["b"]);
  });

  it("never lets an argument the callee does not return reach the call's result (T13)", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/returns-other-argument.tsx", "props.first", "pick(props.first"), direction: "forward" });
    expect(graph.outcome).toBe("partial");
    expect(graph.counts.terminals).toBe(0);
    expect(boxes(graph, "frontier").map((node) => [node.reason, node.line])).toEqual([["disconnected", 4]]);
  });

  it("enters a helper through its binding, through the library method its body calls, and back out at its own call's slot", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/two-call-helper.tsx", "props.a", "shout(props.a)"), direction: "forward" });
    expect(graph.outcome).toBe("ok");
    expect(boxes(graph, "boundary")).toEqual([]);
    // `value.toUpperCase()` has no body to enter: the call consumes its receiver.
    expect(boxes(graph).some((node) => node.elementKind === "call" && node.label === "value.toUpperCase()")).toBe(true);
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
    expect(stop).toMatchObject({ reason: "disconnected", status: "partial", side: "down", elementKind: "alias", line: 6 });
    // Named by where it stopped, as the ledger's boundary row is; the sentence is its note.
    expect(stop).toMatchObject({ label: "unused", note: "dead end · nothing continues from here" });
    expect(unused.counts).toMatchObject({ terminals: 0, frontiers: 1 });
    const callback = anchorGraphOp(session, { ...find(basics, "src/dead-end.tsx", "props.onPick"), direction: "forward" });
    expect(callback.outcome).toBe("partial");
    // The callback is consumed by its call, whose body the engine cannot see: the dead end is the call.
    expect(boxes(callback, "frontier").map((node) => [node.reason, node.elementKind, node.line])).toEqual([["disconnected", "call", 9]]);
  });

  it("carries a receiver through a library method, and begins a value at a global the program does not declare", () => {
    const trimmed = anchorGraphOp(session, { ...find(basics, "src/callee-consumed.tsx", "props.title", "props.title.trim()"), direction: "forward" });
    expect(trimmed.outcome).toBe("ok");
    expect(boxes(trimmed, "terminal")).toMatchObject([{ elementKind: "render-terminal", line: 18 }]);
    const json = anchorGraphOp(session, { ...find(basics, "src/callee-consumed.tsx", "JSON.stringify(props.data)", "<code>"), direction: "backward" });
    expect(boxes(json).some((node) => node.label === "JSON")).toBe(true);
    // `JSON` is where its value begins, never a stop; only `props`, which no caller reaches, is.
    expect(boxes(json, "frontier").map((node) => node.label)).toEqual(["props"]);
    // An argument stays at its own call: a callee with no body has no call sites to pair, and is no handoff to prove.
    expect(boxes(json, "boundary")).toEqual([]);
  });

  it("enters a first-party method through `this`: the receiver is bound like an argument", () => {
    const box = anchorGraphOp(session, { ...find(basics, "src/callee-consumed.tsx", "box", "<b>{box"), direction: "forward" });
    expect(box.outcome).toBe("ok");
    expect(boxes(box).some((node) => node.elementKind === "parameter" && node.label === "this")).toBe(true);
    expect(boxes(box, "terminal")).toMatchObject([{ elementKind: "render-terminal", line: 20 }]);
  });

  it("pairs a method's receiver with its own call: one receiver never comes out at another's call (T13)", () => {
    const first = anchorGraphOp(session, { ...find(basics, "src/this-methods.tsx", "first", "{first.read"), direction: "forward" });
    expect(first.outcome).toBe("ok");
    expect(boxes(first, "terminal").map((node) => node.line)).toEqual([17]);
    const back = anchorGraphOp(session, { ...find(basics, "src/this-methods.tsx", "second.read()", "{second.read"), direction: "backward" });
    expect(boxes(back).some((node) => node.label === "first" || node.label === "counter")).toBe(false);
    expect(boxes(back).some((node) => node.elementKind === "field-read" && node.label === "other")).toBe(true);
  });

  it("lands a value the code ends in place: a branch test is a terminal, not a dead end", () => {
    const mode = anchorGraphOp(session, { ...find(basics, "src/ends-in-place.tsx", "props.mode", "if (props.mode"), direction: "forward" });
    expect(mode.outcome).toBe("ok");
    expect(boxes(mode, "terminal")).toMatchObject([{ elementKind: "derived", line: 7, note: "ends here · decides a branch" }]);
    expect(mode.counts.frontiers).toBe(0);
  });

  it("keeps a value written into another object's field at a dead end: a write target ends nothing it is assigned", () => {
    const note = anchorGraphOp(session, { ...find(basics, "src/ends-in-place.tsx", "props.note", "state.note ="), direction: "forward" });
    expect(note.outcome).toBe("partial");
    expect(boxes(note, "frontier").map((node) => [node.reason, node.elementKind, node.line])).toEqual([["disconnected", "field-read", 8]]);
  });

  it("carries operands into an operator's value: arithmetic and a template reach the slot", () => {
    const count = anchorGraphOp(session, { ...find(basics, "src/derived-operands.tsx", "props.count", "props.count + 1"), direction: "forward" });
    expect(count.outcome).toBe("ok");
    expect(boxes(count).filter((node) => node.elementKind === "derived").map((node) => node.label)).toEqual(["props.count + 1", "`${props.count + 1} items`"]);
    expect(boxes(count, "terminal")).toMatchObject([{ elementKind: "render-terminal", line: 6 }]);
  });

  it("reads a computed key's receiver as a partial read of some field, not a stop", () => {
    const labels = anchorGraphOp(session, { ...find(basics, "src/computed-index.tsx", "props.labels", "const label"), direction: "forward" });
    expect(labels.outcome).toBe("ok");
    expect(labels.counts.frontiers).toBe(0);
    expect(boxes(labels).find((node) => node.elementKind === "index-read")).toMatchObject({ status: "partial" });
    expect(boxes(labels, "terminal")).toMatchObject([{ elementKind: "render-terminal", line: 8 }]);
  });

  it("ends a computed key at the index it picks: the key is never the value read", () => {
    const key = anchorGraphOp(session, { ...find(basics, "src/computed-index.tsx", "props.key", "const key"), direction: "forward" });
    expect(boxes(key, "terminal")).toMatchObject([{ line: 7, note: "ends here · picks a field" }]);
    expect(boxes(key).some((node) => node.elementKind === "render-terminal")).toBe(false);
  });

  it("lets a read see every assignment that can reach it", () => {
    for (const [text, marker] of [["props.first", "label = props.first"], ["props.second", "label = props.second"]]) {
      const graph = anchorGraphOp(session, { ...find(basics, "src/reassigned.tsx", text, marker), direction: "forward" });
      expect(graph.outcome, text).toBe("ok");
      expect(boxes(graph, "terminal")).toMatchObject([{ elementKind: "render-terminal", line: 10 }]);
      // One of the bindings that can reach the read: the hand-off is partial.
      expect(graph.edges.some((edge) => edge.kind === "references" && edge.status === "partial")).toBe(true);
    }
  });

  it("lets a straight-line assignment overwrite the binding before it: the stale value never reaches the read", () => {
    const stale = anchorGraphOp(session, { ...find(basics, "src/reassigned.tsx", "props.stale", "let value"), direction: "forward" });
    expect(stale.counts.terminals).toBe(0);
    expect(boxes(stale, "frontier").map((node) => [node.reason, node.label, node.line])).toEqual([["disconnected", "value", 14]]);
    const fresh = anchorGraphOp(session, { ...find(basics, "src/reassigned.tsx", "props.fresh", "value = props.fresh"), direction: "forward" });
    expect(fresh.outcome).toBe("ok");
    expect(fresh.edges.every((edge) => edge.status === "proven")).toBe(true);
  });

  it("packs array elements and spreads, binds a `for…of` variable to each element, and hands a JSX spread to its element", () => {
    for (const text of ["props.first", "props.rest"]) {
      const graph = anchorGraphOp(session, { ...find(basics, "src/collections.tsx", text, "const all"), direction: "forward" });
      expect(graph.outcome, text).toBe("ok");
      expect(boxes(graph).some((node) => node.elementKind === "alias" && node.label === "item")).toBe(true);
      expect(boxes(graph, "terminal")).toMatchObject([{ elementKind: "render-terminal", line: 9 }]);
    }
    const attrs = anchorGraphOp(session, { ...find(basics, "src/collections.tsx", "props.attrs", "<b {"), direction: "forward" });
    expect(attrs.outcome).toBe("ok");
    expect(attrs.counts.terminals).toBe(1);
  });

  it("renders a component a factory or an alias makes at each JSX tag that names it", () => {
    const badge = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: "Badge", line: 16, direction: "forward" });
    expect(badge.outcome).toBe("ok");
    expect(boxes(badge, "terminal")).toMatchObject([{ elementKind: "component-occurrence", label: "Badge", line: 27 }]);
    // `Plain` is `Card` under another name: its tag binds Card's props, so `props.name` reaches Card's slot.
    const plain = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: "Plain", line: 15, direction: "forward" });
    expect(boxes(plain, "terminal")).toMatchObject([{ elementKind: "component-occurrence", line: 26 }]);
    const name = anchorGraphOp(session, { ...find(basics, "src/component-aliases.tsx", "props.name", "<Plain"), direction: "forward" });
    expect(name.outcome).toBe("ok");
    expect(boxes(name, "terminal").some((node) => node.elementKind === "render-terminal" && node.line === 12)).toBe(true);
    // A library factory's component: its prop and child are handed to the occurrence, never a DOM attribute.
    const tone = anchorGraphOp(session, { ...find(basics, "src/component-aliases.tsx", "props.tone", "<Badge title"), direction: "forward" });
    expect(boxes(tone, "terminal").map((node) => [node.elementKind, node.line])).toEqual([["component-occurrence", 27]]);
    // A shorthand `{ point }` packs the value it names.
    const point = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: "point", line: 22, direction: "forward" });
    expect(point.outcome).toBe("ok");
    expect(boxes(point, "terminal")).toMatchObject([{ elementKind: "render-terminal", line: 28 }]);
  });

  it("never joins two values of one factory, and keeps a value nothing renders at a dead end", () => {
    const pill = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: "Pill", line: 17, direction: "forward" });
    expect(boxes(pill, "terminal").map((node) => node.line)).toEqual([34]);
    const badge = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: "Badge", line: 16, direction: "forward" });
    expect(badge.nodes.some((node) => node.line === 34)).toBe(false);
    for (const [label, line] of [["Unused", 18], ["labels", 19]] as const) {
      const graph = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: label, line, direction: "forward" });
      expect(graph.outcome, label).toBe("partial");
      expect(boxes(graph, "frontier").map((node) => [node.reason, node.label])).toEqual([["disconnected", label]]);
    }
    // A shorthand packs the binding its name resolves to: a shadowed outer `point` never reaches the inner pack.
    const outer = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: "point", line: 40, direction: "forward" });
    expect(boxes(outer, "terminal").map((node) => node.line)).toEqual([47]);
    const inner = anchorGraphOp(session, { file: "src/component-aliases.tsx", name: "point", line: 42, direction: "forward" });
    expect(inner.nodes.some((node) => node.line === 47)).toBe(false);
  });

  it("never binds a `for…in` key to the values it iterates", () => {
    const table = anchorGraphOp(session, { ...find(basics, "src/collections.tsx", "props.table", "for (const key"), direction: "forward" });
    expect(table.counts.terminals).toBe(0);
    expect(boxes(table, "frontier").map((node) => [node.reason, node.label])).toEqual([["disconnected", "table"]]);
  });

  it("carries a state pair's setter argument and initial value to its getter's reads, as a framework-modelled partial edge", () => {
    for (const [file, text, marker, line] of [
      ["src/state-pairs.tsx", "props.next", "setName(props.next)", 16],
      ["src/state-pairs.tsx", "props.start", "createSignal(props.start)", 16],
      ["src/state-pairs.tsx", "props.title", "state.setDoc", 29],
      ["src/react-state.tsx", "props.picked", "setLabel(props.picked)", 9],
      ["src/react-state.tsx", "props.initial", "useState(props.initial)", 9],
    ] as const) {
      const graph = anchorGraphOp(session, { ...find(basics, file, text, marker), direction: "forward" });
      expect(graph.outcome, text).toBe("ok");
      expect(boxes(graph, "terminal").filter((node) => node.elementKind === "render-terminal").map((node) => node.line), text).toEqual([line]);
      expect(graph.edges.some((edge) => edge.status === "partial" && edge.proof[0]?.kind === "framework-state"), text).toBe(true);
    }
  });

  it("never mixes two state pairs: one setter's argument never reaches another getter, forward or backward", () => {
    const other = anchorGraphOp(session, { ...find(basics, "src/state-pairs.tsx", "props.other", "setCount(props.other)"), direction: "forward" });
    expect(boxes(other, "terminal").map((node) => node.line)).toEqual([17]);
    const name = anchorGraphOp(session, { ...find(basics, "src/state-pairs.tsx", "name()", "<span>{name()"), direction: "backward" });
    expect(boxes(name).some((node) => node.label === "other" || node.label === "count")).toBe(false);
    expect(boxes(name).filter((node) => node.elementKind === "field-read").map((node) => node.label).sort()).toEqual(["next", "start"]);
  });

  it("keeps a derived value nothing reads at a dead end", () => {
    const limit = anchorGraphOp(session, { ...find(basics, "src/derived-operands.tsx", "props.limit", "tooMany ="), direction: "forward" });
    expect(limit.outcome).toBe("partial");
    expect(boxes(limit, "frontier").map((node) => [node.reason, node.label, node.line])).toEqual([["disconnected", "tooMany", 5]]);
  });

  it("returns an arrow function's expression body to its own call, and keeps two calls apart (T13)", () => {
    const a = anchorGraphOp(session, { ...find(basics, "src/arrow-body-return.tsx", "props.a", "shout(props.a)"), direction: "forward" });
    expect(a.outcome).toBe("ok");
    expect(boxes(a).some((node) => node.elementKind === "return" && node.line === 4)).toBe(true);
    expect(boxes(a, "terminal").map((node) => node.line)).toEqual([9]);
    const b = anchorGraphOp(session, { ...find(basics, "src/arrow-body-return.tsx", "props.b", "shout(props.b)"), direction: "forward" });
    expect(boxes(b, "terminal").map((node) => node.line)).toEqual([10]);
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

  it("binds a prop read inside a closure, and a string attribute, to the caller in another file", () => {
    const graph = anchorGraphOp(session, { file: "src/closure-props.tsx", name: "Chip", line: 4, direction: "backward" });
    const literals = boxes(graph).filter((node) => node.elementKind === "literal").map((node) => node.label);
    // `tone="warm"` (read in an arrow) and `count={2}` (read in a nested function) both reach their literal.
    expect(literals).toEqual(expect.arrayContaining(["\"warm\"", "2"]));
  });

  it("never binds a read that only looks like the prop: a shadowed `props`, another object's field", () => {
    const tier1 = session.tier1();
    const provider = tier1.provider();
    const reads = provider.facts.fileCandidates("src/closure-props.tsx").filter((fact) => fact.kind === "field-read" && fact.label === "tone");
    const bound = (id: string) => provider.getRelations(id, "backward").some((relation) => relation.kind === "component-prop-binding");
    // Chip's own `props.tone`, the shadowed parameter's, and `other.tone`: only the first is bound.
    expect(reads.map((read) => [read.location.span.startLine, bound(read.id)])).toEqual([[5, true], [10, false], [13, false]]);
  });

  it("lands a plain function's field reads through the argument its caller passes, with no per-read frontier", () => {
    const graph = anchorGraphOp(session, { file: "src/function-field-reads.ts", name: "describeItem", line: 5, direction: "backward" });
    // The reads are drawn, joined to the parameter they read.
    const reads = graph.edges.filter((edge) => edge.kind === "prop-read").map((edge) => graph.nodes.find((node) => node.id === edge.source)!.label);
    expect(reads.length).toBeGreaterThan(0);
    expect(boxes(graph, "frontier").filter((node) => node.reason === "unbound-read")).toEqual([]);
    expect(graph.outcome).toBe("ok");
  });

  it("stops a prop read no binding reaches at a frontier, instead of landing it through another prop", () => {
    // `note` is never passed; `tone` and `count` are, and start at literals. The shared `props` must not carry their landing to note.
    const graph = anchorGraphOp(session, { file: "src/closure-props.tsx", name: "Chip", line: 4, direction: "backward" });
    expect(graph.outcome).toBe("partial");
    const stops = boxes(graph, "frontier");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ label: "note", reason: "unbound-read", status: "partial", line: 15 });
    expect(stops[0].note).toMatch(/not traced/);
    const read = graph.nodes.find((node) => node.elementKind === "field-read" && node.label === "note")!;
    expect(graph.edges.some((edge) => edge.kind === "gap" && edge.source === stops[0].id && edge.target === read.id)).toBe(true);
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

  it("keeps a discarded library call's argument in its receiver, as an assumption", () => {
    const pushed = anchorGraphOp(session, { ...find(basics, "src/external-calls.tsx", "props.tags[0]"), direction: "forward" });
    expect(pushed.outcome).toBe("ok");
    const names = pushed.nodes.find((node) => node.elementKind === "alias" && node.label === "names")!;
    const write = pushed.edges.find((edge) => edge.target === names.id)!;
    expect(write).toMatchObject({ kind: "references", status: "partial" });
    expect(write.proof[0]).toMatchObject({ kind: "external-call" });
    expect(boxes(pushed, "terminal")).toMatchObject([{ label: "names", line: 15 }]);
  });

  it("never writes a call's argument into its receiver when the call's value is kept", () => {
    const concat = anchorGraphOp(session, { ...find(basics, "src/external-calls.tsx", "props.tags", "= kept.concat"), direction: "forward" });
    expect(concat.nodes.some((node) => node.label === "kept")).toBe(false);
    expect(concat.edges.filter((edge) => edge.status === "partial")).toEqual([]);
    expect(boxes(concat, "terminal")).toMatchObject([{ label: "more" }]);
    // Module state the function does not own: the push stays an external-code stop.
    const logged = anchorGraphOp(session, { ...find(basics, "src/external-calls.tsx", "entry", "log.push(entry)"), direction: "forward" });
    expect(logged.nodes.some((node) => node.label === "log")).toBe(false);
    expect(boxes(logged, "frontier")).toMatchObject([{ reason: "external-code", label: "log.push" }]);
  });

  it("carries a collection method's named result on as the call's own value", () => {
    // The anchor is the result `find` names; it reaches `first` and the title slot through the call.
    const found = anchorGraphOp(session, { ...find(basics, "src/external-calls.tsx", "props.tags.find((tag) => tag.length > 1)"), direction: "forward" });
    expect(found.anchor.text).toContain("find");
    expect(found.nodes.find((node) => node.kind === "anchor")?.elementKind).toBe("call-result");
    expect(boxes(found, "frontier")).toEqual([]);
    expect(found.outcome).toBe("ok");
    expect(boxes(found, "terminal")).toMatchObject([{ label: "first" }]);
  });

  it("ends a backward walk at a literal with no frontier: that is where the value begins", () => {
    const graph = anchorGraphOp(session, { ...find(basics, "src/literal-start.tsx", "label", "{label}"), direction: "backward" });
    expect(graph.outcome).toBe("ok");
    expect(graph.counts).toMatchObject({ frontiers: 0, origins: 0 });
    expect(boxes(graph).some((node) => node.label === "\"x\"")).toBe(true);
  });

  it("draws a hook's return upstream as a carrier, and a return nothing carries on downstream as a terminal", () => {
    const back = anchorGraphOp(session, { ...find(basics, "src/hook-return.tsx", "label", "{label}"), direction: "backward" });
    expect(back.outcome).toBe("ok");
    expect(boxes(back).find((node) => node.elementKind === "return")).toMatchObject({ side: "up", kind: "value", line: 7 });
    expect(back.counts).toMatchObject({ terminals: 0, frontiers: 0 });
    const forward = anchorGraphOp(session, { ...find(basics, "src/hook-return.tsx", "value", "return value"), direction: "forward" });
    expect(forward.outcome).toBe("ok");
    expect(boxes(forward, "terminal")).toMatchObject([{ side: "down", elementKind: "return", line: 17 }]);
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
