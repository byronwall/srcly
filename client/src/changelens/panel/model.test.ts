import { describe, expect, it } from "vitest";
import { WORKTREE } from "../types";
import { bucketList, editsByChurn, railPositions, touchMarks } from "./model";
import { samplePayload } from "./sample";

describe("review order", () => {
  const { chunks } = samplePayload;

  it("puts only bucketed chunks in each bucket, highest complexity first", () => {
    const complex = bucketList(chunks, "complex-and-changed");
    expect(complex.every((c) => c.buckets.includes("complex-and-changed"))).toBe(true);
    const before = complex.map((c) => c.metrics.complexity.before!);
    expect(before).toEqual([...before].sort((a, b) => b - a));

    const hot = bucketList(chunks, "new-hotspot");
    const after = hot.map((c) => c.metrics.complexity.after!);
    expect(after).toEqual([...after].sort((a, b) => b - a));
    expect(hot.some((c) => c.status === "added")).toBe(true);
  });

  it("lists every edit by churn and filters by status and file class", () => {
    const all = editsByChurn(chunks, "", "");
    expect(all).toHaveLength(chunks.length);
    const churns = all.map((c) => c.added + c.deleted);
    expect(churns).toEqual([...churns].sort((a, b) => b - a));
    expect(editsByChurn(chunks, "deleted", "").every((c) => c.status === "deleted")).toBe(true);
    expect(editsByChurn(chunks, "", "test").every((c) => c.fileClass === "test")).toBe(true);
    expect(editsByChurn(chunks, "reverted", "docs")).toEqual([]);
  });
});

describe("railPositions", () => {
  it("keeps a burst readable next to a long gap", () => {
    const x = railPositions([
      "2026-11-17T09:00:00Z",
      "2026-11-18T10:00:00Z", // a day later
      "2026-11-18T10:04:00Z", // burst
      "2026-11-18T10:08:00Z",
    ]);
    expect(x[0]).toBe(0);
    expect(x.at(-1)).toBe(1);
    const dayGap = x[1] - x[0];
    const burstGap = x[2] - x[1];
    // A linear scale would make the day gap ~370x the burst gap.
    expect(dayGap / burstGap).toBeLessThan(5);
    expect(burstGap).toBeGreaterThan(0.1);
  });

  it("places one commit in the middle and same-time commits apart", () => {
    expect(railPositions(["2026-11-17T09:00:00Z"])).toEqual([0.5]);
    const same = railPositions(["2026-11-17T09:00:00Z", "2026-11-17T09:00:00Z", "2026-11-17T09:00:00Z"]);
    expect(same).toEqual([0, 0.5, 1]);
  });
});

describe("touchMarks", () => {
  const commits = samplePayload.commits;

  it("places touches on the window's commit order and sizes them by lines", () => {
    const marks = touchMarks(commits, [
      { sha: commits[0].sha, added: 4, deleted: 0 },
      { sha: WORKTREE, added: 30, deleted: 6 },
      { sha: "not-in-window", added: 9, deleted: 9 },
    ]);
    expect(marks.map((m) => [m.index, m.x])).toEqual([
      [0, 0],
      [commits.length - 1, 1],
    ]);
    expect(marks[1].size).toBe(1);
    expect(marks[0].size).toBeCloseTo(Math.sqrt(4 / 36));
  });
});
