// How the anchor graph words a frontier: clipped labels, and one folded stop for an element limit.
import type { EvidenceGap } from "../analysis/scope-seam";

/** One line, at most `max` characters. */
export function clip(text: string, max = 120): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/**
 * The label and note of the one frontier an element limit folds into: how
 * many places the walk did not take, and the first few by name (from the
 * element, else from the slice's own "Element limit reached before …").
 */
export function foldedLimit(limited: readonly EvidenceGap[], labelOf: (id: string | null | undefined) => string | undefined, maxElements: number): { label: string; note: string } {
  const names = limited.map((gap) => labelOf(gap.to) ?? /^Element limit reached before (.*)\.$/s.exec(gap.label)?.[1]).filter((name): name is string => Boolean(name));
  const distinct = [...new Set(names)];
  const listed = distinct.length ? distinct.slice(0, 6).map((name) => clip(name, 40)).join(", ") + (distinct.length > 6 ? ", …" : "") : "what comes next";
  return {
    label: limited.length > 1 ? `${limited.length} places not followed` : clip(names[0] ?? limited[0].label),
    note: `The walk stops at ${maxElements} elements; it did not follow ${listed}.`,
  };
}
