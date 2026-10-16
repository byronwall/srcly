import { describe, expect, it } from "vitest";
import { explorerColumn, metricCellColor, metricCellText, visibleExplorerColumns } from "./explorerColumns";
import { ancestorChain, summarizeScope } from "./explorerScope";
import { HOTSPOT_METRICS } from "./metricsStore";

const def = (id: string) => HOTSPOT_METRICS.find((m) => m.id === id)!;

describe("visibleExplorerColumns", () => {
  it("always ends with the color metric, without duplicating a picked one", () => {
    expect(visibleExplorerColumns(["loc", "complexity"], "complexity").map((c) => c.id)).toEqual([
      "loc",
      "complexity",
    ]);
    expect(visibleExplorerColumns([], "todo_count").map((c) => c.id)).toEqual(["todo_count"]);
    expect(visibleExplorerColumns(["complexity", "loc"], "loc").map((c) => c.id)).toEqual(["complexity", "loc"]);
  });
});

describe("metricCellText", () => {
  it("blanks metrics that don't apply to the file's language and zero counts", () => {
    const md = { path: "/r/README.md", type: "file", metrics: { complexity: 0, loc: 12 } };
    expect(metricCellText(def("complexity"), md)).toBe("");
    expect(metricCellText(def("loc"), md)).toBe("12");
    expect(metricCellColor(def("complexity"), md)).toBeUndefined();

    const ts = { path: "/r/a.ts", type: "file", metrics: { complexity: 14, todo_count: 0, file_size: 2048 } };
    expect(metricCellText(def("complexity"), ts)).toBe("14");
    expect(metricCellText(def("todo_count"), ts)).toBe("");
    expect(metricCellText(def("file_size"), ts)).toBe("2.0 KB");
    expect(metricCellColor(def("complexity"), ts)).toMatch(/^#/);
  });

  it("shows folder counts only on folders", () => {
    const files = explorerColumn("file_count")!;
    expect(files.value({ path: "/r/src", type: "folder", metrics: { file_count: 1200 } })).toBe("1,200");
    expect(files.value({ path: "/r/a.ts", type: "file", metrics: { file_count: 1 } })).toBe("");
  });
});

describe("explorer scope", () => {
  const tree = {
    name: "root",
    path: "/r",
    type: "folder",
    metrics: { loc: 30 },
    children: [
      {
        name: "src",
        path: "/r/src",
        type: "folder",
        children: [
          {
            name: "a.ts",
            path: "/r/src/a.ts",
            type: "file",
            metrics: { complexity: 4, comment_density: 0.3 },
            children: [{ name: "f", path: "/r/src/a.ts::f", type: "function" }],
          },
          { name: "b.ts", path: "/r/src/b.ts", type: "file", metrics: { complexity: 9, comment_density: 0.1 } },
        ],
      },
      { name: "notes.md", path: "/r/notes.md", type: "file", metrics: { complexity: 99 } },
    ],
  };

  it("finds the chain from the root to a path", () => {
    expect(ancestorChain(tree, "/r/src/b.ts").map((n) => n.name)).toEqual(["root", "src", "b.ts"]);
    expect(ancestorChain(tree, "/missing")).toEqual([]);
  });

  it("counts contents and picks the worst applicable file", () => {
    const summary = summarizeScope(tree, def("complexity"));
    expect(summary).toMatchObject({ files: 3, folders: 1, scopes: 1, loc: 30 });
    // notes.md has no complexity metric, so it can't be the worst.
    expect(summary.worst?.node.name).toBe("b.ts");
    // Inverted metric: least commented wins.
    expect(summarizeScope(tree, def("comment_density")).worst?.node.name).toBe("b.ts");
  });
});

describe("scopeDisplayName", () => {
  it("names the scan root after its folder", async () => {
    const { scopeDisplayName } = await import("./explorerScope");
    expect(scopeDisplayName({ name: "root", path: "/Users/me/proj" }, "/Users/me/proj")).toBe("proj");
    expect(scopeDisplayName({ name: "src", path: "/Users/me/proj/src" }, "/Users/me/proj")).toBe("src");
  });
});
