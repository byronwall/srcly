// Change Lens payload contract. The server builds it in
// server/app/services/changelens/ and mirrors these types in models.py.
// The window, chunk and bucket rules are in site/src/docs/pages/changes.md.
// Field names are camelCase on the wire.

export type LensWindow = "branch" | "24h" | "7d" | "custom";
/** touched: union of chunks changed by the window's commits. net: base snapshot against head snapshot. */
export type LensMode = "touched" | "net";
/** Whose history a time window reads: the checked-out HEAD or the default branch. */
export type LensHistory = "head" | "main";

/** The literal head and commit id of uncommitted work. */
export const WORKTREE = "WORKTREE";

export interface LensEndpoint {
  /** What the user or preset named: a branch, `merge-base(main, HEAD)`, a sha, `WORKTREE`. */
  ref: string;
  /** Null only for the working tree. */
  sha: string | null;
  /** Short text for the UI, e.g. `main @ e17633f` or `Working tree`. */
  label: string;
  /** ISO 8601 committer time; null for the working tree. */
  date: string | null;
}

/** Where HEAD stands against the default branch. */
export interface LensBranch {
  /** The checked-out branch; null for a detached HEAD. */
  name: string | null;
  /** The default branch's name, e.g. `main`. */
  default: string;
  /** What main history reads: `origin/main` unless local `main` is ahead of it. */
  defaultRef: string;
  onDefault: boolean;
  /** Commits on HEAD that `defaultRef` does not hold. */
  ahead: number;
  /** Commits on `defaultRef` that HEAD does not hold. */
  behind: number;
  /** Only for an empty HEAD window off the default branch: commits on `defaultRef` in the same time span (the last 7 days for the branch window). */
  defaultCommits: number | null;
}

export interface LensSelection {
  window: LensWindow;
  mode: LensMode;
  /** The branch or revision whose first-parent history was read. */
  ref: string;
  /** `main` when a time window read the default branch instead of HEAD: asked for, or HEAD had no commits in it. */
  history: LensHistory;
  /** Null when no default branch was found. */
  branch: LensBranch | null;
  base: LensEndpoint;
  head: LensEndpoint;
  /** Time limits of a time window (ISO 8601); null for `branch` and for ref-only custom ranges. */
  since: string | null;
  until: string | null;
  /** IANA name the server used to print times. */
  timezone: string;
  /** True when staged and unstaged edits are part of the result. Then `head` is the working tree. */
  includesWorktree: boolean;
  /** Plain sentences the UI shows as is: shallow history, clipped commit list, how merges were walked. */
  notes: string[];
  /** Absolute path of the git repo. Every `path` in the payload is relative to it. */
  repoRoot: string;
  /** The analyzed folder inside the repo (`server/app`); "" when it is the repo root. Only files under it are read. */
  scope: string;
}

export interface LensCommit {
  /** Full sha, or `WORKTREE` for the uncommitted entry (always last, when present). */
  sha: string;
  short: string;
  subject: string;
  author: string;
  /** ISO 8601 committer time; null for `WORKTREE`. */
  date: string | null;
  files: number;
  added: number;
  deleted: number;
  /** Chunks this commit touched. */
  chunkIds: string[];
}

export type ChunkKind =
  | "function" // an executable scope the analyzer named (function, method, component, arrow const)
  | "class" // a display scope: class, type, object literal
  | "heading" // a Markdown heading section
  | "file" // hunks outside any symbol; or a whole file: added, deleted, renamed with no edit, generated
  | "range"; // nearby hunks in a file the analyzers can't read (YAML, CSS), grouped by line range

export type ChunkStatus =
  | "modified"
  | "added" // not in base
  | "deleted" // not in head; lines are base lines
  | "moved" // same symbol in another file, a renamed file, or another place in its file; body unchanged or changed
  | "reverted"; // touched in the window, identical at base and head (touched mode only)

/** How the chunk at head was paired with base. */
export type ChunkMatch =
  | "exact" // same path, same qualified name
  | "renamed-file" // git reports the file as renamed; same qualified name
  | "moved" // same name and near-identical body in another file or scope
  | "uncertain" // best guess; the UI labels it
  | "none"; // added or deleted: nothing to pair

export interface LensHunk {
  /** Commit that made the hunk; `WORKTREE` for uncommitted; null in net mode (base → head). */
  sha: string | null;
  /** Line ranges as git prints them (`-oldStart,oldLines +newStart,newLines`). */
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface LensTouch {
  sha: string;
  added: number;
  deleted: number;
}

/** null on a side means that side has no value: absent, or not measured. */
export interface BeforeAfter {
  before: number | null;
  after: number | null;
}

export type ReviewBucket = "complex-and-changed" | "new-hotspot";

export interface LensChunk {
  /** Stable for one selection: `<path>::<qualifiedName>` or `<path>::L<start>-<end>` or `<path>`. */
  id: string;
  /** Repo-relative path at head (at base for deleted chunks). */
  path: string;
  /** Path at base when it differs. */
  oldPath?: string;
  kind: ChunkKind;
  /** Display name: `retryJob`, `## Install`, `lines 40–62`, or the file name. */
  name: string;
  /** Lines at head (at base for deleted chunks), 1-based, inclusive. */
  startLine: number;
  endLine: number;
  /** Lines at base when the chunk exists there. */
  baseStartLine?: number;
  baseEndLine?: number;
  status: ChunkStatus;
  match: ChunkMatch;
  /** Sum over every touch (churn = added + deleted). In net mode, the same as netAdded and netDeleted. */
  added: number;
  deleted: number;
  /** Lines that differ between base and head for this chunk. 0 for reverted. */
  netAdded: number;
  netDeleted: number;
  /** One per commit that touched the chunk, oldest first. Empty in net mode. */
  touches: LensTouch[];
  /** ISO 8601 times of the first and last touch; null when only the working tree touched it. */
  firstTouched: string | null;
  lastTouched: string | null;
  /** Catalog metric id → before/after. Only metrics the chunk's language measures at its scope. */
  metrics: Record<string, BeforeAfter>;
  /** False when no analyzer reads this chunk: the UI says "not measured", never 0. */
  measured: boolean;
  /** Why not, when `measured` is false or a side failed. */
  naReason?: string;
  buckets: ReviewBucket[];
  /** code | test | docs | style | config | fixture | generated | vendor … from file_classes.py */
  fileClass: string;
  hunks: LensHunk[];
}

export interface LensFile {
  path: string;
  oldPath?: string;
  status: "added" | "deleted" | "modified" | "renamed";
  /** Touched mode: lines summed over the window's commits. Net mode: base against head. */
  added: number;
  deleted: number;
  /** Lines of code at head; null for deleted files. Area of the file in Show in repo. */
  loc: number | null;
  fileClass: string;
  chunkIds: string[];
  /** Generated or vendored: listed, drawn muted, left out of buckets. */
  outOfScope: boolean;
}

export interface LensSummary {
  filesEdited: number;
  /** Files in the repo at head (tracked, after srcly's ignore rules). */
  filesTotal: number;
  chunks: number;
  churnLines: number;
  netLines: number;
  reverted: number;
}

export interface LensChangedPath {
  id: string;
  path: string;
  oldPath?: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "reverted";
  commits: string[];
  hasNetDiff: boolean;
  measured: boolean;
  metricReason: string | null;
}

export interface LensChangedPaths {
  requiresCommittedRange: boolean;
  rows: LensChangedPath[];
  baseRevision: string | null;
  headRevision: string | null;
  compareUnavailableReason: string | null;
  unavailableReason: string | null;
}

export interface LensPathDiff {
  id: string;
  path: string;
  oldPath?: string | null;
  status: LensChangedPath["status"];
  from: string;
  to: string;
  diff: string;
  truncated: boolean;
  reason: string | null;
  baseRevision?: string | null;
  headRevision?: string | null;
  compareUnavailableReason?: string | null;
  baseSource: LensSourceLocation | null;
  headSource: LensSourceLocation | null;
}

export interface ChangeLensPayload {
  selection: LensSelection;
  /** First-parent commits in the window, oldest first; capped (see `selection.notes`). */
  commits: LensCommit[];
  chunks: LensChunk[];
  files: LensFile[];
  summary: LensSummary;
  /** Catalog ids of the metrics that have a before/after on at least one chunk. */
  metricIds: string[];
  changedPaths?: LensChangedPaths | null;
}

/** `GET /api/change-lens/hunk`: the diff text behind one chunk. */
export interface LensSourceLocation {
  repoRoot: string;
  path: string;
  side: "base" | "head";
  /** Null only for a working-tree file. */
  revision: string | null;
  startLine: number;
  endLine: number;
}

export interface LensHunkDiff {
  chunkId: string;
  path: string;
  oldPath?: string;
  /** Revisions the diff runs between, as labels. */
  from: string;
  to: string;
  /** Unified diff (3 lines of context) limited to the chunk's lines; "" when the sides are equal. */
  diff: string;
  /** Set when the diff was clipped. */
  truncated: boolean;
  /** The side containing the chunk, or null when neither side has source. */
  source?: LensSourceLocation | null;
}
