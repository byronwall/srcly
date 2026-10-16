import { formatAxisValue, type QuadrantAxis, type QuadrantId } from "./quadrants";

/** One hue per quadrant. Both-high reads as the alarm; both-low recedes. */
export const QUADRANT_COLORS: Record<QuadrantId, string> = {
  high_both: "#dc2626",
  high_x: "#ea580c",
  high_y: "#7c3aed",
  low_both: "#94a3b8",
};

/** Where each quadrant sits on the plot (and in the summary grid): x grows right, y grows up. */
export const QUADRANT_GRID: QuadrantId[] = ["high_y", "high_both", "low_both", "high_x"];

/** "40 CCN", "1 commit", "0.16 cmt/LOC". */
export function withUnit(axis: QuadrantAxis, v: number): string {
  if (axis.id === "comment_ratio") return `${v.toFixed(2)} cmt/LOC`;
  return `${formatAxisValue(axis, v)} ${v === 1 ? axis.unit_one : axis.unit}`;
}
