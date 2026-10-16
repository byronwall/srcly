import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import {
  buildTooltipContent,
  formatAge,
  formatBytes,
  languageMix,
  notAnalyzedLines,
  pathWithin,
  placeFloating,
  scopeKind,
  siblingRank,
  topChildren,
} from "./useTreemapTooltip";

describe("notAnalyzedLines", () => {
  it("is empty for analyzed files", () => {
    expect(notAnalyzedLines({ analysis_status: "ok" })).toEqual([]);
  });

  it("names the size for files over the cap", () => {
    expect(notAnalyzedLines({ analysis_status: "too_large", file_size: 21_196_569 })).toEqual([
      { label: "Not analyzed", value: "too large (21.2 MB); LOC is a line count" },
    ]);
  });

  it("shows the status for failed files", () => {
    expect(notAnalyzedLines({ analysis_status: "timeout" })).toEqual([
      { label: "Not analyzed", value: "timeout; LOC is a line count" },
    ]);
  });

  it("counts failed files under a folder", () => {
    expect(notAnalyzedLines({ analysis_failed_count: 2 })).toEqual([
      { label: "Not analyzed", value: "2 files" },
    ]);
  });
});

const scope = (name: string, loc: number, extra: Record<string, unknown> = {}) => ({
  name,
  path: `pipeline.py::${name}`,
  type: "function",
  metrics: { loc },
  children: [],
  ...extra,
});

function fileNode() {
  const file = {
    name: "pipeline.py",
    path: "pipeline.py",
    type: "file",
    metrics: { loc: 0, complexity: 7, comment_density: 0.25, max_nesting_depth: 2, python_import_count: 9 },
    children: [
      scope("(imports)", 9),
      scope("small", 3),
      scope("run_pipeline", 120, { metrics: { loc: 120, complexity: 7 } }),
      scope("(class) Runner", 80, { children: [scope("go", 30), { name: "(body)", type: "function_body", metrics: { loc: 50 }, children: [] }] }),
      scope("a", 10),
      scope("b", 12),
      scope("c", 11),
      scope("empty", 0),
    ],
  };
  return d3.hierarchy<any>(file).sum((n: any) => (n.children?.length ? 0 : n.metrics?.loc ?? 0));
}

describe("topChildren", () => {
  it("lists the biggest scopes by LOC, skipping (imports), (body) and empty scopes", () => {
    const { children, more } = topChildren(fileNode(), "complexity", 5);
    expect(children.map((c) => c.name)).toEqual(["run_pipeline", "(class) Runner", "b", "c", "a"]);
    expect(children[1].loc).toBe(80);
    expect(more).toBe(1);
  });

  it("gives each child its share of the parent, tile color and coloring-metric value", () => {
    const { children } = topChildren(fileNode(), "complexity");
    const run = children[0];
    expect(run.share).toBeCloseTo(120 / 245);
    expect(run.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(run.metric).toBe("7");
    expect(topChildren(fileNode(), "loc").children[0].metric).toBe("");
  });
});

describe("buildTooltipContent", () => {
  it("summarizes a file with its scopes, imports and non-zero metrics", () => {
    const content = buildTooltipContent(fileNode(), "complexity");
    expect(content.subtitle).toBe("file · 7 scopes");
    expect(content.loc).toBe(245);
    expect(content.childrenLabel).toBe("Largest scopes");
    expect(content.childMetricLabel).toBe("CCN");
    expect(content.moreLabel).toBe("");
    expect(content.lines).toContainEqual({ label: "Imports", value: "9" });
    expect(content.lines).toContainEqual({ label: "Comments", value: "25%" });
    // Zeros are noise, and the coloring metric has its own line.
    expect(content.lines.some((l) => l.label === "TODOs")).toBe(false);
    expect(content.lines.some((l) => l.label === "Max CCN")).toBe(false);
    expect(content.primary).toMatchObject({ label: "Complexity (max)", value: "7" });
  });

  it("shows a scope's line range, path and nested scopes", () => {
    const runner = fileNode().children!.find((c) => c.data.name === "(class) Runner")!;
    runner.data.start_line = 10;
    runner.data.end_line = 89;
    const content = buildTooltipContent(runner, "complexity");
    expect(content.subtitle).toBe("class · L10–89");
    expect(content.path).toBe("pipeline.py");
    expect(content.primary?.label).toBe("Complexity");
    expect(content.children.map((c) => c.name)).toEqual(["go"]);
  });

  it("drops the coloring metric where it doesn't apply, like complexity on CSS", () => {
    const css = d3
      .hierarchy<any>({ name: "index.css", path: "src/index.css", type: "file", metrics: { loc: 20, file_size: 2048 }, children: [scope(":root", 20)] })
      .sum((n: any) => (n.children?.length ? 0 : n.metrics?.loc ?? 0));
    const content = buildTooltipContent(css, "complexity");
    expect(content.primary).toBeNull();
    expect(content.childMetricLabel).toBe("");
    expect(content.lines).toEqual([{ label: "Size", value: "2.0 KB" }]);
  });
});

function folderTree() {
  const file = (name: string, loc: number, complexity: number) => ({ name, type: "file", metrics: { loc, complexity }, children: [] });
  return d3
    .hierarchy<any>({
      name: "src",
      type: "folder",
      metrics: { complexity: 12 },
      children: [file("a.tsx", 60, 12), file("b.ts", 30, 3), file("c.ts", 30, 3), file("d.css", 5, 0), file("e.md", 5, 0)],
    })
    .sum((n: any) => (n.children?.length ? 0 : n.metrics?.loc ?? 0));
}

describe("scopeKind", () => {
  it("names scopes from the analyzers' naming and the file's language", () => {
    expect(scopeKind("Node (interface)", "tsx")).toBe("interface");
    expect(scopeKind("SortField (type)", "ts")).toBe("type");
    expect(scopeKind("<ExplorerContext.Provider>", "tsx")).toBe("JSX element");
    expect(scopeKind("<For>(ƒ)", "tsx")).toBe("JSX callback");
    expect(scopeKind("map(ƒ)", "ts")).toBe("callback");
    expect(scopeKind("value (obj)", "ts")).toBe("object");
    expect(scopeKind("(class) Runner", "python")).toBe("class");
    expect(scopeKind("(imports)", "ts")).toBe("imports");
    expect(scopeKind(":root", "css")).toBe("rule");
    expect(scopeKind("# Intro", "markdown")).toBe("section");
    expect(scopeKind("placeAndRoute", "ts")).toBe("function");
  });
});

describe("pathWithin", () => {
  it("joins folders with / and scopes inside a file with ›", () => {
    const root = d3.hierarchy<any>({
      name: "root",
      type: "folder",
      children: [{ name: "src", type: "folder", children: [{ name: "a.ts", type: "file", children: [{ name: "outer", type: "function", children: [{ name: "inner", type: "function" }] }] }] }],
    });
    const inner = root.descendants().find((n) => n.data.name === "inner")!;
    expect(pathWithin(inner)).toBe("src/a.ts › outer");
  });
});

describe("siblingRank", () => {
  it("is empty for synthetic tiles like (imports), and when every sibling ties", () => {
    const file = fileNode();
    const imports = file.children!.find((c) => c.data.name === "(imports)")!;
    expect(siblingRank(imports, "loc")).toBe("");
    expect(siblingRank(file.children![2], "todo_count")).toBe("");
  });

  it("ranks worst first among siblings, ties sharing the better rank", () => {
    const [a, b, c] = folderTree().children!;
    expect(siblingRank(a, "complexity")).toBe("#1 of 5 in src");
    expect(siblingRank(b, "complexity")).toBe("#2 of 5 in src");
    expect(siblingRank(c, "complexity")).toBe("#2 of 5 in src");
  });

  it("is empty for the root", () => {
    expect(siblingRank(folderTree(), "complexity")).toBe("");
  });
});

describe("coloring metric line", () => {
  it("doesn't repeat the header's LOC when coloring by LOC", () => {
    const a = folderTree().children![0];
    expect(buildTooltipContent(a, "loc").primary).toMatchObject({ label: "LOC", value: "", rank: "#1 of 5 in src" });
  });

  it("names comment density as a value, not a ranking", () => {
    const a = folderTree().children![0];
    expect(buildTooltipContent(a, "comment_density").primary?.label).toBe("Comment density");
  });

  it("hides a children column that would be all zeros", () => {
    const content = buildTooltipContent(folderTree(), "python_import_count");
    expect(content.childMetricLabel).toBe("");
    expect(content.children.every((c) => c.metric === "")).toBe(true);
  });

  it("marks children the metric doesn't apply to", () => {
    const content = buildTooltipContent(folderTree(), "complexity");
    expect(content.children.find((c) => c.name === "e.md")?.metric).toBe("–");
    expect(content.children.find((c) => c.name === "a.tsx")?.metric).toBe("12");
  });
});

describe("languageMix", () => {
  it("shares LOC by extension, folding the tail into other", () => {
    expect(languageMix(folderTree())).toBe("tsx 46% · ts 46% · css 4% · other 4%");
  });
});

describe("formatters", () => {
  it("formats bytes and ages compactly", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(39_900)).toBe("39 KB");
    expect(formatBytes(3_500_000)).toBe("3.3 MB");
    const now = 1_000_000_000_000;
    expect(formatAge(0, now)).toBe("");
    expect(formatAge(now / 1000 - 3 * 86400, now)).toBe("3d ago");
    expect(formatAge(now / 1000 - 90 * 60, now)).toBe("2h ago");
  });
});

describe("placeFloating", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 260, height: 200 };

  it("sits below-right of the pointer when there is room", () => {
    expect(placeFloating({ x: 100, y: 100 }, size, viewport)).toEqual({ left: 112, top: 112 });
  });

  it("flips left near the right edge and up near the bottom edge", () => {
    expect(placeFloating({ x: 900, y: 700 }, size, viewport)).toEqual({ left: 628, top: 488 });
  });

  it("stays inside the viewport when neither side fits", () => {
    const tall = { width: 260, height: 900 };
    expect(placeFloating({ x: 100, y: 400 }, tall, viewport).top).toBe(4);
  });
});

describe("N/A and witness in the coloring metric line", () => {
  const tree = () =>
    d3.hierarchy({
      name: "src",
      type: "folder",
      path: "/r/src",
      metrics: { loc: 300 },
      children: [
        {
          name: "jobs.py",
          type: "file",
          path: "/r/src/jobs.py",
          metrics: {
            loc: 100,
            complexity: 6,
            complexity_witness: { path: "/r/src/jobs.py::schedule::backoff", name: "backoff", start_line: 5, end_line: 12 },
          },
        },
        {
          name: "huge.ts",
          type: "file",
          path: "/r/src/huge.ts",
          metrics: { loc: 200, complexity: null, analysis_status: "too_large", na_reason: "Skipped: 2.1 MB is over the limit" },
        },
      ],
    } as any);

  it("names the function behind a file's max complexity", () => {
    const [jobs] = tree().children!;
    expect(buildTooltipContent(jobs, "complexity").primary).toMatchObject({ value: "6", witness: "backoff · L5" });
  });

  it("shows N/A with its reason instead of a 0, and leaves N/A siblings out of ranks", () => {
    const [jobs, huge] = tree().children!;
    expect(buildTooltipContent(huge, "complexity").primary).toMatchObject({
      value: "N/A",
      rank: "Skipped: 2.1 MB is over the limit",
      witness: "",
    });
    expect(siblingRank(jobs, "complexity")).toBe("");
  });
});
