// The Changes view (`?view=changes`): which code a window of work touched.
// It owns the fetches and the URL state; the map and the panel pieces get
// everything through props.

import { createEffect, createMemo, createSignal, For, lazy, on, onCleanup, onMount, Show, untrack, type JSX } from "solid-js";
import { ArrowRight } from "lucide-solid";
import { Button } from "../components/ui/Button";
import { atFromTreePath, baseName, splitAt } from "../navigation/location";
import { go, location } from "../navigation/store";
import { findTreeNodeByPath } from "../utils/dataProcessing";
import { ViewTools } from "../viz/viewToolbar";
import { fetchChangeLens, fetchHunk, fetchPathDiff, LensError, type LensQuery } from "./api";
import BranchNotice, { historyApplies, isOffMain } from "./BranchNotice";
import { plural, timeLimits } from "./labels";
import { inScope, type RepoNode } from "./layout";
import Legend from "./Legend";
import LensMap from "./LensMap";
import { ChunkInspector, CommitRail, HunkDiff, ReviewBuckets } from "./panel";
import type { ChangeLensPayload, LensChunk, LensHunkDiff, LensPathDiff, LensSourceLocation } from "./types";
import { lens, setLens } from "./urlState";
import WindowBar from "./WindowBar";
import { ChangedPaths } from "./panel/ChangedPaths";
import { enterPathCompare, readCompareParam } from "../compare/api";

/** Below this width the panel moves under the map. */
const NARROW_PX = 900;
const CodeModal = lazy(() => import("../components/CodeModal/CodeModal"));

interface ScanNode {
  name: string;
  path: string;
  type: string;
  children?: ScanNode[];
  metrics?: { loc?: number; file_count?: number };
}

/** `at` (relative to the scan root) as a repo path, when the scan root is the folder `scope` of the repo. */
export const repoPath = (scope: string, at: string) => (scope && at ? `${scope}/${at}` : scope || at);

/** A repo path as an `at` relative to the scan root. Every payload path lies under the scope. */
export const scanPath = (scope: string, path: string) => (scope && inScope(path, scope) ? path.slice(scope.length + 1) : path);

/** The scan tree as folders and files with repo paths, and each folder's file count. */
function repoTree(data: ScanNode | null, root: string, scope: string): { tree: RepoNode | null; fileCounts: Map<string, number> } {
  const fileCounts = new Map<string, number>();
  const walk = (node: ScanNode): RepoNode | null => {
    const at = atFromTreePath(node.path, root);
    if (at === null) return null;
    const path = repoPath(scope, at);
    if (node.type === "file") return { name: node.name, path, loc: node.metrics?.loc ?? 0 };
    if (node.type !== "folder") return null;
    const children = (node.children ?? []).map(walk).filter((c): c is RepoNode => c !== null && (!c.children || c.children.length > 0));
    const files = children.reduce((n, c) => n + (c.children ? (fileCounts.get(c.path) ?? 0) : 1), 0);
    fileCounts.set(path, files);
    return { name: node.name, path, loc: node.metrics?.loc ?? 0, children };
  };
  return { tree: data ? walk(data) : null, fileCounts };
}

/** `5 of 43 files · 2 deleted`: the total counts files at head, so deleted files are counted apart. */
function fileCount(p: ChangeLensPayload): string {
  const deleted = p.files.filter((f) => f.status === "deleted").length;
  const kept = `${(p.summary.filesEdited - deleted).toLocaleString("en-US")} of ${plural(p.summary.filesTotal, "file")}`;
  return deleted ? `${kept} · ${deleted} deleted` : kept;
}

function Message(props: { title: string; children?: JSX.Element; state: string }) {
  return (
    <div class="flex min-h-0 flex-1 items-center justify-center p-6" data-lens-message={props.state}>
      <div class="max-w-[34rem] text-[13px] leading-5 text-[var(--plc-on-muted)]">
        <div class="mb-1 text-[14px] font-semibold text-[var(--plc-on-surface)]">{props.title}</div>
        {props.children}
      </div>
    </div>
  );
}

export default function ChangeLensView(props: {
  /** The scan tree (absolute paths); null before a scan is loaded. */
  data: ScanNode | null;
  /** Absolute path of the scan root. */
  rootPath: string;
}) {
  const query = createMemo<LensQuery | null>(
    () => {
      const s = lens();
      return props.rootPath ? { path: props.rootPath, window: s.window, mode: s.mode, base: s.base, head: s.head, since: s.since, until: s.until, history: historyApplies(s) ? s.history : null, committedOnly: Boolean(s.committedOnly) } : null;
    },
    null,
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

  const [payload, setPayload] = createSignal<ChangeLensPayload | null>(null);
  const [error, setError] = createSignal<LensError | null>(null);
  const [loading, setLoading] = createSignal(false);
  let request = 0;
  const load = () => {
    const q = query();
    if (!q) return;
    const id = ++request;
    setLoading(true);
    setError(null);
    fetchChangeLens(q).then(
      (result) => {
        if (id !== request) return;
        setPayload(result);
        setLoading(false);
      },
      (e: unknown) => {
        if (id !== request) return;
        setPayload(null);
        setError(e instanceof LensError ? e : new LensError(0, e instanceof Error ? e.message : String(e)));
        setLoading(false);
      }
    );
  };
  createEffect(on(query, load));

  // Payload paths are repo paths; `location().at` is relative to the scan root, which can be a folder of the repo.
  const base = () => payload()?.selection.scope ?? "";
  /** The folder or file the map is zoomed to, as a repo path. */
  const scope = () => repoPath(base(), splitAt(location().at).file);
  const scan = createMemo(() => repoTree(props.data, props.rootPath, base()));
  const selected = createMemo<LensChunk | null>(() => payload()?.chunks.find((c) => c.id === lens().chunk) ?? null);
  const commit = createMemo(() => payload()?.commits.find((c) => c.sha === lens().commit) ?? null);
  const inventory = () => payload()?.changedPaths;
  const hasChanges = (p: ChangeLensPayload) => p.chunks.length > 0 || Boolean(p.changedPaths?.rows.length);
  const pathRows = createMemo(() => (inventory()?.rows ?? []).filter((r) => inScope(r.path, scope()) || Boolean(r.oldPath && inScope(r.oldPath, scope()))));
  const activePath = createMemo(() => lens().changedPaths ? pathRows().find((r) => r.id === lens().changedPath) ?? null : null);
  const pathCommit = () => {
    const sha = commit()?.sha;
    return sha && activePath()?.commits.includes(sha) ? sha : undefined;
  };
  const inView = createMemo(() => payload()?.chunks.filter((c) => inScope(c.path, scope())).length ?? 0);
  const zoom = (path: string) => go({ at: scanPath(base(), path) });

  let lastSelected: LensChunk | null = null;
  createEffect(() => {
    if (selected()) lastSelected = selected();
  });
  // A new result keeps the selected chunk and commit when they still exist. A range chunk's id holds its
  // lines, which differ between touched and net: it moves to the range of the same file that overlaps it.
  createEffect(
    on(payload, (p) => {
      if (!p) return;
      const s = lens();
      const patch: { chunk?: string | null; commit?: string | null } = {};
      if (s.chunk && !p.chunks.some((c) => c.id === s.chunk)) {
        const old = lastSelected;
        const twin = old && p.chunks.find((c) => c.path === old.path && c.kind === old.kind && c.startLine <= old.endLine && old.startLine <= c.endLine);
        patch.chunk = twin?.id ?? null;
      }
      if (s.commit && !p.commits.some((c) => c.sha === s.commit)) patch.commit = null;
      if (Object.keys(patch).length) setLens(patch, "step");
    })
  );

  // --- the open diff ----------------------------------------------------------------
  const [hunk, setHunk] = createSignal<{ chunk: string; commit?: string } | null>(null);
  const [diff, setDiff] = createSignal<LensHunkDiff | null>(null);
  const [diffError, setDiffError] = createSignal<string>();
  const [diffLoading, setDiffLoading] = createSignal(false);
  let diffRequest = 0;
  // The diff reloads when a new result arrives, not when the query changes: until then the chunk may not exist.
  createEffect(
    on([hunk, payload], ([h, p]) => {
      const id = ++diffRequest;
      const q = untrack(query);
      setDiffError(undefined);
      if (h && p && !p.chunks.some((c) => c.id === h.chunk)) {
        setHunk(null);
        return;
      }
      if (h?.commit && p && !p.commits.some((c) => c.sha === h.commit)) {
        setHunk({ chunk: h.chunk });
        return;
      }
      if (!h || !q || !p) {
        setDiff(null);
        setDiffLoading(false);
        return;
      }
      setDiffLoading(true);
      fetchHunk(q, h.chunk, h.commit).then(
        (result) => {
          if (id !== diffRequest) return;
          setDiff(result);
          setDiffLoading(false);
        },
        (e: unknown) => {
          if (id !== diffRequest) return;
          setDiff(null);
          setDiffError(e instanceof Error ? e.message : String(e));
          setDiffLoading(false);
        }
      );
    })
  );
  /** The selected commit's step when that commit changed the chunk, else the whole window. */
  const stepOf = (chunk: string) => (commit()?.chunkIds.includes(chunk) ? commit()!.sha : undefined);
  const [source, setSource] = createSignal<LensSourceLocation | null>(null);
  const [sourceError, setSourceError] = createSignal<string>();
  const [sourceLoading, setSourceLoading] = createSignal(false);
  let sourceRequest = 0;
  createEffect(on([query, selected, commit, hunk, activePath], () => {
    sourceRequest++;
    setSource(null);
    setSourceError(undefined);
    setSourceLoading(false);
  }));
  const [pathDiff, setPathDiff] = createSignal<LensPathDiff | null>(null);
  const [pathError, setPathError] = createSignal<string>();
  const [pathLoading, setPathLoading] = createSignal(false);
  createEffect(on([query, activePath, pathCommit, loading], ([q, row, step, busy]) => {
    setPathDiff(null);
    setPathError(undefined);
    setPathLoading(Boolean(q && row));
    if (!q || !row || busy) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    fetchPathDiff(q, row.id, step, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setPathDiff(result);
        setPathLoading(false);
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setPathError(e instanceof Error ? e.message : String(e));
        setPathLoading(false);
      },
    );
  }));
  const choosePath = (id: string) => {
    setHunk(null);
    setLens({ changedPath: id, pathSide: null, pathLine: null });
  };
  const pathSource = (side: LensSourceLocation["side"]) => side === "base" ? pathDiff()?.baseSource : pathDiff()?.headSource;
  const openPathSource = (target: LensSourceLocation, line: number | null = null) => {
    setLens({ pathSide: target.side, pathLine: line }, "step");
    setSource(line ? { ...target, startLine: line, endLine: line } : target);
  };
  const compareTarget = createMemo(() => {
    const row = activePath();
    const data = pathDiff();
    const inv = inventory();
    if (!row || !data || !inv || data.id !== row.id) return null;
    const base = pathCommit() ? data.baseRevision : inv.baseRevision;
    const head = pathCommit() ? data.headRevision : inv.headRevision;
    const reason = data.compareUnavailableReason ?? (!pathCommit() ? inv.compareUnavailableReason : null);
    if (reason || !base || !head) return { reason: reason || "Compare needs two exact committed revisions.", args: null };
    const preferred = (lens().pathSide === "base" ? data.baseSource : data.headSource) ?? data.baseSource ?? data.headSource;
    const line = preferred && lens().pathSide === preferred.side ? lens().pathLine : null;
    return {
      reason: null,
      args: {
        base, head, path: pathCommit() ? data.path : row.path,
        oldPath: (pathCommit() ? data.oldPath : row.oldPath) ?? undefined,
        touchedOnly: !pathCommit() && !row.hasNetDiff,
        scope: scope(),
        source: preferred?.revision ? { side: preferred.side, revision: preferred.revision, path: preferred.path, startLine: line ?? preferred.startLine, endLine: line ?? preferred.endLine } : undefined,
      },
    };
  });
  const openCode = async (chunk: LensChunk) => {
    const q = query();
    if (!q || loading()) return;
    const id = ++sourceRequest;
    setSourceError(undefined);
    setSourceLoading(true);
    try {
      const active = hunk();
      const step = active?.chunk === chunk.id ? active.commit : stepOf(chunk.id);
      const target = (await fetchHunk(q, chunk.id, step)).source;
      if (id !== sourceRequest) return;
      if (target) setSource(target);
      else setSourceError("No source is available for this chunk at the selected revisions.");
    } catch (e) {
      if (id === sourceRequest) setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === sourceRequest) setSourceLoading(false);
    }
  };
  const openHunk = (chunk: string, sha?: string) => {
    setHunk({ chunk, commit: sha ?? stepOf(chunk) });
    if (lens().chunk !== chunk) setLens({ chunk });
  };
  const openFromMap = (chunk: string) => openHunk(chunk);
  // An open diff follows the selected commit.
  createEffect(
    on(
      commit,
      () => {
        const open = untrack(hunk);
        if (open) setHunk({ chunk: open.chunk, commit: stepOf(open.chunk) });
      },
      { defer: true }
    )
  );
  // An open diff follows the selection, so the arrow keys step through diffs.
  createEffect(
    on(
      () => lens().chunk,
      (chunk) => {
        const open = hunk();
        if (!open || open.chunk === chunk) return;
        setHunk(chunk ? { chunk, commit: stepOf(chunk) } : null);
      },
      { defer: true }
    )
  );

  let rootRef: HTMLDivElement | undefined;
  const [narrow, setNarrow] = createSignal(false);
  onMount(() => {
    if (!rootRef) return;
    const observer = new ResizeObserver((entries) => setNarrow((entries[entries.length - 1]?.contentRect.width ?? 0) < NARROW_PX));
    observer.observe(rootRef);
    onCleanup(() => observer.disconnect());
  });

  /** For an empty window off main: the button that reads main's history instead, when main has commits there. */
  const mainOffer = createMemo(() => {
    const p = payload();
    const b = p?.selection.branch ?? null;
    if (!p || hasChanges(p) || !isOffMain(b) || p.selection.history !== "head" || !b.defaultCommits) return null;
    const commits = plural(b.defaultCommits, "commit");
    return p.selection.window === "branch"
      ? { label: `Show ${b.defaultRef}'s last 7 days (${commits})`, patch: { window: "7d" as const, history: "main" as const, commit: null } }
      : { label: `Show ${b.defaultRef}'s history (${commits})`, patch: { history: "main" as const, commit: null } };
  });

  const state = () => (error() ? (error()!.status === 409 ? "not-git" : "error") : !payload() ? "loading" : loading() ? "refreshing" : !hasChanges(payload()!) ? "empty" : "ready");

  /** Root › scope › the selected chunk's folders, file and name. Every folder and file zooms. */
  const crumbs = createMemo(() => {
    const out: { label: string; at: string; inScope: boolean }[] = [{ label: baseName(props.rootPath) || "repo", at: "", inScope: true }];
    const chunk = selected();
    const here = scanPath(base(), scope());
    const path = chunk && inScope(chunk.path, scope()) ? scanPath(base(), chunk.path) : here;
    const parts = path ? path.split("/") : [];
    parts.forEach((label, i) => {
      const at = parts.slice(0, i + 1).join("/");
      out.push({ label, at, inScope: inScope(here, at) });
    });
    return out;
  });

  return (
    <div ref={rootRef} class="flex h-full w-full flex-col bg-[var(--plc-surface)]" data-change-lens data-lens-state={state()}>
      <ViewTools>
        <WindowBar state={lens()} metricIds={payload()?.metricIds ?? []} onChange={(patch) => setLens(patch)} />
        <Show when={lens().committedOnly || inventory()?.requiresCommittedRange}>
          <Button size="xs" data-lens-worktree aria-pressed={Boolean(lens().committedOnly)} onClick={() => setLens({ committedOnly: !lens().committedOnly, commit: null, pathSide: null, pathLine: null })}>
            {lens().committedOnly ? "Include working tree" : "Show committed range"}
          </Button>
        </Show>
      </ViewTools>

      {/* What the window resolved to. One fixed-height row at rest; notes wrap under it. */}
      <div class="relative flex min-h-[28px] shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-[var(--plc-border)] px-3 py-0.5 text-[12px] text-[var(--plc-on-muted)]" data-lens-status>
        <Show when={payload()} fallback={<span class="text-[var(--plc-on-subtle)]">{loading() ? "Reading the history of this window…" : " "}</span>}>
          {(p) => (
            <>
              <Show when={isOffMain(p().selection.branch)}>
                <BranchNotice selection={p().selection} toggle={historyApplies(lens())} onHistory={(history) => setLens({ history, commit: null })} />
              </Show>
              <span class="plc-data-sm flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-[var(--plc-on-surface)]" title={`${p().selection.base.ref} → ${p().selection.head.ref}, history of ${p().selection.ref}`}>
                {p().selection.base.label}
                <ArrowRight size={12} class="text-[var(--plc-on-subtle)]" aria-label="to" />
                {p().selection.head.label}
              </span>
              <span class="shrink-0 tabular-nums">
                {plural(p().commits.filter((c) => c.date !== null).length, "commit")}
                {p().selection.includesWorktree ? " + uncommitted edits" : ""}
              </span>
              <Show when={timeLimits(p().selection)}>{(text) => <span class="shrink-0 tabular-nums">{text()}</span>}</Show>
              <Show when={!timeLimits(p().selection)}>
                <span class="shrink-0">Times in {p().selection.timezone}</span>
              </Show>
              <span class="shrink-0">{p().selection.mode === "touched" ? "Touched: every chunk a commit changed" : "Net: what differs from start to end"}</span>
              {/* An empty window says why in the middle of the view, not twice. */}
              <For each={hasChanges(p()) ? p().selection.notes : []}>{(note) => <span class="text-[var(--plc-on-subtle)]" data-lens-note>{note}</span>}</For>
            </>
          )}
        </Show>
        {/* Out of the flow, so the line never wraps differently while a window loads. */}
        <span class="absolute right-2 top-1 rounded bg-[var(--plc-surface)] px-1.5 text-[var(--plc-on-subtle)] empty:hidden" aria-live="polite" data-lens-updating>
          {loading() && payload() ? "Updating…" : ""}
        </span>
      </div>

      <Show when={state() === "not-git"}>
        <Message state="not-git" title="This folder is not a git repository">
          <p>{error()!.message}</p>
          <p class="mt-1">Changes reads commits and the working tree, so it needs a repository. The Treemap, Graph and 2x2 views work without one.</p>
        </Message>
      </Show>
      <Show when={state() === "error"}>
        <Message state="error" title="The changes could not be read">
          <p class="plc-data-sm break-words text-[12px] text-[var(--plc-error)]">{error()!.message}</p>
          <Button class="mt-2" onClick={load}>
            Try again
          </Button>
        </Message>
      </Show>
      <Show when={state() === "loading"}>
        <Message state="loading" title="Reading the history of this window…" />
      </Show>
      <Show when={state() === "empty"}>
        <Message state="empty" title={inventory()?.requiresCommittedRange ? "Changed paths need a committed range" : "No edits in this window"}>
          <For each={payload()!.selection.notes}>{(note) => <p>{note}</p>}</For>
          <Show when={mainOffer()}>
            {(offer) => (
              <>
                <p class="mt-1">This checkout is not on {payload()!.selection.branch!.default}, so its own history misses the work that landed there.</p>
                <Button class="mt-2" variant="primary" data-lens-main-offer onClick={() => setLens(offer().patch)}>
                  {offer().label}
                </Button>
              </>
            )}
          </Show>
          <Show when={inventory()?.unavailableReason}><p role="status">{inventory()!.unavailableReason}</p></Show>
          <p class="mt-1">Pick another window in the toolbar: 7 days reaches further back, and Custom takes any two revisions.</p>
        </Message>
      </Show>

      <Show when={(state() === "ready" || state() === "refreshing") && payload()}>
        {(p) => (
          <div class="flex min-h-0 flex-1" classList={{ "flex-col": narrow() }}>
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* The diff opens under the map, which shrinks to make room, so the selected chunk stays in view. */}
              <div class="relative flex min-h-0 flex-1 flex-col">
              <div class="flex h-[26px] shrink-0 items-center gap-3 px-3 text-[12px]">
                <nav aria-label="Map scope" class="flex max-w-[75%] shrink-0 items-center overflow-hidden whitespace-nowrap" data-lens-crumbs>
                  <For each={crumbs()}>
                    {(crumb, i) => (
                      <>
                        <Show when={i() > 0}>
                          <span aria-hidden="true" class="px-1 text-[var(--plc-on-disabled)]">
                            ›
                          </span>
                        </Show>
                        <button
                          type="button"
                          class="rounded px-0.5 hover:text-[var(--plc-accent)]"
                          classList={{ "text-[var(--plc-on-surface)]": crumb.inScope, "text-[var(--plc-on-subtle)]": !crumb.inScope, "font-semibold": crumb.at === scanPath(base(), scope()) }}
                          title={crumb.at === scanPath(base(), scope()) ? "The map shows this" : `Zoom the map to ${crumb.at || baseName(props.rootPath)}`}
                          data-crumb={crumb.at}
                          onClick={() => go({ at: crumb.at })}
                        >
                          {crumb.label}
                        </button>
                      </>
                    )}
                  </For>
                  <Show when={selected() && inScope(selected()!.path, scope()) ? selected() : null}>
                    {(chunk) => (
                      <>
                        <span aria-hidden="true" class="px-1 text-[var(--plc-on-disabled)]">
                          ›
                        </span>
                        <span class="plc-data-sm min-w-0 truncate text-[12px] font-semibold text-[var(--plc-accent)]" data-crumb-chunk>
                          {chunk().name}
                        </span>
                      </>
                    )}
                  </Show>
                </nav>
                <Button size="xs" data-lens-toggle-paths aria-pressed={Boolean(lens().changedPaths)} onClick={() => {
                  if (!lens().changedPaths) setHunk(null);
                  setLens({ changedPaths: !lens().changedPaths, changedPath: null, pathSide: null, pathLine: null });
                }}>
                  {lens().changedPaths ? "Structural review" : "Changed paths"}
                </Button>
                <span class="min-w-0 flex-1 truncate text-right tabular-nums text-[var(--plc-on-subtle)]" data-lens-summary>
                  {fileCount(p())} · {plural(p().summary.chunks, "chunk")} · {p().summary.churnLines.toLocaleString("en-US")} lines churned / {p().summary.netLines.toLocaleString("en-US")} net
                  {p().summary.reverted ? ` · ${p().summary.reverted} reverted` : ""}
                </span>
              </div>
              <div class="relative min-h-0 flex-1 transition-opacity duration-150" classList={{ "opacity-50": state() === "refreshing" }} aria-busy={state() === "refreshing"}>
                <LensMap
                  payload={p()}
                  layout={lens().layout}
                  scope={scope()}
                  lens={{ metric: lens().metric, color: lens().color }}
                  selected={lens().chunk}
                  commit={commit()}
                  tree={scan().tree}
                  filesIn={(folder) => scan().fileCounts.get(folder) ?? null}
                  onSelect={(chunk, how) => setLens({ chunk }, how)}
                  onOpen={openFromMap}
                  onZoom={zoom}
                />
                <Show when={lens().layout === "edits" && inView() === 0}>
                  <div class="absolute inset-0 flex items-center justify-center text-[13px] text-[var(--plc-on-muted)]" data-lens-message="empty-scope">
                    <span>
                      {pathRows().length ? "No structural chunks under" : "No edits under"} <span class="plc-data-sm text-[12px] text-[var(--plc-on-surface)]">{scanPath(base(), scope())}</span> in this window.{" "}
                      <button type="button" class="text-[var(--plc-accent)] hover:text-[var(--plc-accent-hover)]" onClick={() => go({ at: "" })}>
                        Show the whole repo
                      </button>
                    </span>
                  </div>
                </Show>
              </div>
              <Legend lens={{ metric: lens().metric, color: lens().color }} layout={lens().layout} />
              <Show when={activePath()}>
                {(row) => (
                  <section class="flex h-[50%] min-h-[220px] shrink-0 flex-col border-t border-[var(--plc-border)]" aria-label="Changed path evidence" data-path-evidence={row().path}>
                    <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--plc-border)] px-3 py-1.5 text-[12px]">
                      <label class="flex items-center gap-1.5">
                        Evidence
                        <select aria-label="Changed path evidence window" class="max-w-[21ch] bg-[var(--plc-surface)]" value={pathCommit() ?? ""} onChange={(e) => setLens({ commit: e.currentTarget.value || null, pathSide: null, pathLine: null })}>
                          <option value="">Whole window</option>
                          <For each={payload()?.commits.filter((c) => row().commits.includes(c.sha)) ?? []}>
                            {(c) => <option value={c.sha}>{c.short} {c.subject}</option>}
                          </For>
                        </select>
                      </label>
                      <Show when={!row().measured}>
                        <span data-no-structural-metrics title={row().metricReason ?? undefined}>No structural metrics</span>
                      </Show>
                      <Show when={pathDiff()?.baseSource}>{(target) => <Button size="xs" data-path-source="base" onClick={() => openPathSource(target())}>Open base source</Button>}</Show>
                      <Show when={pathDiff()?.headSource}>{(target) => <Button size="xs" data-path-source="head" onClick={() => openPathSource(target())}>Open head source</Button>}</Show>
                      <Show when={compareTarget()?.args}>{(args) => <Button size="xs" data-path-compare onClick={() => enterPathCompare(args())}>Open in Compare</Button>}</Show>
                      <Show when={compareTarget()?.reason}>{(reason) => <span class="text-[var(--plc-on-muted)]">Compare unavailable: {reason()}</span>}</Show>
                    </div>
                    <div class="min-h-0 flex-1">
                      <HunkDiff diff={pathDiff()} loading={pathLoading()} error={pathError()} noHunksReason={pathDiff()?.reason}
                        canOpenLine={(side) => Boolean(pathSource(side))}
                        onOpenLine={(side, line) => {
                          const target = pathSource(side);
                          if (target) openPathSource(target, line);
                        }}
                        ignoreEscape={Boolean(source())} onClose={() => {
                          // The normal app stays mounted under Compare; Escape there belongs to Compare.
                          if (!readCompareParam()) setLens({ changedPath: null, pathSide: null, pathLine: null });
                        }} />
                    </div>
                  </section>
                )}
              </Show>
              <Show when={hunk() && !activePath()}>
                <div class="h-[50%] min-h-[220px] shrink-0 border-t border-[var(--plc-border)]" data-lens-hunk>
                  <HunkDiff diff={diff()} loading={diffLoading()} error={diffError()} ignoreEscape={Boolean(source())} onClose={() => { if (!readCompareParam()) setHunk(null); }} />
                </div>
              </Show>
              </div>
              <div class="shrink-0 border-t border-[var(--plc-border)]" data-lens-rail>
                <CommitRail commits={p().commits} selected={commit()?.sha ?? null} onSelect={(sha) => setLens({ commit: sha })} highlightChunk={lens().chunk} />
              </div>
            </div>
            <aside class="flex min-h-0 shrink-0 flex-col border-[var(--plc-border)]" classList={{ "w-[340px] border-l": !narrow(), "h-[42%] border-t": narrow() }} data-lens-panel>
              <Show when={lens().changedPaths} fallback={<>
              <div class="max-h-[45%] shrink-0 overflow-auto border-b border-[var(--plc-border)]">
                <ReviewBuckets payload={p()} selected={lens().chunk} onSelect={(chunk) => setLens({ chunk })} />
              </div>
              <div class="min-h-0 flex-1 overflow-auto">
                <ChunkInspector payload={p()} chunk={selected()} onOpenHunk={openHunk} onOpenCode={openCode} sourceBusy={sourceLoading() || loading()} />
                <Show when={sourceError()}>
                  <p role="alert" class="px-3 pb-3 text-[12px] text-[var(--plc-warning)]">{sourceError()}</p>
                </Show>
              </div>
              </>}>
                <ChangedPaths inventory={inventory()} rows={pathRows()} selected={lens().changedPath} busy={loading()} onSelect={choosePath} />
              </Show>
            </aside>
          </div>
        )}
      </Show>
      <Show when={source()} keyed>
        {(target) => {
          const filePath = `${target.repoRoot.replace(/\/$/, "")}/${target.path}`;
          return (
            <CodeModal
              isOpen={true}
              filePath={filePath}
              rootPath={target.revision ? target.repoRoot : props.rootPath}
              gitRef={target.revision}
              revisionSide={target.side}
              startLine={target.startLine}
              endLine={target.endLine}
              fileNode={target.revision ? null : findTreeNodeByPath(props.data, filePath)}
              onClose={() => setSource(null)}
            />
          );
        }}
      </Show>
    </div>
  );
}
