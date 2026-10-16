import { metricDef, type MetricId } from "./metricsStore";

/** Hot Spots rank one cohort at a time; files and functions are never mixed. */
export type HotSpotCohort = "file" | "function";

export type RankableNode = {
  type: string;
  kind?: string | null;
  path: string;
  start_line?: number;
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
function valueOf(node: RankableNode, id: MetricId): number | null {
  const raw = node.metrics?.[id];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export type RankedHotSpot<T> = {
  node: T;
  value: number;
  /** Share of the worst value (0–1), for the row's bar. */
  score: number;
};

export type HotSpotRanking<T> = {
  ranked: RankedHotSpot<T>[];
  /** Nodes with no value for the metric: it doesn't apply, or the file was skipped or failed. */
  na: T[];
};

/**
 * Rank one cohort by one metric, worst first: descending for higher-worse
 * metrics, ascending for lower-worse, then by path and start line so ties
 * are stable. A measured 0 is ranked; N/A nodes come back apart in `na`.
 * Neutral detail metrics never rank.
 *
 * This is `srcly report`'s ranking (`reporting.rank_by_metric`); the parity
 * test (`hotSpotRanking.parity.test.ts`) checks both on the same fixture.
 */
export function rankHotSpots<T extends RankableNode>(nodes: readonly T[], metric: MetricId): HotSpotRanking<T> {
  const def = metricDef(metric);
  if (!def || def.direction === "neutral") return { ranked: [], na: [] };

  const ranked: RankedHotSpot<T>[] = [];
  const na: T[] = [];
  for (const node of nodes) {
    const value = valueOf(node, metric);
    if (value === null) na.push(node);
    else ranked.push({ node, value, score: 0 });
  }

  const sign = def.direction === "higher-worse" ? -1 : 1;
  ranked.sort(
    (a, b) =>
      sign * (a.value - b.value) ||
      (a.node.path < b.node.path ? -1 : a.node.path > b.node.path ? 1 : 0) ||
      (a.node.start_line ?? 0) - (b.node.start_line ?? 0)
  );
  const top = ranked.reduce((max, item) => Math.max(max, item.value), 0);
  for (const item of ranked) {
    const share = top > 0 ? item.value / top : 0;
    item.score = def.direction === "higher-worse" ? share : 1 - share;
  }
  na.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ranked, na };
}
