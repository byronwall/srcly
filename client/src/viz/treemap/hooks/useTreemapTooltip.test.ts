import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { buildTooltipContent, notAnalyzedLines, placeFloating, topChildren } from "./useTreemapTooltip";

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
  type: "function",
  metrics: { loc },
  children: [],
  ...extra,
});

function fileNode() {
  const file = {
    name: "pipeline.py",
    type: "file",
    metrics: { loc: 0, complexity: 7, comment_density: 0.25, max_nesting_depth: 2, python_import_count: 9 },
    children: [
      scope("(imports)", 9),
      scope("small", 3),
      scope("run_pipeline", 120),
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
    const { children, more } = topChildren(fileNode());
    expect(children.map((c) => c.name)).toEqual(["run_pipeline", "(class) Runner", "b", "c", "a"]);
    expect(children[1].loc).toBe(80);
    expect(more).toBe(1);
  });
});

describe("buildTooltipContent", () => {
  it("summarizes a file with its scopes, imports and tabular metrics", () => {
    const content = buildTooltipContent(fileNode(), "complexity");
    expect(content.subtitle).toBe("file · 7 scopes");
    expect(content.childrenLabel).toBe("Largest scopes");
    expect(content.lines).toContainEqual({ label: "Imports", value: "9" });
    expect(content.lines).toContainEqual({ label: "Comments", value: "25%" });
    expect(content.lines.some((l) => l.label === "TODOs")).toBe(false);
  });

  it("shows a scope's line range and its nested scopes", () => {
    const runner = fileNode().children!.find((c) => c.data.name === "(class) Runner")!;
    runner.data.start_line = 10;
    runner.data.end_line = 89;
    const content = buildTooltipContent(runner, "complexity");
    expect(content.subtitle).toBe("function · L10–89");
    expect(content.children.map((c) => c.name)).toEqual(["go"]);
  });

  it("adds the coloring metric when it isn't a standard line", () => {
    const content = buildTooltipContent(fileNode(), "python_import_count");
    expect(content.lines.filter((l) => l.value === "9")).toHaveLength(2);
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
