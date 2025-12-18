import { describe, expect, it } from "vitest";
import { computeDisplaySlice } from "./lineRange";

describe("computeDisplaySlice", () => {
  it("returns full file when line filter is disabled", () => {
    const text = ["a", "b", "c"].join("\n");
    const res = computeDisplaySlice({
      text,
      useLineFilter: false,
      target: { start: 2, end: 2 },
      offset: 3,
    });
    expect(res.start).toBe(1);
    expect(res.end).toBe(3);
    expect(res.totalLines).toBe(3);
    expect(res.displayText).toBe(text);
    expect(res.linesToDisplay).toEqual(["a", "b", "c"]);
  });

  it("clamps and slices with offset", () => {
    const text = ["1", "2", "3", "4", "5"].join("\n");
    const res = computeDisplaySlice({
      text,
      useLineFilter: true,
      target: { start: 2, end: 3 },
      offset: 10,
    });
    expect(res.start).toBe(1);
    expect(res.end).toBe(5);
    expect(res.linesToDisplay).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("handles negative/float offset", () => {
    const text = ["1", "2", "3", "4"].join("\n");
    const res = computeDisplaySlice({
      text,
      useLineFilter: true,
      target: { start: 3, end: 3 },
      offset: -2.5,
    });
    expect(res.start).toBe(3);
    expect(res.end).toBe(3);
    expect(res.displayText).toBe("3");
  });

  it("falls back to full file for inverted ranges after clamping", () => {
    const text = ["1", "2", "3"].join("\n");
    const res = computeDisplaySlice({
      text,
      useLineFilter: true,
      target: { start: 10, end: 11 },
      offset: 0,
    });
    expect(res.start).toBe(1);
    expect(res.end).toBe(3);
    expect(res.displayText).toBe(text);
  });
});


