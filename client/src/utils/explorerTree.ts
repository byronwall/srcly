export type ExplorerTreeNode = {
  name: string;
  path: string;
  type: string;
  children?: ExplorerTreeNode[];
};

export type ExplorerTreeRow<T extends ExplorerTreeNode = ExplorerTreeNode> = {
  node: T;
  depth: number;
  hasChildren: boolean;
};

export function sortExplorerChildren<T extends ExplorerTreeNode>(
  children: readonly T[],
  getValue: (node: T) => string | number,
  direction: "asc" | "desc"
): T[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...children].sort((a, b) => {
    const aIsFolder = a.type === "folder";
    const bIsFolder = b.type === "folder";
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;

    const valA = getValue(a);
    const valB = getValue(b);
    if (valA < valB) return -1 * multiplier;
    if (valA > valB) return 1 * multiplier;

    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });
}

export function flattenExplorerTree<T extends ExplorerTreeNode>(
  root: T | null | undefined,
  options: {
    isExpanded: (node: T) => boolean;
    getValue: (node: T) => string | number;
    direction: "asc" | "desc";
  }
): ExplorerTreeRow<T>[] {
  if (!root) return [];
  const rows: ExplorerTreeRow<T>[] = [];
  const stack: Array<{ node: T; depth: number }> = [{ node: root, depth: 0 }];

  while (stack.length) {
    const { node, depth } = stack.pop()!;
    const children = (node.children ?? []) as T[];
    const hasChildren = children.length > 0;
    rows.push({ node, depth, hasChildren });
    if (!hasChildren || !options.isExpanded(node)) continue;

    const sorted = sortExplorerChildren(children, options.getValue, options.direction);
    for (let i = sorted.length - 1; i >= 0; i--) {
      stack.push({ node: sorted[i], depth: depth + 1 });
    }
  }

  return rows;
}

export function getVirtualTreeRange(
  scrollTop: number,
  viewportHeight: number,
  itemCount: number,
  rowHeight = 32,
  overscan = 8
) {
  const maxScrollTop = Math.max(0, itemCount * rowHeight - viewportHeight);
  const visibleScrollTop = Math.min(Math.max(0, scrollTop), maxScrollTop);
  const start = Math.min(itemCount, Math.max(0, Math.floor(visibleScrollTop / rowHeight) - overscan));
  const end = Math.min(
    itemCount,
    Math.ceil((visibleScrollTop + viewportHeight) / rowHeight) + overscan
  );
  return {
    start,
    end,
    top: start * rowHeight,
    bottom: Math.max(0, (itemCount - end) * rowHeight),
  };
}
