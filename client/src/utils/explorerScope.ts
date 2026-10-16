import type { HotSpotMetricDef } from "./metricsStore";
import { metricApplies } from "./metricApplicability";

export type ScopeNode = {
  name: string;
  path: string;
  type: string;
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
  scopes: number;
  loc: number;
  /** The file that most needs attention under the color metric, if any applies. */
  worst?: { node: T; value: number };
};

const num = (node: ScopeNode, key: string) => {
  const value = node.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

/** Counts under `root`, plus its worst file by `metric` (lowest for inverted metrics). */
export function summarizeScope<T extends ScopeNode>(root: T, metric: HotSpotMetricDef): ScopeSummary<T> {
  const summary: ScopeSummary<T> = { files: 0, folders: 0, scopes: 0, loc: num(root, "loc") };
  const stack: T[] = [...((root.children ?? []) as T[])];
  if (!root.children?.length) stack.push(root);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "folder") summary.folders++;
    else if (node.type === "file") {
      summary.files++;
      if (metricApplies(metric, node.path, false)) {
        const value = num(node, metric.id);
        const worse = metric.invert ? value < (summary.worst?.value ?? Infinity) : value > (summary.worst?.value ?? 0);
        if (worse) summary.worst = { node, value };
      }
    } else summary.scopes++;
    stack.push(...((node.children ?? []) as T[]));
  }
  return summary;
}
