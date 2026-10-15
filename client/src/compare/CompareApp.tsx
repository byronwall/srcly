import { RefreshCw, X } from "lucide-solid";
import { createSignal, For, lazy, onCleanup, onMount, Show } from "solid-js";
import { EmptyState, ErrorState } from "../components/feedback/States";
import { Button } from "../components/ui/Button";
import {
  cancelCompare,
  fetchCompareResult,
  navigateCompare,
  readCompareParam,
  startCompare,
  watchCompare,
  type CompareSnapshot,
} from "./api";
import { CompareProgress } from "./CompareProgress";
import { CompareTable } from "./CompareTable";
import { CompareGraph } from "./CompareGraph";
import { CompareTreemap } from "./CompareTreemap";
import { DEFAULT_COMPARE_COLUMNS } from "./metrics";
import { RefBar } from "./RefBar";
import { Inspector } from "./Inspector";
import { buildRows, collectFiles, indexFiles, type FileRow, type RowSort } from "./rows";
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

function writeParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url.pathname + url.search);
}

/** PR compare mode: two refs, scanned and diffed, shown as focused before/after views. */
export default function CompareApp() {
  const initial = readCompareParam() ?? { base: "merge-base", head: "WORKTREE" };
  const [refs, setRefs] = createSignal(initial);
  const [snapshot, setSnapshot] = createSignal<CompareSnapshot | null>(null);
  const [payload, setPayload] = createSignal<ComparePayload | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [columns, setColumns] = createSignal(DEFAULT_COMPARE_COLUMNS);
  const [sort, setSort] = createSignal<RowSort>(readParam(SORT_PARAM) ?? "tree");
  const [selected, setSelected] = createSignal<string | null>(readParam(FILE_PARAM));
  const [view, setView] = createSignal<CompareView>((readParam(VIEW_PARAM) as CompareView) ?? "files");
  const [colorMetric, setColorMetric] = createSignal("complexity");
  const [openFile, setOpenFile] = createSignal<{ path: string; side: "base" | "head" } | null>(null);
  let request = 0;
  let stop: (() => void) | null = null;

  const run = async (base: string, head: string, force = false) => {
    const mine = ++request;
    stop?.();
    const running = snapshot();
    if (running) void cancelCompare(running.id).catch(() => {});
    setRefs({ base, head });
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
              if (!result.files.some((f) => f.path === selected())) {
                const first = buildRows(collectFiles(result.files, new Map(), false), {
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

  const onPopState = () => {
    const next = readCompareParam();
    if (next && (next.base !== refs().base || next.head !== refs().head)) void run(next.base, next.head);
  };
  onMount(() => {
    void run(initial.base, initial.head);
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
    setOpenFile({ path, side: side ?? (f?.status === "removed" ? "base" : "head") });
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
    return {
      filePath: `${p.repo.root}/${path}`,
      gitRef: side.sha,
      fileNode: indexFiles(tree).get(path) ?? null,
    };
  };

  return (
    <div class="plc-app-shell flex h-screen flex-col overflow-hidden">
      <header class="plc-topbar flex items-center gap-4 border-b px-4">
        <h1 class="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--plc-primary)]">
          <img src="/favicon.svg" alt="" class="h-5 w-5" />
          Srcly
          <span class="font-normal text-[var(--plc-on-subtle)]">compare</span>
        </h1>
        <RefBar
          base={refs().base}
          head={refs().head}
          busy={Boolean(snapshot())}
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
        <Button variant="ghost" class="shrink-0 gap-1.5" onClick={() => navigateCompare(null)}>
          <X size={13} aria-hidden="true" />
          Exit compare
        </Button>
      </header>

      <main class="flex min-h-0 flex-1 flex-col">
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
            fileNode={v().fileNode}
            onClose={() => setOpenFile(null)}
          />
        )}
      </Show>
    </div>
  );
}
