/**
 * Add synthetic "(body)" children for scopes that have children, so that
 * the treemap can account for "scope-local" lines that are not represented
 * by nested child nodes.
 */
export function addScopeBodyDummyNodes(node: any): any {
  if (!node) return node;

  const clone: any = {
    ...node,
    // Always clone children array so we never mutate the original data.
    children: Array.isArray(node.children) ? [...node.children] : [],
  };

  const hasChildren =
    Array.isArray(clone.children) && clone.children.length > 0;

  // Function scopes: server typically provides a precise (body) node; only add if absent.
  if (clone.type === "function") {
    const alreadyHasBodyChild =
      hasChildren &&
      clone.children.some(
        (child: any) =>
          child?.type === "function_body" || child?.name === "(body)"
      );

    if (hasChildren && !alreadyHasBodyChild) {
      const loc = clone.metrics?.loc || 0;
      if (loc > 0) {
        const bodyChild = {
          name: "(body)",
          path: `${clone.path || clone.name || ""}::(body)`,
          type: "function_body",
          metrics: {
            ...(clone.metrics || {}),
            loc,
          },
          start_line: clone.start_line,
          end_line: clone.end_line,
          children: [],
        };
        clone.children.push(bodyChild);
      }
    }
  }

  // File/module scopes: represent top-level (non-function) LOC as a hidden "(body)" leaf.
  if (clone.type === "file") {
    const alreadyHasBodyChild =
      hasChildren &&
      clone.children.some((child: any) => child?.name === "(body)");

    if (hasChildren && !alreadyHasBodyChild) {
      const totalLoc = clone.metrics?.loc || 0;
      const functionLoc = clone.children.reduce((acc: number, c: any) => {
        return acc + (c?.type === "function" ? c?.metrics?.loc || 0 : 0);
      }, 0);
      const remainder = Math.max(0, totalLoc - functionLoc);

      if (remainder > 0) {
        const bodyChild = {
          name: "(body)",
          path: `${clone.path || clone.name || ""}::(body)`,
          type: "file_body",
          metrics: {
            ...(clone.metrics || {}),
            loc: remainder,
          },
          children: [],
        };
        clone.children.push(bodyChild);
      }
    }
  }

  if (clone.children && clone.children.length > 0) {
    clone.children = clone.children.map((child: any) =>
      addScopeBodyDummyNodes(child)
    );
  }

  return clone;
}
