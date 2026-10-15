import { describe, expect, it } from "vitest";
import type { StepCommit } from "./api";
import { activeStep, stepRefs } from "./stepper";

const c = (sha: string, parent: string | null) => ({ sha, short: sha, subject: sha, author: "", date: 0, parent }) as StepCommit;
const commits = [c("a1", "mb"), c("b2", "a1"), c("c3", "b2")];

describe("stepper", () => {
  it("step i compares its parent with itself; the first step starts at the range base", () => {
    expect(stepRefs(commits, "mb", 0)).toEqual({ base: "mb", head: "a1" });
    expect(stepRefs(commits, "mb", 2)).toEqual({ base: "b2", head: "c3" });
  });
  it("finds the step being shown, and -1 for the whole range", () => {
    expect(activeStep(commits, "mb", "mb", "a1")).toBe(0);
    expect(activeStep(commits, "mb", "b2", "c3")).toBe(2);
    expect(activeStep(commits, "mb", "mb", "c3")).toBe(-1);
    expect(activeStep(commits, "mb", null, null)).toBe(-1);
  });
  it("a first commit older than the range base compares against its own parent", () => {
    const merged = [c("a1", "old"), c("m2", "a1")];
    expect(stepRefs(merged, "newer-base", 0)).toEqual({ base: "old", head: "a1" });
    expect(activeStep(merged, "newer-base", "old", "a1")).toBe(0);
  });
});
