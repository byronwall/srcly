import { describe, expect, it } from "vitest";
import {
  NA_TEXT,
  explorerColumn,
  explorerSortValue,
  metricCellColor,
  metricCellIsFaint,
  metricCellText,
  metricCellTitle,
  visibleExplorerColumns,
  witnessOf,
} from "./explorerColumns";
import { sortExplorerChildren } from "./explorerTree";
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
  it("shows N/A (null) as a dash and a measured zero as 0, both faint", () => {
    const md = { path: "/r/README.md", type: "file", metrics: { complexity: null, loc: 12, na_reason: "Not measured for Markdown files" } };
    expect(metricCellText(def("complexity"), md)).toBe(NA_TEXT);
    expect(metricCellIsFaint(def("complexity"), md)).toBe(true);
    expect(metricCellTitle(def("complexity"), md)).toBe("Complexity (max): N/A (Not measured for Markdown files)");
    expect(metricCellText(def("loc"), md)).toBe("12");
    expect(metricCellColor(def("complexity"), md)).toBeUndefined();

    const ts = { path: "/r/a.ts", type: "file", metrics: { complexity: 14, todo_count: 0, file_size: 2048 } };
    expect(metricCellText(def("complexity"), ts)).toBe("14");
    expect(metricCellText(def("todo_count"), ts)).toBe("0");
    expect(metricCellIsFaint(def("todo_count"), ts)).toBe(true);
    expect(metricCellText(def("file_size"), ts)).toBe("2.0 KB");
    expect(metricCellColor(def("complexity"), ts)).toMatch(/^#/);
  });

  it("names the max-complexity witness on files and folders", () => {
    const witness = { path: "/r/a.py::run::inner", name: "inner", start_line: 4, end_line: 9 };
    const file = { path: "/r/a.py", type: "file", metrics: { complexity: 7, complexity_witness: witness } };
    expect(witnessOf(file)).toEqual(witness);
    expect(metricCellTitle(def("complexity"), file)).toBe("Complexity (max): 7 in inner (line 4); click to open it");
    expect(witnessOf({ path: "/r/a.py::run", type: "function", metrics: { complexity: 7, complexity_witness: witness } })).toBeNull();
  });

  it("sorts N/A last in both directions", () => {
    const rows = [
      { name: "a", type: "file", path: "/a", metrics: { complexity: null } },
      { name: "b", type: "file", path: "/b", metrics: { complexity: 0 } },
      { name: "c", type: "file", path: "/c", metrics: { complexity: 5 } },
    ];
    const get = (n: any) => explorerSortValue(n, "complexity");
    expect(sortExplorerChildren(rows, get, "desc").map((r) => r.name)).toEqual(["c", "b", "a"]);
    expect(sortExplorerChildren(rows, get, "asc").map((r) => r.name)).toEqual(["b", "c", "a"]);
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
            children: [
              { name: "f", path: "/r/src/a.ts::f", type: "function", kind: "function" },
              { name: "C (class)", path: "/r/src/a.ts::C (class)", type: "function", kind: "class" },
            ],
          },
          { name: "b.ts", path: "/r/src/b.ts", type: "file", metrics: { complexity: 9, comment_density: 0.1 } },
        ],
      },
      { name: "notes.md", path: "/r/notes.md", type: "file", metrics: { complexity: null } },
    ],
  };

  it("finds the chain from the root to a path", () => {
    expect(ancestorChain(tree, "/r/src/b.ts").map((n) => n.name)).toEqual(["root", "src", "b.ts"]);
    expect(ancestorChain(tree, "/missing")).toEqual([]);
  });

  it("counts contents and picks the worst applicable file", () => {
    const summary = summarizeScope(tree, def("complexity"));
    expect(summary).toMatchObject({ files: 3, folders: 1, functions: 1, loc: 30 });
    // notes.md's complexity is N/A, so it can't be the worst.
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
