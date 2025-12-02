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

export function filterTree(node: any, query: string): any {
  if (!query) return node;

  const lowerQuery = query.toLowerCase();

  // Helper to check if a node matches
  const matches = (n: any) => n.name.toLowerCase().includes(lowerQuery);

  // Recursive filter
  function recurse(n: any): any {
    // If it's a file/leaf, check if it matches
    if (!n.children || n.children.length === 0) {
      return matches(n) ? n : null;
    }

    // If it's a folder, filter children
    const filteredChildren = n.children
      .map(recurse)
      .filter((c: any) => c !== null);

    // If folder itself matches, return it with ALL children (or maybe just filtered? Let's say filtered for now, unless we want to show context)
    // Actually, if a folder matches "src", we probably want to see everything inside?
    // Or maybe just the folder node itself?
    // Usually search filters items. If I search "src", I expect to see "src" folder.
    // But if I search "App", I expect "App.tsx".
    // Let's stick to: keep node if it matches OR has matching descendants.

    if (matches(n) || filteredChildren.length > 0) {
      // Return a copy with filtered children
      return { ...n, children: filteredChildren };
    }

    return null;
  }

  return recurse(node);
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
}

export function filterData(node: any, options: FilterOptions): any {
  const { extensions, maxLoc } = options;

  // If no filters are active, return original node
  if ((!extensions || extensions.length === 0) && maxLoc === undefined) {
    return node;
  }

  const allowedExtensions =
    extensions && extensions.length > 0
      ? new Set(extensions.map((e) => e.toLowerCase()))
      : null;

  function recurse(n: any): any {
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
