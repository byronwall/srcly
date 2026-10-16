// Visual encodings shared by the dependency canvas and its legend, so the
// legend always draws exactly what the graph draws.

/** Dash for context edges (neighbor ↔ neighbor, or inside a focused folder). */
export const CONTEXT_EDGE_DASH = "3 3";
export const CONTEXT_EDGE_OPACITY = 0.35;
/** Edges stay quieter than boxes: the boxes carry the information. */
export const EDGE_OPACITY = 0.62;
/** Dash for an external package's box border. */
export const EXTERNAL_BOX_DASH = "4 2";

/** Edge thickness grows with the number of imports it carries. */
export function edgeStrokeWidth(weight: number, faint: boolean): number {
  if (faint) return 1;
  return Math.min(3.5, 1.1 + Math.log2(weight) * 0.6);
}
