import { describe, expect, it } from "vitest";
import { DEFAULT_METRICS, normalizeTree } from "./normalizeTree";

describe("normalizeTree", () => {
  it("fills metrics, children and line defaults the server omits", () => {
    const tree: any = normalizeTree({
      name: "root",
      type: "folder",
      path: "/r",
      metrics: { loc: 10 },
      children: [{ name: "f", type: "function", path: "/r/a.ts", metrics: {}, start_line: 3 }],
    });

    expect(tree.metrics).toEqual({ ...DEFAULT_METRICS, loc: 10 });
    expect(tree.start_line).toBe(0);
    const [fn] = tree.children as any[];
    expect(fn.metrics.complexity).toBe(0);
    expect(fn.children).toEqual([]);
    expect(fn.start_line).toBe(3);
    expect(fn.end_line).toBe(0);
  });

  it("rebuilds omitted paths from the parent and keeps explicit ones", () => {
    const tree: any = normalizeTree({
      name: "root",
      type: "folder",
      path: "/r",
      metrics: {},
      children: [
        {
          name: "a.ts",
          type: "file",
          metrics: {},
          children: [
            { name: "run", type: "function", children: [{ name: "(body)", type: "function_body" }] },
            { name: "odd", type: "function", path: "/elsewhere/odd" },
          ],
        },
      ],
    });

    const file = tree.children[0];
    expect(file.path).toBe("/r/a.ts");
    expect(file.children[0].path).toBe("/r/a.ts::run");
    expect(file.children[0].children[0].path).toBe("/r/a.ts::run::(body)");
    expect(file.children[1].path).toBe("/elsewhere/odd");
  });

  it("handles deep trees without recursion", () => {
    const root: any = { name: "0", type: "folder", path: "/", metrics: {} };
    let node = root;
    for (let i = 1; i < 20000; i++) {
      node.children = [{ name: String(i), type: "folder", metrics: {} }];
      node = node.children[0];
    }
    normalizeTree(root);
    expect(node.children).toEqual([]);
    expect(node.metrics.loc).toBe(0);
  });
});
