import { describe, expect, it } from "vitest";
import { cohortNodes, rankHotSpots, type RankableNode } from "./hotSpotRanking";
import type { HotSpotMetricId } from "./metricsStore";

const file = (name: string, metrics: Record<string, unknown>, children: RankableNode[] = []) =>
  ({ name, type: "file", metrics, children }) as RankableNode & { name: string };
const fn = (name: string, kind: string, metrics: Record<string, unknown>) =>
  ({ name, type: "function", kind, metrics }) as RankableNode & { name: string };

describe("cohortNodes", () => {
  it("keeps files and executable functions apart", () => {
    const root = {
      type: "folder",
      children: [
        file("a.ts", { complexity: 4 }, [
          fn("Panel", "function", { complexity: 4 }),
          fn("<div>", "jsx", { complexity: 9 }),
          fn("Store (class)", "class", { complexity: 1 }),
          { type: "function_body", metrics: { loc: 3 } },
        ]),
      ],
    } as RankableNode;
    expect(cohortNodes(root, "file").map((n: any) => n.name)).toEqual(["a.ts"]);
    expect(cohortNodes(root, "function").map((n: any) => n.name)).toEqual(["Panel"]);
  });
});

describe("rankHotSpots", () => {
  it("keeps a measured zero in the mean", () => {
    const lean = file("lean", { complexity: 10, todo_count: 0 });
    const busy = file("busy", { complexity: 10, todo_count: 3 });
    const { ranked } = rankHotSpots([lean, busy], ["complexity", "todo_count"]);
    expect(ranked.map((r: any) => r.node.name)).toEqual(["busy", "lean"]);
    expect(ranked[1].score).toBe(0.5);
  });

  it("drops N/A metrics, and leaves nodes N/A on every metric unranked", () => {
    const doc = file("doc.md", { complexity: null, loc: 50 });
    const code = file("a.py", { complexity: 5, loc: 100 });
    const skipped = file("huge.ts", { complexity: null, loc: 400 });
    const { ranked, na } = rankHotSpots([doc, code], ["complexity", "loc"]);
    expect(ranked.map((r: any) => [r.node.name, r.score])).toEqual([
      ["a.py", 1],
      ["doc.md", 0.5],
    ]);
    expect(na).toBe(0);
    expect(rankHotSpots([doc, code, skipped], ["complexity"]).na).toBe(2);
  });

  it("never lowers a score when one input rises", () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids: HotSpotMetricId[] = ["complexity", "loc", "todo_count", "max_nesting_depth"];
    const pick = () => (rand() < 0.3 ? 0 : Math.floor(rand() * 40));
    for (let trial = 0; trial < 200; trial++) {
      const peers = Array.from({ length: 5 }, (_, i) => file(`p${i}`, Object.fromEntries(ids.map((id) => [id, pick()]))));
      const base = Object.fromEntries(ids.map((id) => [id, pick()]));
      const id = ids[Math.floor(rand() * ids.length)];
      const before = file("t", base);
      const after = file("t", { ...base, [id]: (base[id] as number) + 1 + Math.floor(rand() * 60) });
      const score = (t: RankableNode) => rankHotSpots([...peers, t], ids).ranked.find((r) => r.node === t)!.score;
      expect(score(after)).toBeGreaterThanOrEqual(score(before));
    }
  });
});
