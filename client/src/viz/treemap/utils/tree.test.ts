import { describe, expect, it } from "vitest";
import * as d3 from "d3";
import { addScopeBodyDummyNodes } from "./tree";

describe("treemap synthetic body nodes", () => {
  it("preserves source data and keeps file LOC equal to its original total", () => {
    const source = {
      name: "App.tsx",
      path: "/repo/App.tsx",
      type: "file",
      metrics: { loc: 30 },
      children: [
        {
          name: "render",
          path: "/repo/App.tsx::render",
          type: "function",
          start_line: 5,
          end_line: 20,
          metrics: { loc: 16 },
          children: [],
        },
      ],
    };

    const processed = addScopeBodyDummyNodes(source);
    const hierarchy = d3.hierarchy(processed).sum((node: any) =>
      node.children?.length ? 0 : node.metrics?.loc ?? 0
    );

    expect(source.children).toHaveLength(1);
    expect(source.children[0].children).toEqual([]);
    expect(processed).not.toBe(source);
    expect(processed.children).not.toBe(source.children);
    expect(processed.children[1].name).toBe("(body)");
    expect(processed.children[1].metrics.loc).toBe(14);
    expect(hierarchy.value).toBe(30);
    expect(addScopeBodyDummyNodes(processed)).toBe(processed);
  });

  it("reuses leaves and branches that do not need a body node", () => {
    const leaf = {
      name: "README.md",
      path: "/repo/README.md",
      type: "file",
      metrics: { loc: 4 },
    };
    const source = {
      name: "repo",
      type: "folder",
      children: [leaf],
    };

    expect(addScopeBodyDummyNodes(leaf)).toBe(leaf);
    expect(addScopeBodyDummyNodes(source)).toBe(source);
    expect(source.children[0]).toBe(leaf);
  });

  it("adds only missing function and file body LOC", () => {
    const nested = {
      name: "inner",
      type: "function",
      metrics: { loc: 3 },
      children: [],
    };
    const outer = {
      name: "outer",
      type: "function",
      metrics: { loc: 12 },
      children: [nested],
    };
    const source = {
      name: "App.tsx",
      type: "file",
      metrics: { loc: 20 },
      children: [outer],
    };
    const processed = addScopeBodyDummyNodes(source);
    const processedOuter = processed.children[0];
    const hierarchy = d3.hierarchy(processed).sum((node: any) =>
      node.children?.length ? 0 : node.metrics?.loc ?? 0
    );

    expect(processedOuter.children[1].type).toBe("function_body");
    expect(processedOuter.children[1].metrics.loc).toBe(12);
    expect(processed.children[1].type).toBe("file_body");
    expect(processed.children[1].metrics.loc).toBe(8);
    expect(hierarchy.value).toBe(23);
    expect(outer.children).toEqual([nested]);
    expect(source.children).toEqual([outer]);
    expect(addScopeBodyDummyNodes(processed)).toBe(processed);
  });
});
