import { describe, expect, it } from "vitest";
import { groupHits, hitsInRange, lineDecorations, markersFor, stepHit } from "./metricMarkers";

const m = (line: number, note = "", end_line = line) => ({ line, end_line, note });

describe("metricMarkers", () => {
  it("merges markers on one line and collapses repeated notes", () => {
    const hits = groupHits([m(9, "&&"), m(3, "if"), m(9, "&&"), m(9, "?:")]);
    expect(hits).toEqual([
      { line: 3, endLine: 3, notes: ["if"] },
      { line: 9, endLine: 9, notes: ["&& ×2", "?:"] },
    ]);
  });

  it("locates average complexity with the complexity markers", () => {
    const markers = { complexity: [m(1, "if")] };
    expect(markersFor(markers, "complexity_avg")).toHaveLength(1);
    expect(markersFor(markers, "loc")).toEqual([]);
    expect(markersFor(null, "complexity")).toEqual([]);
  });

  it("keeps hits that overlap the range, including spans that start before it", () => {
    const hits = groupHits([m(2, "", 6), m(10), m(20)]);
    expect(hitsInRange(hits, 5, 12).map((h) => h.line)).toEqual([2, 10]);
  });

  it("steps forward and back, wrapping at the ends", () => {
    const hits = groupHits([m(5), m(10), m(15)]);
    expect(stepHit(hits, null, 1)?.line).toBe(5);
    expect(stepHit(hits, null, -1)?.line).toBe(15);
    expect(stepHit(hits, 10, 1)?.line).toBe(15);
    expect(stepHit(hits, 15, 1)?.line).toBe(5);
    expect(stepHit(hits, 5, -1)?.line).toBe(15);
    expect(stepHit(hits, 12, -1)?.line).toBe(10);
    expect(stepHit([], 1, 1)).toBeNull();
  });

  it("decorates every line a span covers, with the note on the first", () => {
    const deco = lineDecorations(groupHits([m(4, "comment", 6)]));
    expect([...deco.entries()]).toEqual([
      [4, { note: "comment", first: true }],
      [5, { note: "", first: false }],
      [6, { note: "", first: false }],
    ]);
  });
});
