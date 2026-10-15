import { describe, expect, it } from "vitest";
import { buildRows, collectFiles, indexFiles } from "./rows";
import type { CompareFile, TreeNode } from "./types";

const change = (path: string, status: CompareFile["status"], delta = 0): CompareFile => ({
  path,
  status,
  additions: 1,
  deletions: 0,
  analyzed: true,
  before: null,
  after: null,
  deltas: delta ? { complexity: { before: 1, after: 1 + delta, delta, verdict: delta > 0 ? "worse" : "better" } } : {},
});

const file = (path: string, loc = 1): TreeNode => ({ name: path, type: "file", path, metrics: { loc } });

const headTree: TreeNode = {
  name: "root",
  type: "folder",
  path: "",
  metrics: {},
  children: [
    { name: "src", type: "folder", path: "src", metrics: {}, children: [file("src/a.ts"), file("src/b.ts"), file("src/keep.ts", 9)] },
    { name: "other", type: "folder", path: "other", metrics: {}, children: [file("other/x.ts")] },
  ],
};

const none = { showUnchanged: false, sortMetric: null, collapsed: new Set<string>() };

describe("compare rows", () => {
  it("shows only changed files under their folders by default", () => {
    const files = collectFiles([change("src/a.ts", "modified"), change("src/b.ts", "added")], indexFiles(headTree), false);
    const rows = buildRows(files, none);
    // A lone top-level folder is still a row so its counts are visible.
    expect(rows.map((r) => `${r.kind}:${r.name}:${r.depth}`)).toEqual(["folder:src:0", "file:a.ts:1", "file:b.ts:1"]);
    expect(rows[0]).toMatchObject({ changed: 2, statusCounts: { added: 1, modified: 1 } });
  });

  it("adds unchanged siblings only in folders with changes", () => {
    const files = collectFiles([change("src/a.ts", "modified")], indexFiles(headTree), true);
    const paths = buildRows(files, none).filter((r) => r.kind === "file").map((r) => r.path);
    expect(paths).toEqual(["src/a.ts", "src/b.ts", "src/keep.ts"]);
    expect(paths).not.toContain("other/x.ts");
  });

  it("collapses single-child folder chains and honors collapsed folders", () => {
    const files = collectFiles([change("server/app/services/x.py", "modified"), change("server/app/run.py", "modified")], new Map(), false);
    const rows = buildRows(files, none);
    expect(rows.map((r) => r.name)).toEqual(["server/app", "services", "x.py", "run.py"]);
    const collapsed = buildRows(files, { ...none, collapsed: new Set(["server/app"]) });
    expect(collapsed.map((r) => r.name)).toEqual(["server/app"]);
  });

  it("sorts flat by absolute delta when a metric is chosen", () => {
    const files = collectFiles(
      [change("a.ts", "modified", 1), change("b/c.ts", "modified", -5), change("d.ts", "added")],
      new Map(),
      false
    );
    const rows = buildRows(files, { ...none, sortMetric: "complexity" });
    expect(rows.map((r) => r.name)).toEqual(["b/c.ts", "a.ts", "d.ts"]);
  });
});
