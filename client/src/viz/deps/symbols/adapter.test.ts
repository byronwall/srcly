import { describe, expect, it } from "vitest";
import type { SymbolGraph } from "../../../symbols/contract";
import { edgeId, symbolGraphToViewModel } from "./adapter";

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
    node("t/a.test.ts#spec", "function", 1, { isTest: true, outCount: 1 }),
  ],
  edges: [
    { source: "a.ts#caller", target: "s.ts#Store", kind: "instantiate", lines: [4], count: 1, resolution: "exact" },
    { source: "s.ts#Store.bump", target: "s.ts#Store.save", kind: "call", lines: [2, 3], count: 2, resolution: "exact" },
    { source: "s.ts#Store", target: "b.ts#Shape", kind: "implements", lines: [1], count: 1, resolution: "exact" },
    { source: "t/a.test.ts#spec", target: "s.ts#Store.bump", kind: "call", lines: [9], count: 1, resolution: "name" },
  ],
  index: { symbols: 6, references: 4, files: 4, unresolvedMembers: 0, builtMs: 1 },
};

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
    expect(model.hiddenByKind).toBe(1);
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
});
