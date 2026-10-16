import { describe, expect, it } from "vitest";
import { applicableMetrics, languageForPath, metricSections } from "./metricApplicability";

const ids = (path: string, isScope: boolean) => applicableMetrics(path, isScope).map((d) => d.id);

describe("languageForPath", () => {
  it("mirrors the server's analyzer dispatch", () => {
    expect(languageForPath("/r/a.tsx")).toBe("tsx");
    expect(languageForPath("/r/a.ts")).toBe("ts");
    expect(languageForPath("/r/a.py::run")).toBe("python");
    expect(languageForPath("/r/README.md")).toBe("markdown");
    expect(languageForPath("/r/x.scss")).toBe("css");
    expect(languageForPath("/r/x.go")).toBe("code");
    expect(languageForPath("/r/.gitignore")).toBe("text");
    expect(languageForPath("/r/build.sh")).toBe("text");
  });
});

describe("applicableMetrics", () => {
  it("gives a Python file general code metrics and Python imports, no TS, components or Markdown", () => {
    const file = ids("/r/pipeline.py", false);
    expect(file).toEqual(
      expect.arrayContaining(["loc", "file_size", "complexity", "complexity_avg", "comment_noise", "max_nesting_depth", "parameter_count", "todo_count", "python_import_count"])
    );
    expect(file.some((id) => id.startsWith("ts") || id.startsWith("md_") || id.startsWith("component_"))).toBe(false);
  });

  it("keeps only per-scope metrics for a Python function", () => {
    expect(ids("/r/pipeline.py", true)).toEqual([
      "complexity",
      "loc",
      "comment_noise",
      "max_nesting_depth",
      "parameter_count",
      "todo_count",
      "comment_noise_ratio",
      "comment_noise_docblock",
      "comment_noise_commented_code",
      "comment_lines",
    ]);
  });

  it("gives a TSX file the component metrics, and a plain TS file none of them", () => {
    expect(ids("/r/View.tsx", false)).toEqual(expect.arrayContaining(["component_hook_count", "ts_import_coupling_count"]));
    expect(ids("/r/View.tsx", true)).toContain("component_effect_count");
    const ts = ids("/r/util.ts", false);
    expect(ts).toContain("ts_any_usage_count");
    expect(ts.some((id) => id.startsWith("component_"))).toBe(false);
  });

  it("keeps Types/Interfaces as the only TS metric measured per scope", () => {
    const scope = ids("/r/View.tsx", true);
    expect(scope.filter((id) => id.startsWith("ts"))).toEqual(["ts_type_interface_count"]);
  });

  it("gives Markdown only size and its own metric", () => {
    expect(ids("/r/README.md", false)).toEqual(["loc", "file_size", "md_data_url_count"]);
    expect(ids("/r/README.md", true)).toEqual(["loc", "md_data_url_count"]);
  });

  it("gives plain-text files a line count and size", () => {
    expect(ids("/r/deploy.yml", false)).toEqual(["loc", "file_size"]);
  });
});

describe("metricSections", () => {
  const fileNode = { metrics: { loc: 300, file_size: 9000, complexity: 12, complexity_avg: 2.5, python_import_count: 7, todo_count: 0 } };
  const scopeNode = { metrics: { loc: 40, complexity: 6, todo_count: 0, file_size: 0, python_import_count: 0 } };

  it("groups Size · Complexity · Comments · Detail with scope beside file", () => {
    const sections = metricSections("/r/pipeline.py", fileNode, scopeNode);
    expect(sections.map((s) => s.title)).toEqual(["Size", "Complexity", "Comments", "Detail"]);
    const size = sections[0].rows;
    expect(size.find((r) => r.id === "loc")).toMatchObject({ scope: 40, file: 300 });
    // File-only metrics leave the scope cell empty instead of showing a fake 0.
    expect(size.find((r) => r.id === "file_size")).toMatchObject({ scope: undefined, file: 9000 });
    expect(sections[3].rows.find((r) => r.id === "python_import_count")).toEqual({ id: "python_import_count", label: "Python Imports", scope: undefined, file: 7 });
  });

  it("still shows an applicable 0", () => {
    const todos = metricSections("/r/pipeline.py", fileNode, scopeNode)[3].rows.find((r) => r.id === "todo_count");
    expect(todos).toMatchObject({ scope: 0, file: 0 });
  });

  it("has no scope values when only the file is open", () => {
    const rows = metricSections("/r/pipeline.py", fileNode, null).flatMap((s) => s.rows);
    expect(rows.every((r) => r.scope === undefined)).toBe(true);
  });
});
