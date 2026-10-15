// Pure row model for the compare table: changed files (plus optional
// unchanged siblings) arranged as a folder tree, or flat when sorted by delta.

import { fileHealth } from "./metrics";
import type { ChangeStatus, CompareFile, TreeNode } from "./types";

export interface FolderRow {
  kind: "folder";
  /** Repo-relative folder path ("" for the root). */
  path: string;
  /** Display name; single-child folder chains collapse into "a/b/c". */
  name: string;
  depth: number;
  changed: number;
  additions: number;
  deletions: number;
  statusCounts: Record<ChangeStatus, number>;
  /** Changed files below with at least one worse / better risk metric. */
  filesWorse: number;
  filesBetter: number;
}

export interface FileRow {
  kind: "file";
  path: string;
  name: string;
  depth: number;
  /** Present for changed files. */
  change?: CompareFile;
  /** Head-side metrics for unchanged context files. */
  metrics?: Record<string, number>;
}

export type CompareRow = FolderRow | FileRow;

/** "tree" = folders; "regressed" = flat, most regressed first; anything else = flat by |Δ| of that metric. */
export type RowSort = "tree" | "regressed" | (string & {});

export interface RowOptions {
  showUnchanged: boolean;
  sort: RowSort;
  collapsed: ReadonlySet<string>;
}

export interface RowFilter {
  statuses: ReadonlySet<ChangeStatus>;
  regressionsOnly: boolean;
  query: string;
}

export const ALL_STATUSES: ChangeStatus[] = ["added", "modified", "renamed", "removed"];

/** Keep changed files that pass the status / regression / path filters; context rows follow their folder. */
export function filterFiles(files: FileRow[], filter: RowFilter): FileRow[] {
  const q = filter.query.trim().toLowerCase();
  const kept = files.filter((f) => {
    if (!f.change) return true;
    if (!filter.statuses.has(f.change.status)) return false;
    if (filter.regressionsOnly && fileHealth(f.change.deltas).worse.length === 0) return false;
    if (q && !f.path.toLowerCase().includes(q) && !(f.change.oldPath ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
  const liveFolders = new Set(kept.filter((f) => f.change).map((f) => dirname(f.path)));
  return kept.filter((f) => f.change || liveFolders.has(dirname(f.path)));
}

interface Folder {
  path: string;
  name: string;
  folders: Map<string, Folder>;
  files: FileRow[];
}

const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** Repo-relative file path → file node, for one side's tree. */
export function indexFiles(tree: TreeNode | undefined): Map<string, TreeNode> {
  const out = new Map<string, TreeNode>();
  const stack = tree ? [tree] : [];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "file") {
      out.set(node.path, node);
      continue;
    }
    if (node.children) stack.push(...node.children);
  }
  return out;
}

function numericMetrics(node: TreeNode): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(node.metrics ?? {})) if (typeof v === "number") out[k] = v;
  return out;
}

/** Files to show: every change, plus unchanged files sharing a folder with one. */
export function collectFiles(
  files: CompareFile[],
  headFiles: Map<string, TreeNode>,
  showUnchanged: boolean
): FileRow[] {
  const rows: FileRow[] = files.map((change) => ({
    kind: "file",
    path: change.path,
    name: basename(change.path),
    depth: 0,
    change,
  }));
  if (!showUnchanged) return rows;
  const changed = new Set(files.map((f) => f.path));
  const folders = new Set(files.map((f) => dirname(f.path)));
  for (const [path, node] of headFiles) {
    if (changed.has(path) || !folders.has(dirname(path))) continue;
    rows.push({ kind: "file", path, name: basename(path), depth: 0, metrics: numericMetrics(node) });
  }
  return rows;
}

function buildFolders(rows: FileRow[]): Folder {
  const root: Folder = { path: "", name: "", folders: new Map(), files: [] };
  for (const row of rows) {
    const parts = row.path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let next = cur.folders.get(parts[i]);
      if (!next) {
        next = { path, name: parts[i], folders: new Map(), files: [] };
        cur.folders.set(parts[i], next);
      }
      cur = next;
    }
    cur.files.push(row);
  }
  return root;
}

/** Merge a folder with its only child folder while it has no files of its own. */
function compress(folder: Folder): Folder {
  let cur = folder;
  let name = folder.name;
  while (cur.files.length === 0 && cur.folders.size === 1) {
    const only = [...cur.folders.values()][0];
    name = name ? `${name}/${only.name}` : only.name;
    cur = only;
  }
  return cur === folder ? folder : { ...cur, name };
}

function aggregate(folder: Folder): Omit<FolderRow, "kind" | "path" | "name" | "depth"> {
  const out = {
    changed: 0,
    additions: 0,
    deletions: 0,
    filesWorse: 0,
    filesBetter: 0,
    statusCounts: { added: 0, removed: 0, modified: 0, renamed: 0 } as Record<ChangeStatus, number>,
  };
  for (const f of folder.files) {
    if (!f.change) continue;
    out.changed++;
    out.additions += f.change.additions;
    out.deletions += f.change.deletions;
    out.statusCounts[f.change.status]++;
    const health = fileHealth(f.change.deltas);
    if (health.worse.length) out.filesWorse++;
    if (health.better.length) out.filesBetter++;
  }
  for (const child of folder.folders.values()) {
    const sub = aggregate(child);
    out.changed += sub.changed;
    out.additions += sub.additions;
    out.deletions += sub.deletions;
    out.filesWorse += sub.filesWorse;
    out.filesBetter += sub.filesBetter;
    for (const k of Object.keys(sub.statusCounts) as ChangeStatus[]) out.statusCounts[k] += sub.statusCounts[k];
  }
  return out;
}

const byChangeThenName = (a: FileRow, b: FileRow) =>
  Number(!a.change) - Number(!b.change) || a.name.localeCompare(b.name);

export function sortDelta(row: FileRow, metric: string): number {
  return Math.abs(row.change?.deltas[metric]?.delta ?? 0);
}

const churn = (f: FileRow) => (f.change ? f.change.additions + f.change.deletions : 0);

export function buildRows(files: FileRow[], options: RowOptions): CompareRow[] {
  if (options.sort !== "tree") {
    const flat = files.filter((f) => f.change).map((f) => ({ ...f, name: f.path, depth: 0 }));
    if (options.sort === "regressed") {
      const score = new Map(flat.map((f) => [f.path, fileHealth(f.change!.deltas)]));
      return flat.sort(
        (a, b) =>
          score.get(b.path)!.score - score.get(a.path)!.score ||
          score.get(b.path)!.worse.length - score.get(a.path)!.worse.length ||
          churn(b) - churn(a) ||
          a.path.localeCompare(b.path)
      );
    }
    const metric = options.sort;
    return flat.sort((a, b) => sortDelta(b, metric) - sortDelta(a, metric) || a.path.localeCompare(b.path));
  }

  const out: CompareRow[] = [];
  const visit = (raw: Folder, depth: number) => {
    const folder = compress(raw);
    const isRoot = raw.path === "" && raw.name === "";
    let childDepth = depth;
    if (!isRoot || folder !== raw) {
      out.push({ kind: "folder", path: folder.path, name: folder.name, depth, ...aggregate(folder) });
      if (options.collapsed.has(folder.path)) return;
      childDepth = depth + 1;
    }
    const subfolders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const sub of subfolders) visit(sub, childDepth);
    for (const f of [...folder.files].sort(byChangeThenName)) out.push({ ...f, depth: childDepth });
  };
  visit(buildFolders(files), 0);
  return out;
}
