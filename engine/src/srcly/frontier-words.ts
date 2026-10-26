// How the anchor graph words a frontier: clipped labels, and one folded stop for an element limit.
import type { EvidenceGap } from "../analysis/scope-seam";

/** One line, at most `max` characters. */
export function clip(text: string, max = 120): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/**
 * The label and note of the one frontier a slice's size limits fold into:
 * how many places the walk did not take, which limits stopped it, and the
 * first few places by name (from the element, else from the slice's own
 * "… limit reached before …").
 */
export function foldedLimit(limited: readonly EvidenceGap[], labelOf: (id: string | null | undefined) => string | undefined, limits: { maxElements: number; maxDepth: number }): { label: string; note: string } {
  const names = limited.map((gap) => labelOf(gap.to) ?? / before (.*)\.$/s.exec(gap.label)?.[1]).filter((name): name is string => Boolean(name));
  const distinct = [...new Set(names)];
  const listed = distinct.length ? distinct.slice(0, 6).map((name) => clip(name, 40)).join(", ") + (distinct.length > 6 ? ", …" : "") : "what comes next";
  const hit = (pattern: RegExp) => limited.some((gap) => pattern.test(gap.label));
  const stops = [
    hit(/^Element limit/) ? `${limits.maxElements} elements` : null,
    hit(/^Depth limit/) ? `${limits.maxDepth} steps deep` : null,
    hit(/^(Traversal budget|Additional indexed relations|Relation limit|Terminal limit)/) ? "its work budget" : null,
  ].filter(Boolean);
  return {
    label: limited.length > 1 ? `${limited.length} places not followed` : clip(names[0] ?? limited[0].label),
    note: `The walk stops at ${stops.join(" and ") || "its size limits"}; it did not follow ${listed}.`,
  };
}
