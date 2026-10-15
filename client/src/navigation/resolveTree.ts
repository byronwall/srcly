import { normalizeScopeName, splitAt, treePathFromAt, isExternal, atFromTreePath } from "./location";

export interface TreeLike {
  path?: string;
  name?: string;
  children?: TreeLike[] | null;
}

export interface TreeResolution<T> {
  node: T;
  /** The location of `node` (may differ from the requested `at`). */
  at: string;
  /**
   * How the request matched: "exact"; "scope" when a bare graph symbol matched
   * a decorated scope, or fell back to its file; "external" for a graph-only
   * package (shown as the root); "missing" when the path is gone and an
   * ancestor is shown instead.
   */
  match: "exact" | "scope" | "external" | "missing";
}

function descend<T extends TreeLike>(root: T, target: string): { node: T; exact: boolean } {
  let node = root;
  for (;;) {
    if (node.path === target) return { node, exact: true };
    const next = (node.children ?? []).find((c) => {
      const p = c.path;
      if (!p) return false;
      return p === target || target.startsWith(`${p}/`) || target.startsWith(`${p}::`);
    }) as T | undefined;
    if (!next) return { node, exact: false };
    node = next;
  }
}

/**
 * The scan-tree node for `at`, walking down by path prefix (no full-tree
 * search). A graph symbol ("a.py#Foo") matches the file's scope whose bare
 * name is "Foo"; anything else that's gone resolves to its nearest ancestor.
 */
export function resolveTreeAt<T extends TreeLike>(
  tree: T,
  rootPath: string,
  at: string
): TreeResolution<T> {
  if (!at) return { node: tree, at: "", match: "exact" };
  if (isExternal(at)) return { node: tree, at: "", match: "external" };

  const { node, exact } = descend(tree, treePathFromAt(at, rootPath));
  const resolvedAt = (n: T) => atFromTreePath(n.path ?? "", rootPath) ?? "";
  if (exact) return { node, at, match: "exact" };

  const { file, scopes } = splitAt(at);
  if (scopes.length && node.path === treePathFromAt(file, rootPath)) {
    const want = normalizeScopeName(scopes[0]);
    const scope = (node.children ?? []).find(
      (c) => c.name !== undefined && normalizeScopeName(c.name) === want
    ) as T | undefined;
    const hit = scope ?? node;
    return { node: hit, at: resolvedAt(hit), match: "scope" };
  }
  return { node, at: resolvedAt(node), match: "missing" };
}
