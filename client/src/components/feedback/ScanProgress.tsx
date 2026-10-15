import { For, Show, createMemo } from "solid-js";
import type { ScanSnapshot } from "../../services/scanJobs";
import {
  describeScan,
  formatCount,
  formatDuration,
  relativeToRoot,
} from "../../utils/scanProgress";
import { Button } from "../ui/Button";
import { cx } from "../ui/classes";

export function ScanProgress(props: {
  snapshot: ScanSnapshot;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const view = createMemo(() => describeScan(props.snapshot));
  const percent = () => {
    const fraction = view().fraction;
    // Floor so a long tail never reads "100%" before the scan is done.
    return fraction === null ? null : Math.floor(fraction * 100);
  };

  return (
    <div class="flex h-full w-full items-center justify-center p-4">
      <section
        class="plc-panel w-full max-w-lg rounded-lg border p-4"
        aria-labelledby="scan-progress-title"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2
              id="scan-progress-title"
              class="text-[15px] font-semibold leading-snug text-[var(--plc-on-surface)]"
            >
              {view().headline}
            </h2>
            <p
              class="plc-data-sm mt-1 truncate text-[var(--plc-on-subtle)]"
              title={props.snapshot.path}
            >
              {props.snapshot.path || "Current directory"}
            </p>
          </div>
          <Show when={props.onCancel}>
            <Button
              size="sm"
              onClick={() => props.onCancel?.()}
              disabled={props.cancelling}
            >
              {props.cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          </Show>
        </div>

        <ol class="mt-4 flex items-center gap-2 text-xs" aria-label="Scan steps">
          <For each={view().steps}>
            {(step, index) => (
              <>
                <Show when={index() > 0}>
                  <span class="h-px flex-1 bg-[var(--plc-border)]" aria-hidden="true" />
                </Show>
                <li
                  class={cx(
                    "flex items-center gap-1.5 whitespace-nowrap",
                    step.state === "pending"
                      ? "text-[var(--plc-on-disabled)]"
                      : "text-[var(--plc-on-muted)]",
                    step.state === "active" && "font-semibold text-[var(--plc-on-surface)]"
                  )}
                  aria-current={step.state === "active" ? "step" : undefined}
                >
                  <span
                    class={cx(
                      "h-2 w-2 rounded-full",
                      step.state === "done" && "bg-[var(--plc-accent)]",
                      step.state === "active" && "bg-[var(--plc-accent)] ring-4 ring-[var(--plc-accent-subtle)]",
                      step.state === "pending" && "bg-[var(--plc-border-strong)]"
                    )}
                    aria-hidden="true"
                  />
                  {step.label}
                </li>
              </>
            )}
          </For>
        </ol>

        <div class="mt-4">
          <div class="flex items-center gap-3">
          <div
            class="h-1.5 flex-1 w-full overflow-hidden rounded-full bg-[var(--plc-surface-muted)]"
            role="progressbar"
            aria-labelledby="scan-progress-title"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent() ?? undefined}
          >
            <Show
              when={percent() !== null}
              fallback={<div class="plc-progress-indeterminate h-full w-1/3 rounded-full bg-[var(--plc-accent)]" />}
            >
              <div
                class="h-full rounded-full bg-[var(--plc-accent)] transition-[width] duration-200 ease-out"
                style={{ width: `${percent()}%` }}
              />
            </Show>
          </div>
            <span class="plc-data-md w-9 shrink-0 text-right text-[var(--plc-on-muted)]">
              {percent() === null ? "" : `${percent()}%`}
            </span>
          </div>

          <p
            class="plc-data-md mt-2 h-5 truncate text-xs text-[var(--plc-on-subtle)]"
            title={view().detail}
          >
            {view().detail}
          </p>
          <Show when={view().slowFile}>
            {(slow) => (
              <p
                class="mt-1 flex gap-1.5 truncate text-xs text-[var(--plc-on-subtle)]"
                title={slow().path}
              >
                <span class="shrink-0">Waiting on</span>
                <span class="plc-data-md truncate text-[var(--plc-on-muted)]">{slow().path}</span>
                <span class="plc-data-md shrink-0">{formatDuration(slow().seconds)}</span>
              </p>
            )}
          </Show>
        </div>

        <dl class="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--plc-divider)] pt-3 text-xs text-[var(--plc-on-subtle)]">
          <div class="flex gap-1">
            <dt>Elapsed</dt>
            <dd class="plc-data-md text-[var(--plc-on-muted)]">
              {formatDuration(props.snapshot.elapsed_seconds)}
            </dd>
          </div>
          <Show when={view().etaSeconds !== null}>
            <div class="flex gap-1">
              <dt>Remaining</dt>
              <dd class="plc-data-md text-[var(--plc-on-muted)]">
                ~{formatDuration(view().etaSeconds ?? 0)}
              </dd>
            </div>
          </Show>
          <Show when={props.snapshot.files_failed > 0}>
            <div class="flex gap-1 text-[var(--plc-warning)]">
              <dt>Skipped</dt>
              <dd class="plc-data-md">
                {formatCount(props.snapshot.files_failed)}
              </dd>
            </div>
          </Show>
        </dl>

        <Show when={props.snapshot.failures.length > 0}>
          <details class="mt-2 text-xs text-[var(--plc-on-subtle)]">
            <summary class="cursor-pointer select-none hover:text-[var(--plc-on-surface)]">
              Files that could not be analyzed
            </summary>
            <ul class="mt-2 max-h-32 space-y-1 overflow-auto">
              <For each={props.snapshot.failures}>
                {(failure) => (
                  <li class="flex gap-2">
                    <span class="shrink-0 font-semibold text-[var(--plc-warning)]">
                      {failure.reason}
                    </span>
                    <span class="plc-data-md truncate" title={failure.detail}>
                      {relativeToRoot(failure.path, props.snapshot.path)}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </details>
        </Show>
      </section>
    </div>
  );
}
