// The four panel components of the Changes view, with the prop signatures of
// docs/intent/change-lens/contract.md. These are plain stand-ins: the real
// ones are in ./panel, and this file then only re-exports them.

import { For, Show } from "solid-js";
import { X } from "lucide-solid";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { metricLabel } from "../utils/metricsStore";
import { beforeAfter, matchNote, plural, STATUS_LABEL } from "./labels";
import { WORKTREE, type ChangeLensPayload, type LensChunk, type LensCommit, type LensHunkDiff, type ReviewBucket } from "./types";

const BUCKETS: { id: ReviewBucket; title: string; rule: string }[] = [
  { id: "complex-and-changed", title: "Already complex and changed", rule: "Complexity 10 or more at base, and the body changed" },
  { id: "new-hotspot", title: "New hotspot", rule: "Added or grew, and complexity is 10 or more now" },
];

const Stat = (props: { added: number; deleted: number }) => (
  <span class="plc-data-sm shrink-0 whitespace-nowrap tabular-nums">
    <span class="text-[var(--plc-success)]">+{props.added}</span> <span class="text-[var(--plc-error)]">−{props.deleted}</span>
  </span>
);

export function ReviewBuckets(props: { payload: ChangeLensPayload; selected: string | null; onSelect: (chunkId: string) => void }) {
  const inBucket = (id: ReviewBucket) => props.payload.chunks.filter((c) => c.buckets.includes(id));
  return (
    <div class="flex flex-col gap-2 p-2">
      <For each={BUCKETS}>
        {(bucket) => (
          <section>
            <h3 class="flex items-baseline gap-2 px-1 text-[12px] font-semibold text-[var(--plc-on-surface)]" title={bucket.rule}>
              {bucket.title}
              <span class="font-normal tabular-nums text-[var(--plc-on-subtle)]">{inBucket(bucket.id).length}</span>
            </h3>
            <For each={inBucket(bucket.id)} fallback={<div class="px-1 text-[12px] text-[var(--plc-on-subtle)]">None in this window</div>}>
              {(chunk) => (
                <button
                  type="button"
                  data-bucket-chunk={chunk.id}
                  aria-pressed={props.selected === chunk.id}
                  class="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-[12px] hover:bg-[var(--plc-surface-hover)] aria-pressed:bg-[var(--plc-surface-selected)]"
                  onClick={() => props.onSelect(chunk.id)}
                >
                  <span class="plc-data-sm min-w-0 flex-1 truncate text-[var(--plc-on-surface)]">{chunk.name}</span>
                  <span class="plc-data-sm shrink-0 tabular-nums text-[var(--plc-on-muted)]">{beforeAfter("complexity", chunk.metrics.complexity)}</span>
                </button>
              )}
            </For>
          </section>
        )}
      </For>
    </div>
  );
}

export function ChunkInspector(props: {
  payload: ChangeLensPayload;
  chunk: LensChunk | null;
  onOpenHunk: (chunkId: string, commit?: string) => void;
  onOpenCode: (chunk: LensChunk) => void;
}) {
  const commit = (sha: string) => props.payload.commits.find((c) => c.sha === sha);
  return (
    <Show when={props.chunk} fallback={<div class="p-3 text-[12px] text-[var(--plc-on-subtle)]">Select a chunk on the map to see what changed in it.</div>}>
      {(chunk) => (
        <div class="flex flex-col gap-2 p-3 text-[12px]" data-inspector-chunk={chunk().id}>
          <div>
            <div class="plc-data-sm break-all text-[13px] font-semibold text-[var(--plc-on-surface)]">{chunk().name}</div>
            <div class="plc-data-sm break-all text-[var(--plc-on-subtle)]">
              {chunk().path}:{chunk().startLine}–{chunk().endLine}
            </div>
          </div>
          <div class="flex flex-wrap items-baseline gap-x-2 text-[var(--plc-on-muted)]">
            <span>{STATUS_LABEL[chunk().status]}</span>
            <Stat added={chunk().added} deleted={chunk().deleted} />
            <span>
              net +{chunk().netAdded} −{chunk().netDeleted}
            </span>
          </div>
          <Show when={matchNote(chunk())}>{(note) => <div class="text-[var(--plc-on-muted)]">{note()}</div>}</Show>
          <div class="flex gap-1.5">
            <Button variant="primary" data-open-hunk onClick={() => props.onOpenHunk(chunk().id)}>
              Open diff
            </Button>
            <Button disabled={chunk().status === "deleted"} onClick={() => props.onOpenCode(chunk())}>
              Open code
            </Button>
          </div>
          <Show when={chunk().measured} fallback={<div class="text-[var(--plc-on-muted)]">Not measured: {chunk().naReason ?? "no analyzer reads this chunk"}</div>}>
            <div class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
              <For each={props.payload.metricIds}>
                {(id) => (
                  <>
                    <span class="text-[var(--plc-on-muted)]">{metricLabel(id)}</span>
                    <span class="plc-data-sm text-right tabular-nums text-[var(--plc-on-surface)]">{beforeAfter(id, chunk().metrics[id]) ?? "not measured"}</span>
                  </>
                )}
              </For>
            </div>
          </Show>
          <Show when={chunk().touches.length}>
            <div>
              <div class="mb-0.5 font-semibold text-[var(--plc-on-surface)]">Changed by {plural(chunk().touches.length, "commit")}</div>
              <For each={chunk().touches}>
                {(touch) => (
                  <button
                    type="button"
                    class="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-[var(--plc-surface-hover)]"
                    title="Open this step's diff"
                    onClick={() => props.onOpenHunk(chunk().id, touch.sha)}
                  >
                    <span class="plc-data-sm w-14 shrink-0 text-[var(--plc-accent)]">{touch.sha === WORKTREE ? "now" : (commit(touch.sha)?.short ?? touch.sha.slice(0, 7))}</span>
                    <span class="min-w-0 flex-1 truncate text-[var(--plc-on-muted)]">{commit(touch.sha)?.subject}</span>
                    <Stat added={touch.added} deleted={touch.deleted} />
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}

const LINE_CLASS: Record<string, string> = {
  "+": "bg-[var(--plc-success-subtle)]",
  "-": "bg-[var(--plc-error-subtle)]",
  "@": "text-[var(--plc-on-subtle)]",
};

export function HunkDiff(props: { diff: LensHunkDiff | null; loading: boolean; error?: string; onClose: () => void }) {
  return (
    <div class="flex h-full min-h-0 flex-col" data-hunk-diff>
      <div class="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--plc-border)] px-3 text-[12px]">
        <Show when={props.diff} fallback={<span class="text-[var(--plc-on-subtle)]">{props.loading ? "Reading the diff…" : "Diff"}</span>}>
          {(d) => (
            <>
              <span class="plc-data-sm min-w-0 truncate font-semibold text-[var(--plc-on-surface)]">{d().path}</span>
              <span class="plc-data-sm shrink-0 text-[var(--plc-on-subtle)]">
                {d().from} → {d().to}
              </span>
            </>
          )}
        </Show>
        <span class="flex-1" />
        <IconButton label="Close the diff" onClick={props.onClose}>
          <X size={14} aria-hidden="true" />
        </IconButton>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <Show when={props.error}>
          <div class="p-3 text-[12px] text-[var(--plc-error)]">{props.error}</div>
        </Show>
        <Show when={props.diff}>
          {(d) => (
            <Show when={d().diff} fallback={<div class="p-3 text-[12px] text-[var(--plc-on-subtle)]">The two sides are equal: there is no diff.</div>}>
              <div class="plc-data-sm min-w-max py-1 text-[12px] leading-[18px]">
                <For each={d().diff.replace(/\n$/, "").split("\n")}>{(line) => <div class={`whitespace-pre px-3 ${LINE_CLASS[line[0]] ?? ""}`}>{line || " "}</div>}</For>
              </div>
              <Show when={d().truncated}>
                <div class="px-3 py-1 text-[12px] text-[var(--plc-on-subtle)]">The diff was clipped.</div>
              </Show>
            </Show>
          )}
        </Show>
      </div>
    </div>
  );
}

export function CommitRail(props: { commits: LensCommit[]; selected: string | null; onSelect: (sha: string | null) => void; highlightChunk?: string | null }) {
  return (
    <div class="flex items-stretch gap-1 overflow-x-auto px-2 py-1.5 scrollbar-hide" role="listbox" aria-label="Commits in the window">
      <For each={props.commits}>
        {(commit) => {
          const selected = () => props.selected === commit.sha;
          const touches = () => Boolean(props.highlightChunk && commit.chunkIds.includes(props.highlightChunk));
          return (
            <button
              type="button"
              role="option"
              aria-selected={selected()}
              data-commit={commit.sha}
              title={commit.subject}
              class="flex w-40 shrink-0 flex-col rounded border px-2 py-1 text-left text-[11px] hover:bg-[var(--plc-surface-hover)]"
              classList={{
                "border-[var(--plc-accent-border)] bg-[var(--plc-surface-selected)]": selected(),
                "border-[var(--plc-border-strong)]": !selected() && touches(),
                "border-transparent": !selected() && !touches(),
              }}
              onClick={() => props.onSelect(selected() ? null : commit.sha)}
            >
              <span class="flex items-baseline gap-2">
                <span class="plc-data-sm text-[var(--plc-accent)]">{commit.sha === WORKTREE ? "Working tree" : commit.short}</span>
                <span class="ml-auto">
                  <Stat added={commit.added} deleted={commit.deleted} />
                </span>
              </span>
              <span class="truncate text-[var(--plc-on-muted)]">{commit.subject}</span>
            </button>
          );
        }}
      </For>
    </div>
  );
}
