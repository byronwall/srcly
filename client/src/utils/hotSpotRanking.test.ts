import { describe, expect, it } from "vitest";
import { cohortNodes, rankHotSpots, type RankableNode } from "./hotSpotRanking";

const file = (name: string, metrics: Record<string, unknown>, children: RankableNode[] = []) =>
  ({ name, path: `/r/${name}`, type: "file", metrics, children }) as RankableNode & { name: string };
const fn = (name: string, kind: string, metrics: Record<string, unknown>) =>
  ({ name, path: `/r/a.ts::${name}`, type: "function", kind, metrics }) as RankableNode & { name: string };
const names = (nodes: { node: RankableNode }[]) => nodes.map((r) => (r.node as any).name);

describe("cohortNodes", () => {
  it("keeps files and executable functions apart", () => {
    const root = {
      type: "folder",
      path: "/r",
      children: [
        file("a.ts", { complexity: 4 }, [
          fn("Panel", "function", { complexity: 4 }),
          fn("<div>", "jsx", { complexity: 9 }),
          fn("Store (class)", "class", { complexity: 1 }),
          { type: "function_body", path: "/r/a.ts::(body)", metrics: { loc: 3 } },
        ]),
      ],
    } as RankableNode;
    expect(cohortNodes(root, "file").map((n: any) => n.name)).toEqual(["a.ts"]);
    expect(cohortNodes(root, "function").map((n: any) => n.name)).toEqual(["Panel"]);
  });
});

describe("rankHotSpots", () => {
  it("ranks worst first, breaks ties by path, and ranks a measured zero", () => {
    const nodes = [
      file("b.py", { complexity: 4 }),
      file("zero.py", { complexity: 0 }),
      file("a.py", { complexity: 4 }),
      file("big.py", { complexity: 9 }),
    ];
    const { ranked, na } = rankHotSpots(nodes, "complexity");
    expect(names(ranked)).toEqual(["big.py", "a.py", "b.py", "zero.py"]);
    expect(ranked.map((r) => r.value)).toEqual([9, 4, 4, 0]);
    expect(ranked[0].score).toBe(1);
    expect(na).toEqual([]);
  });

  it("puts N/A nodes apart instead of ranking them", () => {
    const doc = file("doc.md", { complexity: null, loc: 50 });
    const huge = file("huge.ts", { loc: 400 });
    const code = file("a.py", { complexity: 5, loc: 100 });
    const { ranked, na } = rankHotSpots([doc, huge, code], "complexity");
    expect(names(ranked)).toEqual(["a.py"]);
    expect(na.map((n: any) => n.name)).toEqual(["doc.md", "huge.ts"]);
  });

  it("never ranks by neutral detail metrics", () => {
    expect(rankHotSpots([file("a.py", { todo_count: 9 })], "todo_count")).toEqual({ ranked: [], na: [] });
  });
});
