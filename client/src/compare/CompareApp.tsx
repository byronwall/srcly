import { RefreshCw, X } from "lucide-solid";
import { createSignal, lazy, onCleanup, onMount, Show } from "solid-js";
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
import { DEFAULT_COMPARE_COLUMNS } from "./metrics";
import { RefBar } from "./RefBar";
import { indexFiles, type FileRow } from "./rows";
import { SummaryStrip } from "./SummaryStrip";
import type { ComparePayload } from "./types";

const CodeModal = lazy(() => import("../components/CodeModal/CodeModal.tsx"));

const SORT_PARAM = "csort";

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
  const [sortMetric, setSortMetric] = createSignal<string | null>(readParam(SORT_PARAM));
  const [openFile, setOpenFile] = createSignal<FileRow | null>(null);
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

  const changeSort = (metric: string | null) => {
    setSortMetric(metric);
    writeParam(SORT_PARAM, metric);
  };

  // The code viewer reads removed files from the base commit and the rest
  // from the head side (the disk for the working tree).
  const viewer = () => {
    const row = openFile();
    const p = payload();
    if (!row || !p) return null;
    const removed = row.change?.status === "removed";
    const side = removed ? p.base : p.head;
    const tree = removed ? p.trees?.base : p.trees?.head;
    return {
      filePath: `${p.repo.root}/${row.path}`,
      gitRef: side.sha,
      fileNode: indexFiles(tree).get(row.path) ?? null,
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
                <div class="min-h-0 flex-1">
                  <CompareTable
                    payload={p()}
                    columns={columns()}
                    onColumnsChange={setColumns}
                    sortMetric={sortMetric()}
                    onSortChange={changeSort}
                    onOpenFile={setOpenFile}
                  />
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
