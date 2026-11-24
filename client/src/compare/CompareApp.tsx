import { RefreshCw, X } from "lucide-solid";
import { createEffect, createResource, createSignal, For, lazy, onCleanup, onMount, Show } from "solid-js";
import { EmptyState, ErrorState } from "../components/feedback/States";
import { Button } from "../components/ui/Button";
import {
  cancelCompare,
  compareRepo,
  fetchCommits,
  readFilterParam,
  FILTER_PARAM,
  fetchCompareResult,
  navigateStep,
  prewarm,
  readRangeParam,
  navigateCompare,
  PICK_PARAM,
  readCompareParam,
  readPathHandoff,
  exitPathCompare,
  startCompare,
  watchCompare,
  type CompareSnapshot,
} from "./api";
import { CompareProgress } from "./CompareProgress";
import { CompareTable } from "./CompareTable";
import { CompareGraph } from "./CompareGraph";
import { CompareTreemap } from "./CompareTreemap";
import { DEFAULT_COMPARE_COLUMNS } from "./metrics";
import { CommitStepper } from "./CommitStepper";
import { ComparePicker } from "./ComparePicker";
import { activeStep, stepRefs } from "./stepper";
import { Inspector } from "./Inspector";
import { ALL_STATUSES, buildRows, collectFiles, filterFiles, indexFiles, type FileRow, type RowSort } from "./rows";
import { Scorecard } from "./Scorecard";
import { SummaryStrip } from "./SummaryStrip";
import type { ComparePayload } from "./types";

const CodeModal = lazy(() => import("../components/CodeModal/CodeModal.tsx"));

const SORT_PARAM = "csort";
const FILE_PARAM = "cfile";
const VIEW_PARAM = "cview";

type CompareView = "files" | "treemap" | "graph";
const VIEWS: { id: CompareView; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "treemap", label: "Treemap" },
  { id: "graph", label: "Dependencies" },
];

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/*
 * History rule. A push marks a new review step: picking a compare, stepping a
 * commit, opening a path from Changes, entering or leaving compare. Everything
 * inside one review (path filter, sort, view, selected file) is a replace, so
 * Back and Forward walk review steps, never keystrokes, and each step's URL
 * still holds the state it was left in. The source overlay is not in the URL:
 * Close and Escape close it, Back does not.
 */
function writeParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.pathname + url.search);
}

/** PR compare mode: two refs, scanned and diffed, shown as focused before/after views. */
export default function CompareApp() {
  const initial = readCompareParam() ?? { base: "merge-base", head: "WORKTREE" };
  const [refs, setRefs] = createSignal(initial);
  // The repo the shown result came from; a different `repo` in the URL is a new review.
  let repo = compareRepo();
  const [snapshot, setSnapshot] = createSignal<CompareSnapshot | null>(null);
  const [payload, setPayload] = createSignal<ComparePayload | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [columns, setColumns] = createSignal(DEFAULT_COMPARE_COLUMNS);
  const [sort, setSort] = createSignal<RowSort>(readParam(SORT_PARAM) ?? "tree");
  const [filter, setFilter] = createSignal(readFilterParam());
  const [handoff, setHandoff] = createSignal(readPathHandoff());
  const [selected, setSelected] = createSignal<string | null>(readParam(FILE_PARAM));
  const [view, setView] = createSignal<CompareView>((readParam(VIEW_PARAM) as CompareView) ?? "files");
  const [colorMetric, setColorMetric] = createSignal("complexity");
  const [openFile, setOpenFile] = createSignal<{ path: string; side: "base" | "head" } | null>(null);
  // Arriving from the main app's Compare button opens the picker once, and
  // nothing runs until a compare is picked.
  const [picking, setPicking] = createSignal(readParam(PICK_PARAM) !== null);
  const [ran, setRan] = createSignal(!picking());
  if (picking()) writeParam(PICK_PARAM, null);
  let request = 0;
  let stop: (() => void) | null = null;

  const run = async (base: string, head: string, force = false) => {
    const mine = ++request;
    setRan(true);
    stop?.();
    const running = snapshot();
    if (running) void cancelCompare(running.id).catch(() => {});
    setRefs({ base, head });
    repo = compareRepo();
    setError(null);
    setPayload(null);
    try {
      const started = await startCompare(base, head, force);
      if (mine !== request) return;
      setSnapshot(started);
      stop = watchCompare(started.id, {
        onUpdate: (s) => mine === request && setSnapshot(s),
        onDone: async (s) => {
          if (mine !== request) return;
          if (s.phase === "complete") {
            const result = await fetchCompareResult(s.id).catch((e) => {
              setError(String(e?.message ?? e));
              return null;
            });
            if (mine !== request) return;
            if (result) {
              setPayload(result);
              setColumns((cols) => {
                const moved = cols.filter((c) => result.summary.metrics[c]);
                return moved.length ? moved : DEFAULT_COMPARE_COLUMNS;
              });
              // Keep a selection from the URL if it's still a changed file;
              // otherwise start on the most regressed file.
              const path = handoff();
              if (path && !result.files.some((f) => f.path === selected())) {
                const match = path.touchedOnly ? null : result.files.find((f) => f.path === path.path || Boolean(path.oldPath && f.oldPath === path.oldPath));
                select(match?.path ?? path.path);
              } else if (!result.files.some((f) => f.path === selected())) {
                // Start inside the URL's path filter, so the inspector shows a visible row.
                const all = collectFiles(result.files, new Map(), false);
                const kept = filterFiles(all, { statuses: new Set(ALL_STATUSES), regressionsOnly: false, query: filter() });
                const first = buildRows(kept.some((f) => f.change) ? kept : all, {
                  showUnchanged: false,
                  sort: "regressed",
                  collapsed: new Set(),
                })[0] as FileRow | undefined;
                select(first?.path ?? null);
              }
            }
          } else if (s.phase === "failed") {
            setError(s.error ?? "The compare failed.");
          }
          setSnapshot(null);
        },
      });
    } catch (e) {
      if (mine === request) setError(String(e instanceof Error ? e.message : e));
    }
  };

  // The range a commit stepper walks: the one being stepped through (from the
  // URL), else the current compare when its head is a commit.
  const [range, setRange] = createSignal(readRangeParam());
  const stepRange = () => {
    const p = payload();
    return range() ?? (p && p.head.sha && p.base.sha ? refs() : null);
  };
  const [commitList] = createResource(
    () => {
      const r = stepRange();
      return r ? `${r.base}..${r.head}` : false;
    },
    (key) => {
      const at = key.indexOf("..");
      return fetchCommits(key.slice(0, at), key.slice(at + 2)).catch(() => null);
    }
  );
  const steps = () => {
    const list = commitList.latest;
    return list && list.commits.length > 1 ? list : null;
  };
  const step = () => {
    const list = steps();
    const p = payload();
    return list && p ? activeStep(list.commits, list.base.sha, p.base.sha, p.head.sha) : -1;
  };
  const goStep = (i: number) => {
    const list = steps();
    const r = stepRange();
    if (!list || !r) return;
    const next = stepRefs(list.commits, list.base.sha, i);
    navigateStep(next.base, next.head, r);
  };
  const goWhole = () => {
    const r = stepRange();
    if (r) navigateStep(r.base, r.head, null);
  };
  // After a step lands, scan the next commit in the background so ▶ is a cache hit.
  createEffect(() => {
    const list = steps();
    const i = step();
    if (list && payload() && i >= 0 && i + 1 < list.commits.length) void prewarm(list.commits[i + 1].sha);
  });
  const wholeLabel = () => {
    const pr = /^pr:(\d+)$/.exec(stepRange()?.head ?? "");
    return pr ? `Whole PR #${pr[1]}` : "Whole range";
  };

  // Back/Forward land on an entry whose URL holds that step's state; read it all back.
  const onPopState = () => {
    setRange(readRangeParam());
    setHandoff(readPathHandoff());
    setFilter(readFilterParam());
    setSelected(readParam(FILE_PARAM));
    setSort(readParam(SORT_PARAM) ?? "tree");
    setView((readParam(VIEW_PARAM) as CompareView) ?? "files");
    const next = readCompareParam();
    if (next && (next.base !== refs().base || next.head !== refs().head || compareRepo() !== repo)) {
      // Another repo or ref pair: the open source belongs to the old result.
      setOpenFile(null);
      void run(next.base, next.head);
    }
  };
  onMount(() => {
    if (ran()) void run(initial.base, initial.head);
    window.addEventListener("popstate", onPopState);
  });
  onCleanup(() => {
    stop?.();
    window.removeEventListener("popstate", onPopState);
  });

  const compare = (base: string, head: string) => {
    if (base === refs().base && head === refs().head) return void run(base, head);
    navigateCompare(base, head);
  };

  const changeSort = (next: RowSort) => {
    setSort(next);
    writeParam(SORT_PARAM, next === "tree" ? null : next);
  };
  const changeFilter = (next: string) => {
    setFilter(next);
    writeParam(FILTER_PARAM, next || null);
  };
  const changeView = (next: CompareView) => {
    setView(next);
    writeParam(VIEW_PARAM, next === "files" ? null : next);
  };
  function select(path: string | null) {
    setSelected(path);
    writeParam(FILE_PARAM, path);
  }
  // From the scorecard: rank by that metric and make sure it's a visible column.
  const pickMetric = (metric: string) => {
    if (!columns().includes(metric)) setColumns([metric, ...columns()]);
    changeSort(sort() === metric ? "tree" : metric);
  };
  const openSide = (path: string, side?: "base" | "head") => {
    const f = payload()?.files.find((x) => x.path === path);
    const carried = handoff()?.path === path ? handoff()?.source?.side : undefined;
    setOpenFile({ path, side: side ?? carried ?? (f?.status === "removed" ? "base" : "head") });
  };

  // The code viewer reads the base side from its commit and the head side
  // from its commit, or from the disk for the working tree.
  const viewer = () => {
    const target = openFile();
    const p = payload();
    if (!target || !p) return null;
    const change = p.files.find((f) => f.path === target.path);
    const path = target.side === "base" ? (change?.oldPath ?? target.path) : target.path;
    const side = target.side === "base" ? p.base : p.head;
    const tree = target.side === "base" ? p.trees?.base : p.trees?.head;
    const carried = handoff()?.source;
    const range = carried && carried.path === path && carried.side === target.side && carried.revision === side.sha ? carried : undefined;
    return {
      startLine: range?.startLine,
      endLine: range?.endLine,
      revisionSide: target.side,
      // Another worktree's files live in its own directory.
      filePath: `${side.dir ?? p.repo.root}/${path}`,
      gitRef: side.sha,
      rootPath: side.sha ? p.repo.root : undefined,
      fileNode: indexFiles(tree).get(path) ?? null,
    };
  };

  return (
    <div
      class="plc-app-shell flex h-screen flex-col overflow-hidden"
      data-scan-state={payload() ? "ready" : error() ? "error" : "loading"}
    >
      <header class="plc-topbar flex items-center gap-4 border-b px-4">
        <h1 class="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--plc-primary)]">
          <img src="/favicon.svg" alt="" class="h-5 w-5" />
          Srcly
          <span class="font-normal text-[var(--plc-on-subtle)]">compare</span>
        </h1>
        <ComparePicker
          base={refs().base}
          head={refs().head}
          busy={Boolean(snapshot())}
          payload={payload()}
          open={picking()}
          onOpenChange={setPicking}
          onCompare={compare}
        />
        <div class="flex-1" />
        <Show when={payload()}>
          <Button
            variant="ghost"
            class="shrink-0 gap-1.5"
            title="Scan both sides again, ignoring saved results"
            onClick={() => void run(refs().base, refs().head, true)}
          >
            <RefreshCw size={13} aria-hidden="true" />
            Rescan
          </Button>
        </Show>
        <Button variant="ghost" class="shrink-0 gap-1.5" onClick={() => handoff() ? exitPathCompare() : navigateCompare(null)}>
          <X size={13} aria-hidden="true" />
          {handoff() ? "Back to Changes" : "Exit compare"}
        </Button>
      </header>

      <main class="flex min-h-0 flex-1 flex-col">
        <Show when={handoff()}>{(path) => (
          <div class="shrink-0 border-b border-[var(--plc-border)] px-4 py-2 text-[12px]" data-compare-path-handoff>
            <span class="plc-data-sm break-all">{path().path}</span>
            <Show when={path().scope}> · Changes scope: {path().scope}. Compare shows repository endpoints.</Show>
            <Show when={path().touchedOnly || (payload() && !payload()!.files.some((f) => f.path === path().path || Boolean(path().oldPath && f.oldPath === path().oldPath)))}>
              <p data-compare-no-endpoint role="status">
                {path().touchedOnly ? "Touched in Changes, but this path has no endpoint diff." : "This path has no entry in the endpoint comparison."}
                {" "}Return to Changes for the original evidence.
              </p>
            </Show>
          </div>
        )}</Show>
        <Show when={!ran()}>
          <EmptyState
            title="Choose what to compare"
            description="Pick a PR, worktree, or branch. Nothing is scanned until you choose."
            actions={<Button onClick={() => setPicking(true)}>Choose a comparison</Button>}
          />
        </Show>
        <Show when={error()}>
          <ErrorState title="Compare failed" message={error()} class="m-6" tone="error" />
        </Show>
        <Show when={snapshot()}>
          {(s) => <CompareProgress snapshot={s()} onCancel={() => void cancelCompare(s().id)} />}
        </Show>
        <Show when={payload()}>
          {(p) => (
            <>
              <SummaryStrip payload={p()} />
              <Show when={steps()}>
                {(list) => (
                  <CommitStepper
                    list={list()}
                    active={step()}
                    wholeLabel={wholeLabel()}
                    onStep={goStep}
                    onWhole={goWhole}
                  />
                )}
              </Show>
              <Show
                when={p().files.length}
                fallback={
                  <EmptyState
                    title="No changes"
                    description={`${p().base.label} and ${p().head.label} have the same files.`}
                  />
                }
              >
                <div class="flex min-h-0 flex-1">
                  <aside class="w-[264px] 2xl:w-[300px] shrink-0 overflow-y-auto border-r border-[var(--plc-border)] bg-[var(--plc-surface)]">
                    <Scorecard
                      payload={p()}
                      activeMetric={sort() === "tree" || sort() === "regressed" ? null : sort()}
                      onPickMetric={pickMetric}
                    />
                  </aside>
                  <div class="flex min-w-0 flex-1 flex-col">
                    <div class="flex h-9 shrink-0 items-end gap-1 border-b border-[var(--plc-border)] bg-[var(--plc-surface)] px-3" role="tablist">
                      <For each={VIEWS}>
                        {(v) => (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={view() === v.id}
                            class={
                              "-mb-px h-8 border-b-2 px-3 text-[13px] transition-colors duration-150 " +
                              (view() === v.id
                                ? "border-[var(--plc-accent)] font-semibold text-[var(--plc-on-surface)]"
                                : "border-transparent text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)]")
                            }
                            onClick={() => changeView(v.id)}
                          >
                            {v.label}
                          </button>
                        )}
                      </For>
                    </div>
                    <div class="min-h-0 flex-1">
                    <Show when={view() === "graph"}>
                        <CompareGraph
                          payload={p()}
                          selected={selected()}
                          onSelect={select}
                          onOpenFile={(path, side) => openSide(path, side)}
                        />
                      </Show>
                      <Show when={view() === "treemap"}>
                      <CompareTreemap
                        payload={p()}
                        metric={colorMetric()}
                        onMetricChange={setColorMetric}
                        selected={selected()}
                        onSelect={select}
                        onOpenFile={(path) => openSide(path)}
                      />
                    </Show>
                    <Show when={view() === "files"}>
                    <CompareTable
                      payload={p()}
                      columns={columns()}
                      onColumnsChange={setColumns}
                      sort={sort()}
                      onSortChange={changeSort}
                      query={filter()}
                      onQueryChange={changeFilter}
                      selected={selected()}
                      onSelect={select}
                      onOpenFile={(path) => openSide(path)}
                    />
                    </Show>
                    </div>
                  </div>
                  <aside class="w-[320px] 2xl:w-[360px] shrink-0 overflow-y-auto border-l border-[var(--plc-border)] bg-[var(--plc-surface)]">
                    <Inspector
                      payload={p()}
                      path={selected()}
                      onOpen={(side) => selected() && openSide(selected()!, side)}
                    />
                  </aside>
                </div>
              </Show>
            </>
          )}
        </Show>
      </main>

      <Show when={viewer()}>
        {(v) => (
          <CodeModal
            isOpen={true}
            filePath={v().filePath}
            gitRef={v().gitRef}
            rootPath={v().rootPath}
            revisionSide={v().revisionSide}
            startLine={v().startLine}
            endLine={v().endLine}
            fileNode={v().fileNode}
            onClose={() => setOpenFile(null)}
          />
        )}
      </Show>
    </div>
  );
}
