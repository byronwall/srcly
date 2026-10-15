import { describe, expect, it } from "vitest";
import type { BranchSource, PrSource, WorktreeSource } from "./api";
import { matches, pickBranch, pickPr, pickWorktree, prFields, prNumberOf, refText, shortAgo, tildePath } from "./pickerModel";

const pr = { number: 1922, title: "Build reuse", headRefName: "codex/concurrency-05", baseRefName: "codex/concurrency-04", author: "me" } as PrSource;

describe("picks", () => {
  it("a PR compares pr:n against pr:n", () => {
    expect(pickPr(pr)).toEqual({ base: "pr:1922", head: "pr:1922" });
    expect(prNumberOf(pickPr(pr))).toBe(1922);
    expect(prNumberOf({ base: "auto", head: "pr:3" })).toBeNull();
  });
  it("a branch or another worktree uses the auto base", () => {
    expect(pickBranch({ name: "origin/x" } as BranchSource)).toEqual({ base: "auto", head: "origin/x" });
    expect(pickWorktree({ path: "/w/feat", branch: "feat", sha: "abc", current: false } as WorktreeSource)).toEqual({
      base: "auto",
      head: "worktree:/w/feat",
    });
    expect(pickWorktree({ branch: "main", sha: "abc", current: true } as WorktreeSource)).toEqual({ base: "auto", head: "WORKTREE" });
  });
});

describe("matches", () => {
  it("needs every token, in any field, case-insensitively", () => {
    expect(matches("", prFields(pr))).toBe(true);
    expect(matches("#1922", prFields(pr))).toBe(true);
    expect(matches("REUSE concurrency-05", prFields(pr))).toBe(true);
    expect(matches("reuse nope", prFields(pr))).toBe(false);
  });
});

describe("labels", () => {
  it("shortAgo", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(shortAgo("2026-10-15T11:59:30Z", now)).toBe("now");
    expect(shortAgo("2026-10-15T09:00:00Z", now)).toBe("3h");
    expect(shortAgo(now / 1000 - 3 * 86400, now)).toBe("3d");
    expect(shortAgo(null, now)).toBe("");
  });
  it("tildePath and refText", () => {
    expect(tildePath("/Users/byron/Projects/srcly")).toBe("~/Projects/srcly");
    expect(tildePath("/opt/x")).toBe("/opt/x");
    expect(refText("pr:12")).toBe("#12");
    expect(refText("WORKTREE")).toBe("working tree");
    expect(refText("a".repeat(40))).toBe("aaaaaaa");
    expect(refText("worktree:/Users/me/wt/feat-x")).toBe("worktree feat-x");
  });
});
