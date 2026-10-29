import { createSignal, onCleanup, Show } from "solid-js";
import type { Progress } from "../../../dataflow/api";
import { POLL_MS } from "../../../dataflow/availability";
import { cx } from "../../../components/ui/classes";

const PHASES: Record<Progress["phase"], string> = {
  queued: "Queued",
  program: "Program",
  identity: "Symbol index",
  trace: "Tracing",
  summarize: "Routes",
  routes: "Routes",
  project: "Projecting",
};

/**
 * What the engine is doing while a view waits on it: the phase by name and
 * its count, from `status` polled every 250 ms. A first query on a large app
 * takes tens of seconds (a Python app's mypy pass, minutes); this says so,
 * with the time so far, instead of spinning.
 */
export function FlowProgress(props: { title: string; progress?: Progress; class?: string }) {
  const started = Date.now();
  const [seconds, setSeconds] = createSignal(0);
  const tick = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
  onCleanup(() => clearInterval(tick));
  const fraction = () => {
    const p = props.progress;
    return p?.total ? Math.min(1, (p.completed ?? 0) / p.total) : null;
  };
  return (
    <div class={cx("flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center", props.class)} aria-live="polite">
      <div class="text-[15px] font-semibold text-[var(--plc-on-surface)]">{props.title}…</div>
      <div class="min-h-[1.25rem] max-w-md text-[12px] text-[var(--plc-on-subtle)]">
        <Show when={props.progress} fallback={<span>Waiting for the engine (checked every {POLL_MS} ms)</span>}>
          {(p) => (
            <span>
              <b class="font-medium text-[var(--plc-on-muted)]">{PHASES[p().phase]}</b> · {p().message}
              <Show when={p().total}>{(total) => <span class="tabular-nums"> · {p().completed ?? 0} of {total()}</span>}</Show>
              <Show when={seconds() >= 5}>
                <span class="tabular-nums" data-elapsed> · {seconds()} s</span>
              </Show>
            </span>
          )}
        </Show>
      </div>
      <div class="h-1 w-56 overflow-hidden rounded-full bg-[var(--plc-surface-muted)]">
        <div
          class="h-full rounded-full bg-[var(--plc-accent)] transition-[width] duration-200"
          classList={{ "animate-pulse": fraction() === null }}
          style={{ width: `${Math.round((fraction() ?? 0.3) * 100)}%` }}
        />
      </div>
    </div>
  );
}
