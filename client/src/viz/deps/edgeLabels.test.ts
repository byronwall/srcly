import { describe, expect, it } from "vitest";
import { labelSize, placeEdgeLabels } from "./edgeLabels";

const box = (x: number, y: number, width = 120, height = 60) => ({ x, y, width, height });
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("edge labels never cover a box (T22)", () => {
  it("puts a label on the longest clear segment, above the line", () => {
    const edges = [{ id: "e1", label: "projects[*].name", points: [{ x: 120, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 150 }, { x: 300, y: 150 }] }];
    const placed = placeEdgeLabels(edges, [box(0, 0), box(300, 120)]);
    const at = placed.get("e1")!;
    expect(at).toBeDefined();
    // The vertical run is the longest: the label sits beside it.
    expect(at.x).toBeGreaterThan(200);
    expect(overlaps(at.box, box(0, 0))).toBe(false);
    expect(overlaps(at.box, box(300, 120))).toBe(false);
  });

  it("drops a label that has no clear spot instead of covering a box", () => {
    // A short edge between two boxes that touch: nothing fits anywhere.
    const edges = [{ id: "e1", label: "rows[*].title", points: [{ x: 120, y: 30 }, { x: 124, y: 30 }] }];
    expect(placeEdgeLabels(edges, [box(0, 0), box(124, 0)]).has("e1")).toBe(false);
  });

  it("keeps two labels on the same run apart, and skips edges without a label", () => {
    const run = [{ x: 0, y: 100 }, { x: 400, y: 100 }];
    const placed = placeEdgeLabels(
      [
        { id: "a", label: "projects[*].id", points: run },
        { id: "b", label: "projects[*].ownerName", points: run },
        { id: "c", label: undefined, points: run },
      ],
      [],
    );
    expect(placed.size).toBe(2);
    expect(overlaps(placed.get("a")!.box, placed.get("b")!.box)).toBe(false);
    expect(placed.get("a")!.y).toBeLessThan(100);
    expect(placed.get("b")!.y).toBeGreaterThan(100);
  });

  it("sizes a label by its text", () => {
    expect(labelSize("ab").width).toBeLessThan(labelSize("projects[*].ownerName").width);
  });
});
