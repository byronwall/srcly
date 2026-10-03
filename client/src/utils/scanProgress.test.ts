import { describe, expect, it } from "vitest";
import { emptySnapshot, type ScanSnapshot } from "../services/scanJobs";
import { describeScan, formatDuration, relativeToRoot } from "./scanProgress";

function snap(overrides: Partial<ScanSnapshot>): ScanSnapshot {
  return { ...emptySnapshot("job", "/repo"), ...overrides };
}

describe("describeScan", () => {
  it("is indeterminate while discovering", () => {
    const view = describeScan(snap({ phase: "discovering", files_discovered: 1200 }));
    expect(view.fraction).toBeNull();
    expect(view.detail).toBe("1,200 files found so far");
    expect(view.steps.map((s) => s.state)).toEqual(["active", "pending", "pending"]);
  });

  it("reports a fraction, relative path, and ETA while analyzing", () => {
    const view = describeScan(
      snap({
        phase: "analyzing",
        files_done: 50,
        files_total: 200,
        elapsed_seconds: 10,
        current_path: "/repo/src/app.ts",
      })
    );
    expect(view.fraction).toBe(0.25);
    expect(view.headline).toBe("Analyzing 50 of 200 files");
    expect(view.detail).toBe("src/app.ts");
    expect(view.etaSeconds).toBe(30);
    expect(view.steps.map((s) => s.state)).toEqual(["done", "active", "pending"]);
  });

  it("explains worker start-up and calls out slow files", () => {
    const starting = describeScan(snap({ phase: "analyzing", files_total: 10 }));
    expect(starting.detail).toBe("Starting analysis workers…");
    expect(starting.slowFile).toBeNull();

    const stalled = describeScan(
      snap({
        phase: "analyzing",
        files_done: 9,
        files_total: 10,
        in_progress: [{ path: "/repo/vendor/huge.js", running_seconds: 6.2 }],
      })
    );
    expect(stalled.slowFile).toEqual({ path: "vendor/huge.js", seconds: 6.2 });
    expect(stalled.etaSeconds).toBeNull();
  });

  it("withholds the ETA until there is enough signal", () => {
    const view = describeScan(
      snap({ phase: "analyzing", files_done: 3, files_total: 200, elapsed_seconds: 0.5 })
    );
    expect(view.etaSeconds).toBeNull();
  });

  it("treats an empty analysis as finished", () => {
    expect(describeScan(snap({ phase: "analyzing", files_total: 0 })).fraction).toBe(1);
  });

  it("marks every step done when complete", () => {
    const view = describeScan(
      snap({ phase: "complete", files_total: 1727, elapsed_seconds: 3.9 })
    );
    expect(view.detail).toBe("1,727 files in 4s");
    expect(view.steps.every((s) => s.state === "done")).toBe(true);
  });

  it("surfaces the error when failed", () => {
    expect(describeScan(snap({ phase: "failed", error: "boom" })).detail).toBe("boom");
  });
});

describe("formatDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(4.4)).toBe("4s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(95)).toBe("1m 35s");
  });
});

describe("relativeToRoot", () => {
  it("strips the root prefix and keeps foreign paths", () => {
    expect(relativeToRoot("/repo/a/b.ts", "/repo")).toBe("a/b.ts");
    expect(relativeToRoot("/repo", "/repo")).toBe(".");
    expect(relativeToRoot("/other/x.ts", "/repo")).toBe("/other/x.ts");
    expect(relativeToRoot(null, "/repo")).toBe("");
  });
});
