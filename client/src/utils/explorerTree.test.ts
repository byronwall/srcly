import { describe, expect, it } from "vitest";
import { flattenExplorerTree, getVirtualTreeRange } from "./explorerTree";

describe("flattenExplorerTree", () => {
  it("sorts folders first and reveals descendants only when expanded", () => {
    const tree = {
      name: "root",
      path: "/root",
      type: "folder",
      children: [
        { name: "z.ts", path: "/root/z.ts", type: "file" },
        {
          name: "src",
          path: "/root/src",
          type: "folder",
          children: [{ name: "a.ts", path: "/root/src/a.ts", type: "file" }],
        },
      ],
    };

    const collapsed = flattenExplorerTree(tree, {
      isExpanded: (node) => node.path === "/root",
      getValue: (node) => node.name,
      direction: "asc",
    });
    expect(collapsed.map((row) => row.node.name)).toEqual(["root", "src", "z.ts"]);

    const expanded = flattenExplorerTree(tree, {
      isExpanded: () => true,
      getValue: (node) => node.name,
      direction: "desc",
    });
    expect(expanded.map((row) => row.node.name)).toEqual(["root", "src", "a.ts", "z.ts"]);

    const rootless = flattenExplorerTree(tree, {
      isExpanded: () => true,
      getValue: (node) => node.name,
      direction: "asc",
      includeRoot: false,
    });
    expect(rootless.map((row) => [row.node.name, row.depth, row.parent?.name])).toEqual([
      ["src", 0, "root"],
      ["a.ts", 1, "src"],
      ["z.ts", 0, "root"],
    ]);
  });

  it("keeps a childless root as its only row when the root is hidden", () => {
    const rows = flattenExplorerTree(
      { name: "a.ts", path: "/a.ts", type: "file" },
      { isExpanded: () => true, getValue: (node) => node.name, direction: "asc", includeRoot: false }
    );
    expect(rows.map((row) => row.node.name)).toEqual(["a.ts"]);
  });
});

describe("getVirtualTreeRange", () => {
  it("keeps a bounded window and spacer sizes around the viewport", () => {
    expect(getVirtualTreeRange(320, 160, 100, 32, 2)).toEqual({
      start: 8,
      end: 17,
      top: 256,
      bottom: 2656,
    });
  });

  it("keeps the remaining rows visible when filtering shrinks the list", () => {
    expect(getVirtualTreeRange(3200, 400, 5)).toEqual({
      end: 5,
      start: 0,
      top: 0,
      bottom: 0,
    });
  });
});
