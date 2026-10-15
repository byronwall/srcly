import { GitPullRequest, GitPullRequestDraft } from "lucide-solid";
import { Show, type JSX } from "solid-js";
import { DiffStat } from "./bits";
import { stepText } from "./CompareProgress";
import type { ComparePayload, ComparePrMeta, CompareSideMeta } from "./types";

/** GitHub mark, as the source icon on links to GitHub. */
export function GitHubMark(props: { size?: number; class?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={props.size ?? 12} height={props.size ?? 12} class={props.class} aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** The PR being compared: number, title (links to GitHub), head → base, author, and GitHub's file count. */
function PrContext(props: { pr: ComparePrMeta; files: number }) {
  const mismatch = () => props.pr.changedFiles !== null && props.pr.changedFiles !== props.files;
  return (
    <div class="col-span-3 flex min-w-0 items-center gap-2 text-[13px]">
      {props.pr.isDraft ? (
        <GitPullRequestDraft size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-label="Draft PR" />
      ) : (
        <GitPullRequest size={14} class="shrink-0 text-[var(--plc-success)]" aria-label="Open PR" />
      )}
      <a
        href={props.pr.url}
        target="_blank"
        rel="noreferrer"
        class="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap font-semibold text-[var(--plc-accent)] transition-colors duration-150 hover:text-[var(--plc-accent-hover)]"
      >
        <span class="truncate">
          #{props.pr.number} {props.pr.title}
        </span>
        <GitHubMark class="shrink-0 opacity-70" />
      </a>
      <span class="plc-data-sm shrink-0 whitespace-nowrap text-[var(--plc-on-muted)]">
        {props.pr.headRefName} → {props.pr.baseRefName}
      </span>
      <span class="shrink-0 text-[var(--plc-on-muted)]">{props.pr.author}</span>
      <Show when={props.pr.isDraft}>
        <span class="shrink-0 text-[var(--plc-on-muted)]">draft</span>
      </Show>
      <Show when={mismatch()}>
        <span class="shrink-0 text-[var(--plc-warning)]" title="GitHub's changed-file count differs; its base branch may have moved since the last fetch">
          GitHub lists {props.pr.changedFiles} files
        </span>
      </Show>
    </div>
  );
}

function Side(props: { label: string; side: CompareSideMeta; steps?: Record<string, number> }) {
  return (
    <div class="min-w-0">
      <div class="flex items-baseline gap-2">
        <span class="plc-label-caps text-[var(--plc-on-subtle)]">{props.label}</span>
        <span class="plc-data-sm truncate text-[var(--plc-on-subtle)]" title="Where this side's time went">
          {stepText(props.steps)}
        </span>
      </div>
      <div class="mt-1 flex min-w-0 items-baseline gap-2">
        <span class="plc-data-md shrink-0 font-semibold text-[var(--plc-on-surface)]">{props.side.label}</span>
        <Show when={props.side.subject}>
          <span class="min-w-0 text-[13px] leading-snug text-[var(--plc-on-muted)]">{props.side.subject}</span>
        </Show>
      </div>
    </div>
  );
}

function Kpi(props: { label: string; children: JSX.Element }) {
  return (
    <div class="whitespace-nowrap">
      <div class="plc-label-caps text-[var(--plc-on-subtle)]">{props.label}</div>
      <div class="mt-1 flex items-baseline gap-2 text-[15px] font-semibold tabular-nums">{props.children}</div>
    </div>
  );
}

/** Top band: what is compared, then the headline numbers. */
export function SummaryStrip(props: { payload: ComparePayload }) {
  const s = () => props.payload.summary;
  return (
    <div class="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-x-8 gap-y-2 border-b border-[var(--plc-border)] bg-[var(--plc-surface)] px-4 py-2.5">
      <Show when={props.payload.head.pr ?? props.payload.base.pr}>
        {(pr) => <PrContext pr={pr()} files={s().files.total} />}
      </Show>
      <Side label="Before" side={props.payload.base} steps={props.payload.timings?.base} />
      <Side label="After" side={props.payload.head} steps={props.payload.timings?.head} />
      <div class="flex items-start gap-7">
        <Kpi label="Files">
          {s().files.total}
          <span class="plc-data-sm font-normal">
            <span class="text-[var(--plc-success)]">+{s().files.added}</span>{" "}
            <span class="text-[var(--plc-error)]">−{s().files.removed}</span>{" "}
            <span class="text-[var(--plc-warning)]">~{s().files.modified}</span>
            <Show when={s().files.renamed}>
              {" "}
              <span class="text-[var(--plc-accent)]">→{s().files.renamed}</span>
            </Show>
          </span>
        </Kpi>
        <Kpi label="Lines">
          <DiffStat additions={s().lines.additions} deletions={s().lines.deletions} />
        </Kpi>
        <Kpi label="Imports">
          <span class="text-[var(--plc-success)]">+{s().edges.added}</span>
          <span class="text-[var(--plc-error)]">−{s().edges.removed}</span>
        </Kpi>
        <Kpi label="Risk metrics">
          <span class="text-[var(--plc-error)]">{s().net.worse} worse</span>
          <span class="text-[var(--plc-success)]">{s().net.better} better</span>
        </Kpi>
      </div>
    </div>
  );
}
