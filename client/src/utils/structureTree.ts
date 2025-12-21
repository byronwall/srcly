export type StructureNode = {
  name?: string;
  type?: string;
  start_line?: number;
  end_line?: number;
  children?: unknown[];
  [key: string]: unknown;
};

function coerceLineNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

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
      const cs = coerceLineNumber((c as any)?.start_line);
      const ce = coerceLineNumber((c as any)?.end_line);
      if (!c || cs === null || ce === null) {
        return best;
      }

      const contains = cs <= s && ce >= e;
      if (!contains) return best;
      if (!best) return c;

      const bs = coerceLineNumber((best as any)?.start_line);
      const be = coerceLineNumber((best as any)?.end_line);
      if (bs === null || be === null) return c;

      const bestSpan = be - bs;
      const cSpan = ce - cs;
      if (cSpan < bestSpan) return c;
      if (cSpan > bestSpan) return best;

      const bestExact = bs === s && be === e;
      const cExact = cs === s && ce === e;
      if (cExact !== bestExact) return cExact ? c : best;

      return best;
    }, null);

    if (!bestMatch) break;

    const currS = coerceLineNumber((current as any)?.start_line);
    const currE = coerceLineNumber((current as any)?.end_line);
    const matchS = coerceLineNumber((bestMatch as any)?.start_line);
    const matchE = coerceLineNumber((bestMatch as any)?.end_line);

    const currentSpan =
      currS !== null && currE !== null ? currE - currS : Number.POSITIVE_INFINITY;
    const matchSpan =
      matchS !== null && matchE !== null ? matchE - matchS : Number.POSITIVE_INFINITY;

    // Avoid drifting into wrapper/equal-span nodes: prefer strictly narrower matches.
    // However, some analyzers emit wrapper nodes whose span equals the parent (e.g. a
    // single top-level container). In that case, allow descending *only if* doing so
    // exposes a strictly narrower descendant that still contains the selection.
    if (matchSpan > currentSpan) break;
    if (matchSpan === currentSpan) {
      const nextChildren = getEffectiveChildren(bestMatch);
      const hasNarrowerDescendant = nextChildren.some((c: any) => {
        const cs = coerceLineNumber(c?.start_line);
        const ce = coerceLineNumber(c?.end_line);
        if (!c || cs === null || ce === null) return false;
        const contains = cs <= s && ce >= e;
        if (!contains) return false;
        const span = ce - cs;
        return span < matchSpan;
      });
      if (!hasNarrowerDescendant) break;
    }

    path.push(bestMatch);
    current = bestMatch;
  }

  return path;
}

export function getActiveStructureNode(path: any[], fallback: unknown): any {
  return path.length > 0 ? path[path.length - 1] : (fallback as any);
}

function nodeKey(n: any): string {
  if (!n) return "";
  return `${n?.type ?? ""}|${n?.name ?? ""}|${n?.start_line ?? ""}|${n?.end_line ?? ""}`;
}

function sameNode(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Fallback for cases where nodes are structurally identical but not the same reference.
  return nodeKey(a) !== "" && nodeKey(a) === nodeKey(b);
}

export function findPathToNode(root: unknown, target: unknown): any[] | null {
  if (!root || !target) return null;

  const path: any[] = [];
  const visited = new Set<any>();

  const dfs = (node: any): boolean => {
    if (!node || visited.has(node)) return false;
    visited.add(node);

    if (sameNode(node, target)) {
      path.push(node);
      return true;
    }

    const children = getEffectiveChildren(node);
    for (const child of children) {
      if (dfs(child)) {
        path.push(node);
        return true;
      }
    }

    return false;
  };

  const found = dfs(root as any);
  if (!found) return null;
  return path.reverse();
}


