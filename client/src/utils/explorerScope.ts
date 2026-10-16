import type { HotSpotMetricDef } from "./metricsStore";

export type ScopeNode = {
  name: string;
  path: string;
  type: string;
  kind?: string | null;
  children?: ScopeNode[];
  metrics?: Record<string, unknown>;
};

/** Nodes from `root` down to the node at `path`, inclusive; empty when not found. */
export function ancestorChain<T extends ScopeNode>(root: T, path: string): T[] {
  if (root.path === path) return [root];
  for (const child of (root.children ?? []) as T[]) {
    const chain = ancestorChain(child, path);
    if (chain.length) return [root, ...chain];
  }
  return [];
}

export type ScopeSummary<T> = {
  files: number;
  folders: number;
  /** Executable functions (not classes, types, JSX containers or bodies). */
  functions: number;
  loc: number;
  /** The file that most needs attention under the color metric; N/A files never are. */
  worst?: { node: T; value: number };
};

/** The value, or null when N/A. */
const num = (node: ScopeNode, key: string) => {
  const value = node.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Counts under `root`, plus its worst (highest) file by `metric`. */
export function summarizeScope<T extends ScopeNode>(root: T, metric: HotSpotMetricDef): ScopeSummary<T> {
  const summary: ScopeSummary<T> = { files: 0, folders: 0, functions: 0, loc: num(root, "loc") ?? 0 };
  const stack: T[] = [...((root.children ?? []) as T[])];
  if (!root.children?.length) stack.push(root);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "folder") summary.folders++;
    else if (node.type === "file") {
      summary.files++;
      const value = num(node, metric.id);
      if (value !== null) {
        if (value > (summary.worst?.value ?? 0)) summary.worst = { node, value };
      }
    } else if (node.type === "function" && node.kind === "function") summary.functions++;
    stack.push(...((node.children ?? []) as T[]));
  }
  return summary;
}

/** A node's label: the scan root shows its folder's name instead of "root". */
export function scopeDisplayName(node: { name: string; path: string }, scanRootPath?: string): string {
  if (node.path !== scanRootPath) return node.name;
  return node.path.split(/[\\/]/).filter(Boolean).pop() ?? node.name;
}
