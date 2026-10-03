import { describe, expect, it } from "vitest";
import { filterTree, findTreeNodeByPath } from "./dataProcessing";

const tree = {
  name: "repo",
  path: "/repo",
  type: "folder",
  children: [
    {
      name: "src",
      path: "/repo/src",
      type: "folder",
      children: [
        { name: "App.tsx", path: "/repo/src/App.tsx", type: "file" },
        { name: "Other.tsx", path: "/repo/src/Other.tsx", type: "file" },
      ],
    },
    { name: "empty", path: "/repo/empty", type: "folder", children: [] },
  ],
};

describe("filterTree", () => {
  it("combines search and exclusions without changing the source tree", () => {
    const result = filterTree(tree, "App", ["/repo/src/Other.tsx"]);
    expect(result.children[0].children.map((node: any) => node.name)).toEqual([
      "App.tsx",
    ]);
    expect(tree.children[0].children).toHaveLength(2);
    expect(findTreeNodeByPath(result, "/repo/src/App.tsx")?.name).toBe("App.tsx");
    expect(findTreeNodeByPath(result, "/repo/src/Other.tsx")).toBeNull();
  });

  it("retains empty folders for exclusions and reuses unchanged branches", () => {
    const result = filterTree(tree, "", ["/repo/src/App.tsx", "/repo/src/Other.tsx"]);
    expect(result.children.map((node: any) => node.name)).toEqual(["src", "empty"]);
    expect(result.children[1]).toBe(tree.children[1]);
    expect(result.children[0].children).toEqual([]);
    expect(tree.children[0].children).toHaveLength(2);
  });

  it("returns the original tree when no filter is active", () => {
    expect(filterTree(tree, "")).toBe(tree);
  });
});
