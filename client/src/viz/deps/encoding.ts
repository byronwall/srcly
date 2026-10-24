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

// Data flow mode (see `flow/FlowLegend.tsx`).
/** A handoff: an origin proven to reach a render site. */
export const HANDOFF_EDGE_DASH = "6 4";
/** A primitive rolled into its parent frame (an external or hidden wrapper). */
export const DOTTED_BOX_DASH = "1.5 2.5";
/** A frontier: where the proof stops. */
export const FRONTIER_BOX_DASH = "7 3";
