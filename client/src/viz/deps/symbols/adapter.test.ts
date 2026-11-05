import { describe, expect, it } from "vitest";
import type { SymbolGraph } from "../../../symbols/contract";
import { edgeId, symbolGraphToViewModel, symbolPathToViewModel } from "./adapter";

const node = (id: string, kind: SymbolGraph["nodes"][number]["kind"], hop: number, extra: Partial<SymbolGraph["nodes"][number]> = {}) => ({
  id,
  name: id.includes("#") ? id.slice(id.indexOf("#") + 1).split(".").pop()! : id,
  kind,
  file: id.split("#")[0],
  line: 1,
  endLine: 2,
  language: "ts" as const,
  inCount: 0,
  outCount: 0,
  hop,
  ...extra,
});

const graph: SymbolGraph = {
  root: "/r",
  focus: "s.ts#Store",
  nodes: [
    node("s.ts#Store", "class", 0, { inCount: 2, outCount: 0 }),
    node("s.ts#Store.bump", "method", 0, { container: "s.ts#Store", inCount: 1, outCount: 1 }),
    node("s.ts#Store.save", "method", 0, { container: "s.ts#Store", inCount: 1 }),
    node("a.ts#caller", "function", 1, { inCount: 3, outCount: 1 }),
    node("b.ts#Shape", "type", 1, { inCount: 1 }),
    node("d.ts#dead", "function", 1, { inCount: 0, outCount: 1, refs: "none" }),
    node("h.py#handler", "function", 2, { inCount: 1, language: "py" }),
    node("t/a.test.ts#spec", "function", 1, { isTest: true, outCount: 1 }),
  ],
  edges: [
    { source: "a.ts#caller", target: "s.ts#Store", kind: "instantiate", lines: [4], count: 1, resolution: "exact" },
    { source: "s.ts#Store.bump", target: "s.ts#Store.save", kind: "call", lines: [2, 3], count: 2, resolution: "exact" },
    { source: "s.ts#Store", target: "b.ts#Shape", kind: "implements", lines: [1], count: 1, resolution: "exact" },
    { source: "t/a.test.ts#spec", target: "s.ts#Store.bump", kind: "call", lines: [9], count: 1, resolution: "name" },
    { source: "d.ts#dead", target: "s.ts#Store", kind: "type", lines: [2], count: 1, resolution: "exact" },
    { source: "a.ts#caller", target: "h.py#handler", kind: "http", lines: [12], count: 1, resolution: "exact", via: "GET /api/items/{id}" },
  ],
  index: { symbols: 6, references: 4, files: 4, unresolvedMembers: 0, builtMs: 1 },
};

describe("symbolPathToViewModel", () => {
  const chain = {
    root: "/r",
    start: "a.ts#a",
    end: "c.ts#c",
    found: true,
    direction: "forward" as const,
    steps: 2,
    nodes: [node("a.ts#a", "function", 0), node("b.ts#b", "function", 1), node("c.ts#c", "function", 2)],
    edges: [
      { source: "a.ts#a", target: "b.ts#b", kind: "call" as const, lines: [3], count: 1, resolution: "exact" as const },
      { source: "b.ts#b", target: "c.ts#c", kind: "call" as const, lines: [7, 9], count: 2, resolution: "typed" as const },
    ],
    index: { symbols: 3, references: 3, files: 3, unresolvedMembers: 0, builtMs: 1 },
  };

  it("puts the start in the centre and the steps on the side the chain runs to", () => {
    const { vm } = symbolPathToViewModel(chain);
    expect(vm.nodes.map((n) => [n.id, n.region, n.note])).toEqual([
      ["a.ts#a", "center", "start"],
      ["b.ts#b", "out", "step 1"],
      ["c.ts#c", "out", "end · 2 steps"],
    ]);
    expect(vm.edges.map((e) => [e.source, e.target, e.weight, e.bold, e.faint, e.label])).toEqual([["a.ts#a", "b.ts#b", 1, true, false, "calls"], ["b.ts#b", "c.ts#c", 2, true, false, "calls"]]);
    const back = symbolPathToViewModel({ ...chain, direction: "backward" });
    expect(back.vm.nodes[1].region).toBe("in");
  });

  it("draws the two ends apart when there is no chain", () => {
    const { vm } = symbolPathToViewModel({ ...chain, found: false, direction: undefined, steps: 0, nodes: [chain.nodes[0], chain.nodes[2]], edges: [] });
    expect(vm.nodes.map((n) => n.note)).toEqual(["start", "end · no path"]);
    expect(vm.edges).toEqual([]);
  });
});

describe("symbolGraphToViewModel", () => {
  it("centers the focus and its members in one frame, referrers left, referenced right", () => {
    const { vm } = symbolGraphToViewModel(graph, { kinds: ["call", "instantiate", "read", "write", "type", "extends", "implements"], expanded: [] });
    const by = new Map(vm.nodes.map((n) => [n.id, n]));
    expect(vm.focusId).toBe("s.ts#Store");
    expect(by.get("s.ts#Store")!.region).toBe("center");
    expect(by.get("s.ts#Store.bump")!.group).toEqual({ id: "s.ts#Store", label: "Store", opened: true });
    expect(by.get("s.ts#Store.bump")!.subgroup).toBe("s.ts#Store");
    expect(by.get("a.ts#caller")!.region).toBe("in");
    expect(by.get("a.ts#caller")!.group).toEqual({ id: "file:a.ts", label: "a.ts" });
    expect(by.get("b.ts#Shape")!.region).toBe("out");
    expect(by.get("t/a.test.ts#spec")!.outline).toBe("dotted");
    expect(by.get("d.ts#dead")!.status).toBe("unsupported");
    expect(by.get("d.ts#dead")!.note).toBe("0 in · 1 out · unreferenced");
    expect(by.get("a.ts#caller")!.status).toBeUndefined();
  });

  it("marks a side box expandable when the index holds references beyond the drawn ones", () => {
    const { vm } = symbolGraphToViewModel(graph, { kinds: ["call", "instantiate"], expanded: [] });
    const by = new Map(vm.nodes.map((n) => [n.id, n]));
    expect(by.get("a.ts#caller")!.expandable).toBe(true); // 4 references in the index, 1 drawn
    expect(by.get("s.ts#Store.save")!.expandable).toBeUndefined(); // center boxes never expand
    const opened = symbolGraphToViewModel(graph, { kinds: ["call", "instantiate"], expanded: ["a.ts#caller"] });
    expect(opened.vm.nodes.find((n) => n.id === "a.ts#caller")!.expandable).toBeUndefined();
    expect(opened.vm.nodes.find((n) => n.id === "a.ts#caller")!.group?.opened).toBe(true);
    expect(opened.vm.expanded).toEqual(["a.ts#caller"]);
  });

  it("drops hidden kinds, the symbols only they reach, and says how many", () => {
    const model = symbolGraphToViewModel(graph, { kinds: ["call", "instantiate"], expanded: [] });
    expect(model.vm.nodes.map((n) => n.id)).not.toContain("b.ts#Shape");
    expect(model.hiddenByKind).toBe(3);
    expect(model.vm.edges.map((e) => e.relation)).not.toContain("implements");
  });

  it("styles edges by kind and sureness and keeps the merged reference behind each", () => {
    const model = symbolGraphToViewModel(graph, { kinds: ["call", "instantiate", "implements"], expanded: [] });
    const edge = (kind: string, source: string, target: string) => model.vm.edges.find((e) => e.id === edgeId({ kind: kind as never, source, target }))!;
    const call = edge("call", "s.ts#Store.bump", "s.ts#Store.save");
    expect(call.weight).toBe(2);
    expect(call.faint).toBe(false);
    expect(call.detail).toContain("calls it 2 times at lines 2, 3");
    expect(call.status).toBe("proven");
    expect(edge("implements", "s.ts#Store", "b.ts#Shape").style).toBe("handoff");
    expect(edge("implements", "s.ts#Store", "b.ts#Shape").label).toBe("implements");
    const guess = edge("call", "t/a.test.ts#spec", "s.ts#Store.bump");
    expect(guess.faint).toBe(true);
    expect(guess.status).toBe("partial");
    expect(guess.detail).toContain("by name");
    expect(model.edgeById.get(guess.id)?.resolution).toBe("name");
  });

  it("draws an HTTP reference dashed with the request as its label", () => {
    const model = symbolGraphToViewModel(graph, { kinds: ["http"], expanded: [] });
    const edge = model.vm.edges.find((e) => e.relation?.startsWith("http"))!;
    expect(edge.style).toBe("handoff");
    expect(edge.label).toBe("GET /api/items/{id}");
    expect(edge.detail).toContain("matched by method and path");
    expect(model.vm.nodes.find((n) => n.id === "h.py#handler")!.region).toBe("out");
  });
});
