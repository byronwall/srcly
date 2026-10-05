/**
 * Add synthetic "(body)" children for scopes that have children, so the
 * treemap accounts for scope-local lines that are not represented by children.
 * Unchanged nodes and child arrays keep their original identity.
 */
export function addScopeBodyDummyNodes(node: any): any {
  if (!node) return node;

  const children: any[] = Array.isArray(node.children) ? node.children : [];
  const hasChildren = children.length > 0;
  let body: any = null;

  if (node.type === "function" && hasChildren) {
    const alreadyHasBody = children.some(
      (child) => child?.type === "function_body" || child?.name === "(body)"
    );
    const loc = node.metrics?.loc || 0;
    if (!alreadyHasBody && loc > 0) {
      body = {
        name: "(body)",
        path: `${node.path || node.name || ""}::(body)`,
        type: "function_body",
        metrics: { ...(node.metrics || {}), loc },
        start_line: node.start_line,
        end_line: node.end_line,
        children: [],
      };
    }
  }

  if (node.type === "file" && hasChildren) {
    const alreadyHasBody = children.some((child) => child?.name === "(body)");
    const functionLoc = children.reduce(
      (total, child) =>
        total + (child?.type === "function" ? child?.metrics?.loc || 0 : 0),
      0
    );
    const remainder = Math.max(0, (node.metrics?.loc || 0) - functionLoc);
    if (!alreadyHasBody && remainder > 0) {
      body = {
        name: "(body)",
        path: `${node.path || node.name || ""}::(body)`,
        type: "file_body",
        metrics: { ...(node.metrics || {}), loc: remainder },
        children: [],
      };
    }
  }

  let nextChildren = children;
  for (let i = 0; i < children.length; i++) {
    const nextChild = addScopeBodyDummyNodes(children[i]);
    if (nextChild !== children[i]) {
      if (nextChildren === children) nextChildren = [...children];
      nextChildren[i] = nextChild;
    }
  }
  if (body) {
    if (nextChildren === children) nextChildren = [...children];
    nextChildren.push(body);
  }

  return nextChildren === children ? node : { ...node, children: nextChildren };
}
