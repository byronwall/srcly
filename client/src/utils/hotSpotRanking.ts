import { isRankingMetric, type HotSpotMetricId } from "./metricsStore";

/** Hot Spots rank one cohort at a time; files and functions are never mixed. */
export type HotSpotCohort = "file" | "function";

export type RankableNode = {
  type: string;
  kind?: string | null;
  metrics?: Record<string, unknown>;
  children?: RankableNode[];
};

/** Files, or executable functions (not classes, types, JSX containers or bodies). */
export function cohortNodes<T extends RankableNode>(root: T, cohort: HotSpotCohort): T[] {
  const out: T[] = [];
  const stack: T[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (cohort === "file" ? node.type === "file" : node.type === "function" && node.kind === "function") {
      out.push(node);
    }
    for (const child of (node.children ?? []) as T[]) stack.push(child);
  }
  return out;
}

/** The metric's value, or null when it is N/A (null, missing or not finite). */
function valueOf(node: RankableNode, id: HotSpotMetricId): number | null {
  const raw = node.metrics?.[id];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.max(0, raw);
}

export type RankedHotSpot<T> = { node: T; score: number };

/**
 * Score each node as the mean of its max-normalized metric values (the same
 * math as `srcly report`'s `rank_nodes`, with equal weights). A measured 0
 * counts toward the mean; N/A metrics drop out, and a node N/A on every
 * selected metric isn't ranked at all (it is counted in `na`). Raising one
 * input with the peers fixed never lowers a node's score. Neutral detail
 * metrics (TODOs, exports...) never rank; they are dropped from `metrics`.
 */
export function rankHotSpots<T extends RankableNode>(
  nodes: readonly T[],
  metrics: readonly HotSpotMetricId[],
  limit = Infinity
): { ranked: RankedHotSpot<T>[]; na: number } {
  metrics = metrics.filter(isRankingMetric);
  if (metrics.length === 0) return { ranked: [], na: 0 };
  const max = new Map<HotSpotMetricId, number>();
  for (const id of metrics) {
    let best = 0;
    for (const node of nodes) best = Math.max(best, valueOf(node, id) ?? 0);
    max.set(id, best);
  }

  const ranked: RankedHotSpot<T>[] = [];
  let na = 0;
  for (const node of nodes) {
    let sum = 0;
    let count = 0;
    for (const id of metrics) {
      const value = valueOf(node, id);
      if (value === null) continue;
      const m = max.get(id) ?? 0;
      sum += m > 0 ? value / m : 0;
      count += 1;
    }
    if (count === 0) {
      na += 1;
      continue;
    }
    ranked.push({ node, score: sum / count });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { ranked: ranked.slice(0, limit), na };
}
