// Compare payload contract (server/app/services/compare/service.py + diff.py).

import type { DependencyGraphContract } from "../viz/deps/contract";

export type ChangeStatus = "added" | "removed" | "modified" | "renamed";
export type Verdict = "better" | "worse" | "neutral" | "same";
export type MetricDirection = "lower" | "higher" | "neutral";

export interface CompareMetricDef {
  name: string;
  direction: MetricDirection;
  aggregation: "sum" | "max" | "mean";
  source: "tree" | "graph";
}

export interface MetricDelta {
  before: number | null;
  after: number | null;
  delta: number;
  verdict: Verdict;
}

export interface CompareFile {
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  analyzed: boolean;
  before: Record<string, number> | null;
  after: Record<string, number> | null;
  deltas: Record<string, MetricDelta>;
}

export interface CompareEdge {
  source: string;
  target: string;
  external: boolean;
  crossFolder: boolean;
}

export interface MetricTotal extends MetricDelta {
  filesBetter: number;
  filesWorse: number;
}

/** PR context on a side resolved from `pr:<n>` or an `auto` base that found the head's PR. */
export interface ComparePrMeta {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  author: string;
  isDraft: boolean;
  changedFiles: number | null;
}

export interface CompareSideMeta {
  pr?: ComparePrMeta;
  ref: string;
  sha: string | null;
  label: string;
  subject: string;
  filesTotal: number;
  scanSeconds: number;
  cached: boolean;
}

/** Analysis tree node (models.py:Node) with repo-relative paths. */
export interface TreeNode {
  name: string;
  type: "folder" | "file" | "function" | "code_fragment" | string;
  path: string;
  metrics: Record<string, number | string>;
  children?: TreeNode[];
  start_line?: number;
  end_line?: number;
}

export interface ComparePayload {
  format: number;
  /** Seconds per phase and per side step (see `CompareTimings` in api.ts). */
  timings?: { phases?: Record<string, number>; base?: Record<string, number>; head?: Record<string, number> };
  repo: { root: string; name: string };
  base: CompareSideMeta;
  head: CompareSideMeta;
  metrics: CompareMetricDef[];
  files: CompareFile[];
  edges: { added: CompareEdge[]; removed: CompareEdge[] };
  summary: {
    files: Record<ChangeStatus | "total", number>;
    lines: { additions: number; deletions: number };
    metrics: Record<string, MetricTotal>;
    net: Record<Verdict, number>;
    edges: { added: number; removed: number; crossFolderAdded: number; crossFolderRemoved: number };
  };
  trees?: { base: TreeNode; head: TreeNode };
  graphs?: { base: DependencyGraphContract; head: DependencyGraphContract };
}
