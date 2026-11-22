// The Changes view (`?view=changes`): which code a window of work touched.
// It owns the fetches and the URL state; the map and the panel pieces get
// everything through props.

import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, type JSX } from "solid-js";
import { ArrowRight } from "lucide-solid";
import { Button } from "../components/ui/Button";
import { atFromTreePath, baseName, splitAt } from "../navigation/location";
import { go, location } from "../navigation/store";
import { ViewTools } from "../viz/viewToolbar";
import { fetchChangeLens, fetchHunk, LensError, type LensQuery } from "./api";
import { plural, timeLimits } from "./labels";
import { inScope, type RepoNode } from "./layout";
import Legend from "./Legend";
import LensMap from "./LensMap";
import { ChunkInspector, CommitRail, HunkDiff, ReviewBuckets } from "./slots";
import type { ChangeLensPayload, LensChunk, LensHunkDiff } from "./types";
import { lens, setLens } from "./urlState";
import WindowBar from "./WindowBar";

/** Below this width the panel moves under the map. */
const NARROW_PX = 900;

interface ScanNode {
  name: string;
  path: string;
  type: string;
  children?: ScanNode[];
  metrics?: { loc?: number; file_count?: number };
}

/** The scan tree as folders and files with repo-relative paths, and each folder's file count. */
function repoTree(data: ScanNode | null, root: string): { tree: RepoNode | null; fileCounts: Map<string, number> } {
  const fileCounts = new Map<string, number>();
  const walk = (node: ScanNode): RepoNode | null => {
    const path = atFromTreePath(node.path, root);
    if (path === null) return null;
    if (node.type === "file") return { name: node.name, path, loc: node.metrics?.loc ?? 0 };
    if (node.type !== "folder") return null;
    const children = (node.children ?? []).map(walk).filter((c): c is RepoNode => c !== null && (!c.children || c.children.length > 0));
    const files = children.reduce((n, c) => n + (c.children ? (fileCounts.get(c.path) ?? 0) : 1), 0);
    fileCounts.set(path, files);
    return { name: node.name, path, loc: node.metrics?.loc ?? 0, children };
  };
  return { tree: data ? walk(data) : null, fileCounts };
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
  /** Open a file or scope in the code viewer. */
  onOpenAt: (at: string, line?: number) => void;
}) {
  const query = createMemo<LensQuery | null>(
    () => {
      const s = lens();
      return props.rootPath ? { path: props.rootPath, window: s.window, mode: s.mode, base: s.base, head: s.head, since: s.since, until: s.until } : null;
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

  const scope = () => splitAt(location().at).file;
  const scan = createMemo(() => repoTree(props.data, props.rootPath));
  const selected = createMemo<LensChunk | null>(() => payload()?.chunks.find((c) => c.id === lens().chunk) ?? null);
  const commit = createMemo(() => payload()?.commits.find((c) => c.sha === lens().commit) ?? null);
  const inView = createMemo(() => payload()?.chunks.filter((c) => inScope(c.path, scope())).length ?? 0);

  // --- the open diff ----------------------------------------------------------------
  const [hunk, setHunk] = createSignal<{ chunk: string; commit?: string } | null>(null);
  const [diff, setDiff] = createSignal<LensHunkDiff | null>(null);
  const [diffError, setDiffError] = createSignal<string>();
  const [diffLoading, setDiffLoading] = createSignal(false);
  let diffRequest = 0;
  createEffect(
    on([hunk, query], ([h, q]) => {
      const id = ++diffRequest;
      setDiffError(undefined);
      if (!h || !q) {
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
  const openHunk = (chunk: string, sha?: string) => {
    setHunk({ chunk, commit: sha });
    if (lens().chunk !== chunk) setLens({ chunk });
  };
  /** From the map: the selected commit's step when that commit changed the chunk, else the whole window. */
  const openFromMap = (chunk: string) => openHunk(chunk, commit()?.chunkIds.includes(chunk) ? commit()!.sha : undefined);
  // An open diff follows the selection, so the arrow keys step through diffs.
  createEffect(
    on(
      () => lens().chunk,
      (chunk) => {
        const open = hunk();
        if (!open || open.chunk === chunk) return;
        setHunk(chunk ? { chunk } : null);
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

  const state = () => (error() ? (error()!.status === 409 ? "not-git" : "error") : !payload() ? "loading" : !payload()!.chunks.length ? "empty" : loading() ? "refreshing" : "ready");

  /** Root › scope › the selected chunk's folders, file and name. Every folder and file zooms. */
  const crumbs = createMemo(() => {
    const out: { label: string; at: string; inScope: boolean }[] = [{ label: baseName(props.rootPath) || "repo", at: "", inScope: true }];
    const chunk = selected();
    const path = chunk && inScope(chunk.path, scope()) ? chunk.path : scope();
    const parts = path ? path.split("/") : [];
    parts.forEach((label, i) => {
      const at = parts.slice(0, i + 1).join("/");
      out.push({ label, at, inScope: inScope(scope(), at) });
    });
    return out;
  });

  return (
    <div ref={rootRef} class="flex h-full w-full flex-col bg-[var(--plc-surface)]" data-change-lens data-lens-state={state()}>
      <ViewTools>
        <WindowBar state={lens()} metricIds={payload()?.metricIds ?? []} onChange={(patch) => setLens(patch)} />
      </ViewTools>

      {/* What the window resolved to. One fixed-height row at rest; notes wrap under it. */}
      <div class="flex min-h-[28px] shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-[var(--plc-border)] px-3 py-1 text-[12px] text-[var(--plc-on-muted)]" data-lens-status>
        <Show when={payload()} fallback={<span class="text-[var(--plc-on-subtle)]">{loading() ? "Reading the history of this window…" : " "}</span>}>
          {(p) => (
            <>
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
              <For each={p().chunks.length ? p().selection.notes : []}>{(note) => <span class="text-[var(--plc-on-subtle)]" data-lens-note>{note}</span>}</For>
            </>
          )}
        </Show>
        <span class="ml-auto w-[5.5rem] shrink-0 text-right text-[var(--plc-on-subtle)]" aria-live="polite">
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
        <Message state="empty" title="No edits in this window">
          <For each={payload()!.selection.notes}>{(note) => <p>{note}</p>}</For>
          <p class="mt-1">Pick another window in the toolbar: 7 days reaches further back, and Custom takes any two revisions.</p>
        </Message>
      </Show>

      <Show when={(state() === "ready" || state() === "refreshing") && payload()}>
        {(p) => (
          <div class="flex min-h-0 flex-1" classList={{ "flex-col": narrow() }}>
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* The diff opens over the map and its legend; the commit rail under them stays in reach. */}
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
                          classList={{ "text-[var(--plc-on-surface)]": crumb.inScope, "text-[var(--plc-on-subtle)]": !crumb.inScope, "font-semibold": crumb.at === scope() }}
                          title={crumb.at === scope() ? "The map shows this" : `Zoom the map to ${crumb.at || "the whole repo"}`}
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
                <span class="min-w-0 flex-1 truncate text-right tabular-nums text-[var(--plc-on-subtle)]" data-lens-summary>
                  {plural(p().summary.filesEdited, "file")} of {p().summary.filesTotal.toLocaleString("en-US")} · {plural(p().summary.chunks, "chunk")} · {p().summary.churnLines.toLocaleString("en-US")} lines churned / {p().summary.netLines.toLocaleString("en-US")} net
                  {p().summary.reverted ? ` · ${p().summary.reverted} reverted` : ""}
                </span>
              </div>
              <div class="relative min-h-0 flex-1">
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
                  onZoom={(at) => go({ at })}
                />
                <Show when={lens().layout === "edits" && inView() === 0}>
                  <div class="absolute inset-0 flex items-center justify-center text-[13px] text-[var(--plc-on-muted)]" data-lens-message="empty-scope">
                    <span>
                      No edits under <span class="plc-data-sm text-[12px] text-[var(--plc-on-surface)]">{scope()}</span> in this window.{" "}
                      <button type="button" class="text-[var(--plc-accent)] hover:text-[var(--plc-accent-hover)]" onClick={() => go({ at: "" })}>
                        Show the whole repo
                      </button>
                    </span>
                  </div>
                </Show>
              </div>
              <Legend lens={{ metric: lens().metric, color: lens().color }} layout={lens().layout} />
              <Show when={hunk()}>
                <div class="plc-floating absolute inset-x-0 bottom-0 z-20 h-[58%] border-t" data-lens-hunk>
                  <HunkDiff diff={diff()} loading={diffLoading()} error={diffError()} onClose={() => setHunk(null)} />
                </div>
              </Show>
              </div>
              <div class="shrink-0 border-t border-[var(--plc-border)]" data-lens-rail>
                <CommitRail commits={p().commits} selected={commit()?.sha ?? null} onSelect={(sha) => setLens({ commit: sha })} highlightChunk={lens().chunk} />
              </div>
            </div>
            <aside class="flex min-h-0 shrink-0 flex-col border-[var(--plc-border)]" classList={{ "w-[340px] border-l": !narrow(), "h-[42%] border-t": narrow() }} data-lens-panel>
              <div class="max-h-[45%] shrink-0 overflow-auto border-b border-[var(--plc-border)]">
                <ReviewBuckets payload={p()} selected={lens().chunk} onSelect={(chunk) => setLens({ chunk })} />
              </div>
              <div class="min-h-0 flex-1 overflow-auto">
                <ChunkInspector payload={p()} chunk={selected()} onOpenHunk={openHunk} onOpenCode={(chunk) => props.onOpenAt(chunk.path, chunk.startLine)} />
              </div>
            </aside>
          </div>
        )}
      </Show>
    </div>
  );
}
