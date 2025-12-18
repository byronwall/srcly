export type StructureNode = {
  name?: string;
  type?: string;
  start_line?: number;
  end_line?: number;
  children?: unknown[];
  [key: string]: unknown;
};

export function isSyntheticBodyNode(node: unknown): boolean {
  const n = node as any;
  return (
    n?.name === "(body)" || n?.type === "function_body" || n?.type === "file_body"
  );
}

export function getEffectiveChildren(node: unknown): any[] {
  const n = node as any;
  if (!n || !Array.isArray(n.children)) return [];

  // The backend/treemap pipeline uses "(body)" as a *synthetic leaf* that represents
  // leftover LOC, not a container for real structure. For the Structure panel we
  // want to hide it, not unwrap into its (usually empty) children.
  const structural = n.children.filter((c: any) => !isSyntheticBodyNode(c));

  // Defensive: if some analyzer ever wraps real structure inside a synthetic body container,
  // only then treat it as a container.
  if (structural.length === 0) {
    const bodyContainer = n.children.find(
      (c: any) =>
        isSyntheticBodyNode(c) && Array.isArray(c.children) && c.children.length > 0
    );
    if (bodyContainer) {
      return bodyContainer.children.filter((c: any) => !isSyntheticBodyNode(c));
    }
  }

  return structural;
}

export function computeBreadcrumbPath(
  root: unknown,
  selection: { start: number; end: number } | null
): any[] {
  if (!root) return [];
  if (!selection) return [root];

  const s = selection.start;
  const e = selection.end;

  const path: any[] = [root];
  let current: any = root;

  let iterations = 0;
  while (iterations < 100) {
    iterations++;
    const children = getEffectiveChildren(current);
    if (!children?.length) break;

    const bestMatch = children.reduce((best: any, c: any) => {
      if (!c || typeof c.start_line !== "number" || typeof c.end_line !== "number") {
        return best;
      }

      const contains = c.start_line <= s && c.end_line >= e;
      if (!contains) return best;
      if (!best) return c;

      const bestSpan = best.end_line - best.start_line;
      const cSpan = c.end_line - c.start_line;
      if (cSpan < bestSpan) return c;
      if (cSpan > bestSpan) return best;

      const bestExact = best.start_line === s && best.end_line === e;
      const cExact = c.start_line === s && c.end_line === e;
      if (cExact !== bestExact) return cExact ? c : best;

      return best;
    }, null);

    if (!bestMatch) break;

    const currentSpan =
      typeof current?.start_line === "number" && typeof current?.end_line === "number"
        ? current.end_line - current.start_line
        : Number.POSITIVE_INFINITY;
    const matchSpan = bestMatch.end_line - bestMatch.start_line;

    // Avoid drifting into wrapper/equal-span nodes: only descend if the match
    // is strictly narrower than the current node's span.
    if (matchSpan >= currentSpan) break;

    path.push(bestMatch);
    current = bestMatch;
  }

  return path;
}

export function getActiveStructureNode(path: any[], fallback: unknown): any {
  return path.length > 0 ? path[path.length - 1] : (fallback as any);
}


