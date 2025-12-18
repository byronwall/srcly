export function resolveNodeByPath(
  root: any,
  targetPath: string | undefined
): { node: any; breadcrumbs: any[] } | null {
  if (!root || !targetPath) return null;

  const breadcrumbs: any[] = [];
  let resolved: any = null;

  function dfs(node: any, acc: any[]): boolean {
    if (node?.path === targetPath) {
      breadcrumbs.push(...acc, node);
      resolved = node;
      return true;
    }
    for (const child of node?.children ?? []) {
      if (dfs(child, [...acc, node])) return true;
    }
    return false;
  }

  return dfs(root, []) ? { node: resolved, breadcrumbs } : null;
}
