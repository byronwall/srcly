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
  /** The row's parent node, or undefined for a top-level row. */
  parent?: T;
};

/** Explorer row height in px; virtualization and keyboard scrolling share it. */
export const EXPLORER_ROW_HEIGHT = 24;

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
    /** False lists the root's children as the top level (when it has any). */
    includeRoot?: boolean;
  }
): ExplorerTreeRow<T>[] {
  if (!root) return [];
  const rows: ExplorerTreeRow<T>[] = [];
  const stack: Array<{ node: T; depth: number; parent?: T }> = [];
  const pushChildren = (node: T, depth: number) => {
    const sorted = sortExplorerChildren((node.children ?? []) as T[], options.getValue, options.direction);
    for (let i = sorted.length - 1; i >= 0; i--) {
      stack.push({ node: sorted[i], depth, parent: node });
    }
  };

  if (options.includeRoot === false && root.children?.length) pushChildren(root, 0);
  else stack.push({ node: root, depth: 0 });

  while (stack.length) {
    const { node, depth, parent } = stack.pop()!;
    const hasChildren = Boolean(node.children?.length);
    rows.push({ node, depth, hasChildren, parent });
    if (hasChildren && options.isExpanded(node)) pushChildren(node, depth + 1);
  }

  return rows;
}

export function getVirtualTreeRange(
  scrollTop: number,
  viewportHeight: number,
  itemCount: number,
  rowHeight = EXPLORER_ROW_HEIGHT,
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

/**
 * Paths to expand so the tree opens filled but not overflowing: starting
 * from the root, open the largest folders (by LOC) in order while the
 * visible rows stay within `budget`. Only folders open; files keep their scopes closed.
 */
export function autoExpandPaths<T extends ExplorerTreeNode & { metrics?: { loc?: number } }>(
  root: T,
  budget: number
): Set<string> {
  const expanded = new Set<string>([root.path]);
  let rows = root.children?.length ?? 0;
  const loc = (node: T) => node.metrics?.loc ?? 0;
  const isFolder = (node: T) => node.type === "folder" && Boolean(node.children?.length);
  const queue = ((root.children ?? []) as T[]).filter(isFolder);

  while (queue.length) {
    queue.sort((a, b) => loc(b) - loc(a));
    const folder = queue.shift()!;
    const children = (folder.children ?? []) as T[];
    // Stop at the first folder that doesn't fit; opening smaller ones
    // instead would expand arbitrary corners of the tree.
    if (rows + children.length > budget) break;
    expanded.add(folder.path);
    rows += children.length;
    queue.push(...children.filter(isFolder));
  }
  return expanded;
}
