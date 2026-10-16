import { createSignal } from "solid-js";

/** Which panel the pointer is over; each panel only echoes the other's hover. */
export type HoverSource = "explorer" | "treemap";

const [linkedHover, setLinkedHover] = createSignal<{ path: string; source: HoverSource } | null>(null);

/**
 * Report that `source` now hovers `path` (or nothing). Clearing only clears
 * this source's own hover, so a late leave event from one panel can't wipe
 * a hover the other panel just set.
 */
export function setHoverFrom(source: HoverSource, path: string | null | undefined) {
  if (path) {
    const current = linkedHover();
    if (current?.path !== path || current.source !== source) setLinkedHover({ path, source });
    return;
  }
  if (linkedHover()?.source === source) setLinkedHover(null);
}

/** The path hovered in the *other* panel, for `viewer` to highlight. */
export function linkedPathFor(viewer: HoverSource): string | null {
  const current = linkedHover();
  return current && current.source !== viewer ? current.path : null;
}

/** True when `ancestor` is `path` itself or contains it (folders by "/", scopes by "::"). */
export function isSameOrAncestor(ancestor: string, path: string): boolean {
  return (
    path === ancestor ||
    path.startsWith(`${ancestor}/`) ||
    path.startsWith(`${ancestor}::`)
  );
}

/**
 * The candidate that best stands in for `target`: the target itself, or else
 * its deepest shown ancestor (so a collapsed folder or a tile too small to
 * draw still lights up its container).
 */
export function nearestLinked<T>(
  candidates: Iterable<T>,
  target: string | null,
  pathOf: (item: T) => string | undefined
): T | null {
  if (!target) return null;
  let best: T | null = null;
  let bestLength = -1;
  for (const item of candidates) {
    const path = pathOf(item);
    if (!path || path.length <= bestLength || !isSameOrAncestor(path, target)) continue;
    best = item;
    bestLength = path.length;
  }
  return best;
}
