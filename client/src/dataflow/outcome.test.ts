import { describe, expect, it } from "vitest";
import { ASSUMED_LABEL, isAssumedProof, labelFor, outcomeClass } from "./outcome";

describe("outcome words and colors", () => {
  it("names an assumed trace by what happened: it landed, through library code", () => {
    expect(labelFor("assumed")).toBe(ASSUMED_LABEL);
    expect(ASSUMED_LABEL).toBe("Landed · assumes library code");
    expect(labelFor("ok")).toBeNull();
    expect(labelFor("partial")).toMatch(/^Partial/);
  });

  it("colors assumed apart from both ok and partial", () => {
    expect(outcomeClass("ok")).toContain("--plc-success");
    expect(outcomeClass("assumed")).toContain("--plc-assumed");
    expect(outcomeClass("partial")).toContain("--plc-warning");
    expect(new Set([outcomeClass("ok"), outcomeClass("assumed"), outcomeClass("partial")]).size).toBe(3);
  });

  it("treats only the engine's assumed proof kinds as assumed steps", () => {
    expect(isAssumedProof("external-call")).toBe(true);
    expect(isAssumedProof("partial-classification")).toBe(true);
    expect(isAssumedProof("framework-state")).toBe(false);
    expect(isAssumedProof("host-api")).toBe(false);
  });
});
