import { describe, expect, it } from "vitest";
import { buildIndex } from "./hierarchy";
import { highlight, searchGraph } from "./goto";

const index = buildIndex({
  root: "",
  nodes: [
    { id: "", kind: "folder", name: "repo", parent: null },
    { id: "src", kind: "folder", name: "src", parent: "", path: "src" },
    { id: "src/compare", kind: "folder", name: "compare", parent: "src", path: "src/compare" },
    { id: "src/compare/CompareApp.tsx", kind: "file", name: "CompareApp.tsx", parent: "src/compare", path: "src/compare/CompareApp.tsx" },
    { id: "src/compare/CompareApp.tsx#CompareApp", kind: "symbol", name: "CompareApp", parent: "src/compare/CompareApp.tsx" },
    { id: "src/App.tsx", kind: "file", name: "App.tsx", parent: "src", path: "src/App.tsx" },
    { id: "src/compare/api.ts", kind: "file", name: "api.ts", parent: "src/compare", path: "src/compare/api.ts" },
  ],
  edges: [],
});
const ids = (q: string) => searchGraph(index, q, "src").map((h) => h.node.id);

describe("searchGraph", () => {
  it("ranks name matches first, folders before files before symbols", () => {
    expect(ids("compare")).toEqual([
      "src/compare",
      "src/compare/CompareApp.tsx",
      "src/compare/CompareApp.tsx#CompareApp",
      "src/compare/api.ts",
    ]);
    expect(ids("app")[0]).toBe("src/App.tsx");
    // Both words in the name beat one word in the name and one in the path.
    expect(ids("comp app")[0]).toBe("src/compare/CompareApp.tsx");
  });

  it("needs every token somewhere in the path", () => {
    expect(ids("compare api")).toEqual(["src/compare/api.ts"]);
    expect(ids("nothing")).toEqual([]);
  });

  it("lists the children of the current folder for an empty query", () => {
    expect(ids("")).toEqual(["src/compare", "src/App.tsx"]);
  });
});

describe("highlight", () => {
  it("marks every token occurrence", () => {
    expect(highlight("src/compare/api.ts", "comp api")).toEqual([
      { text: "src/", hit: false },
      { text: "comp", hit: true },
      { text: "are/", hit: false },
      { text: "api", hit: true },
      { text: ".ts", hit: false },
    ]);
  });
});
