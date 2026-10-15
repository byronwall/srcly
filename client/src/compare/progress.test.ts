import { describe, expect, it } from "vitest";
import { stepText } from "./CompareProgress";

describe("stepText", () => {
  it("names a cache hit", () => {
    expect(stepText({ cache: 0.04 })).toBe("cached 0.0s");
  });
  it("lists cold-side steps and drops a trivial cache miss", () => {
    expect(stepText({ cache: 0.001, checkout: 0.42, scan: 12.4, graph: 2.06, cleanup: 0.1 })).toBe(
      "checkout 0.4s · scan 12s · graph 2.1s · cleanup 0.1s"
    );
  });
  it("is empty without timings", () => {
    expect(stepText(undefined)).toBe("");
  });
});
