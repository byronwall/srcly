// Edge label placement (T22): a field label sits beside its edge where it
// covers no box and no other label. Candidates are the midpoints of the
// edge's segments, longest first, nudged above then below the line; a label
// with no clear spot is not drawn (the edge's card still names the field,
// and hovering the edge shows it). Pure, so a test can check every placed
// label against every box.

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelPlacement {
  x: number;
  y: number;
  /** The label's rectangle, for the next label to avoid. */
  box: LabelBox;
}

/** A 10px label's size: wide enough for the text, with the halo the stroke paints. */
export const LABEL_FONT_PX = 10;
const CHAR_W = 5.6;
const LABEL_H = 13;
/** How far from the line the label's baseline sits. */
const LIFT = 4;
/** Boxes get this much breathing room around them. */
const MARGIN = 2;

export function labelSize(text: string): { width: number; height: number } {
  return { width: Math.max(10, text.length * CHAR_W + 4), height: LABEL_H };
}

function intersects(a: LabelBox, b: LabelBox, margin = 0): boolean {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x && a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}

/**
 * Where each labeled edge's text goes, by edge id; an edge with no clear
 * spot is absent. `edges` are tried in the order given, so earlier labels
 * win the better spots.
 */
export function placeEdgeLabels(
  edges: readonly { id: string; label: string | undefined; points: readonly { x: number; y: number }[] }[],
  boxes: readonly LabelBox[],
): Map<string, LabelPlacement> {
  const placed = new Map<string, LabelPlacement>();
  const taken: LabelBox[] = [];
  for (const edge of edges) {
    if (!edge.label || edge.points.length < 2) continue;
    const size = labelSize(edge.label);
    const segments = [];
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      segments.push({ len: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vertical: Math.abs(b.x - a.x) < Math.abs(b.y - a.y) });
    }
    segments.sort((p, q) => q.len - p.len);
    let found: LabelPlacement | null = null;
    for (const seg of segments) {
      // Above, then below a horizontal run; right, then left of a vertical one.
      const spots = seg.vertical
        ? [{ x: seg.x + LIFT + size.width / 2, y: seg.y + LABEL_H / 2 - 3 }, { x: seg.x - LIFT - size.width / 2, y: seg.y + LABEL_H / 2 - 3 }]
        : [{ x: seg.x, y: seg.y - LIFT }, { x: seg.x, y: seg.y + LIFT + LABEL_H - 3 }];
      for (const spot of spots) {
        const box = { x: spot.x - size.width / 2, y: spot.y - LABEL_H + 3, width: size.width, height: LABEL_H };
        if (boxes.some((b) => intersects(box, b, MARGIN)) || taken.some((t) => intersects(box, t))) continue;
        found = { x: spot.x, y: spot.y, box };
        break;
      }
      if (found) break;
    }
    if (found) {
      placed.set(edge.id, found);
      taken.push(found.box);
    }
  }
  return placed;
}
