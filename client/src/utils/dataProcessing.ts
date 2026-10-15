export function filterNoise(node: any) {
  if (!node.children || node.children.length === 0) return node;

  // Aggressively remove very small functions/code fragments that cause visual noise
  node.children = node.children.filter((child: any) => {
    const isNoiseFile = ["lock", "png", "svg"].some((x) =>
      child.name.includes(x)
    );
    const isTinyFunction =
      child.type !== "folder" && (child.metrics?.loc || 0) < 5;
    return !isNoiseFile && !isTinyFunction;
  });

  // Recurse on filtered children
  node.children.forEach(filterNoise);

  // Recalculate metrics for parents after filtering
  if (node.metrics) {
    node.metrics.loc = node.children.reduce(
      (acc: number, c: any) => acc + (c.metrics?.loc || 0),
      node.type === "file" && node.children.length === 0
        ? node.metrics.loc || 0
        : 0
    );
  }

  return node;
}

export function filterTree(
  node: any,
  query: string,
  excludedPaths: readonly string[] = []
): any {
  if (!node) return null;

  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery && excludedPaths.length === 0) return node;

  const excluded = new Set(excludedPaths);
  const matches = (n: any) =>
    String(n.name ?? "").toLowerCase().includes(lowerQuery);

  function recurse(n: any, isRoot = false): any {
    if (!isRoot && n.path && excluded.has(n.path)) return null;

    const children = Array.isArray(n.children) ? n.children : [];
    if (children.length === 0) {
      if (lowerQuery && !matches(n)) return null;
      return n;
    }

    const filteredChildren: any[] = [];
    let changed = false;
    for (const child of children) {
      const filtered = recurse(child);
      if (filtered) filteredChildren.push(filtered);
      if (filtered !== child) changed = true;
    }

    if (lowerQuery && !matches(n) && filteredChildren.length === 0) return null;
    if (!changed && filteredChildren.length === children.length) return n;
    return { ...n, children: filteredChildren };
  }

  return recurse(node, true);
}

export function findTreeNodeByPath(node: any, path: string): any | null {
  if (!node) return null;
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const found = findTreeNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

export function extractFilePath(
  rawPath: string | undefined,
  type: string | undefined
) {
  if (!rawPath) return null;
  if (type === "folder") {
    return null;
  }
  const [filePath] = rawPath.split("::");
  return filePath || null;
}

export interface FilterOptions {
  extensions?: string[];
  maxLoc?: number;
  excludedPaths?: string[];
}

export function filterData(node: any, options: FilterOptions): any {
  const { extensions, maxLoc, excludedPaths } = options;

  // If no filters are active, return original node
  if (
    (!extensions || extensions.length === 0) &&
    maxLoc === undefined &&
    (!excludedPaths || excludedPaths.length === 0)
  ) {
    return node;
  }

  const allowedExtensions =
    extensions && extensions.length > 0
      ? new Set(extensions.map((e) => e.toLowerCase()))
      : null;

  const excludedPathSet =
    excludedPaths && excludedPaths.length > 0 ? new Set(excludedPaths) : null;

  function recurse(n: any): any {
    // Check if path is excluded
    if (excludedPathSet && n.path && excludedPathSet.has(n.path)) {
      return null;
    }

    if (n.type === "file") {
      // Extension filter
      if (allowedExtensions) {
        const ext = n.name.split(".").pop()?.toLowerCase();
        if (!ext || !allowedExtensions.has(ext)) return null;
      }

      // LOC filter
      if (maxLoc !== undefined && (n.metrics?.loc || 0) > maxLoc) {
        return null;
      }

      return n;
    }

    if (!n.children || n.children.length === 0) return null;

    const filteredChildren = n.children
      .map(recurse)
      .filter((c: any) => c !== null);

    if (filteredChildren.length > 0) {
      // Recalculate metrics for the folder based on filtered children
      const newMetrics = { ...n.metrics };
      newMetrics.loc = filteredChildren.reduce(
        (acc: number, c: any) => acc + (c.metrics?.loc || 0),
        0
      );

      return { ...n, children: filteredChildren, metrics: newMetrics };
    }

    return null;
  }

  return recurse(node);
}
