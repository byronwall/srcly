import { describe, expect, it } from "vitest";
import { notAnalyzedLines } from "./useTreemapTooltip";

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
