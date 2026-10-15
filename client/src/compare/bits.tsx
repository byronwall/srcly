// Small shared pieces for the compare views.

import { ArrowRight, Circle, Minus, Plus } from "lucide-solid";
import { For, Show } from "solid-js";
import { cx } from "../components/ui/classes";
import { STATUS_COLOR, STATUS_LABEL } from "./metrics";
import type { ChangeStatus, Verdict } from "./types";

/** Let long paths wrap only after a slash, never mid-name. */
export const breakablePath = (path: string) => path.replace(/\//g, "/\u200b");

const BAR_COLOR: Record<Verdict, string> = {
  worse: "var(--plc-error)",
  better: "var(--plc-success)",
  neutral: "var(--plc-on-disabled)",
  same: "transparent",
};

/** Magnitude of a change on a small fixed track: |delta| / max, colored by verdict. */
export function MagnitudeBar(props: { delta: number; max: number; verdict: Verdict; width?: number }) {
  const pct = () => (props.max ? Math.max(6, Math.min(100, (Math.abs(props.delta) / props.max) * 100)) : 0);
  return (
    <span
      class={cx(
        "relative inline-block h-1 shrink-0 rounded-full",
        props.delta !== 0 && props.verdict !== "same" && "bg-[var(--plc-surface-muted)]"
      )}
      style={{ width: `${props.width ?? 28}px` }}
      aria-hidden="true"
    >
      <span
        class="absolute inset-y-0 left-0 rounded-full opacity-75"
        style={{ width: props.verdict === "same" || !props.delta ? "0%" : `${pct()}%`, background: BAR_COLOR[props.verdict] }}
      />
    </span>
  );
}

const STATUS_ICON = { added: Plus, removed: Minus, modified: Circle, renamed: ArrowRight } as const;

export function StatusIcon(props: { status: ChangeStatus; size?: number }) {
  const Icon = STATUS_ICON[props.status];
  const dot = () => props.status === "modified";
  return (
    <span
      aria-label={STATUS_LABEL[props.status]}
      class="inline-flex h-3 w-3 shrink-0 items-center justify-center"
      style={{ color: STATUS_COLOR[props.status] }}
    >
      <Icon
        size={dot() ? 7 : (props.size ?? 12)}
        stroke-width={dot() ? 0 : 2.5}
        fill={dot() ? "currentColor" : "none"}
      />
    </span>
  );
}

const BLOCKS = 5;

/** GitHub-style diffstat: counts plus five blocks split by the add/delete ratio. */
export function DiffStat(props: { additions: number; deletions: number; blocks?: boolean }) {
  const total = () => props.additions + props.deletions;
  const green = () => (total() ? Math.round((props.additions / total()) * BLOCKS) : 0);
  const red = () => (total() ? BLOCKS - green() : 0);
  return (
    <span class="plc-data-sm inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <span class="text-[var(--plc-success)]">+{props.additions.toLocaleString("en-US")}</span>
      <span class="text-[var(--plc-error)]">−{props.deletions.toLocaleString("en-US")}</span>
      <Show when={props.blocks !== false}>
        <span class="inline-flex gap-px" aria-hidden="true">
          <For each={Array.from({ length: BLOCKS }, (_, i) => i)}>
            {(i) => (
              <span
                class="h-2 w-2 rounded-[1px]"
                style={{
                  background:
                    i < green() ? "var(--plc-success)" : i < green() + red() ? "var(--plc-error)" : "var(--plc-border)",
                }}
              />
            )}
          </For>
        </span>
      </Show>
    </span>
  );
}

/** "3 worse · 1 better" as two fixed slots of colored counts; empty slots stay blank. */
export function Health(props: { worse: number; better: number; class?: string }) {
  return (
    <span class={cx("plc-data-sm inline-flex items-center justify-end gap-2 whitespace-nowrap", props.class)}>
      <span class="inline-flex w-7 items-center justify-end gap-1 text-[var(--plc-error)]">
        <Show when={props.worse}>
          <span class="h-1.5 w-1.5 rounded-full bg-[var(--plc-error)]" />
          {props.worse}
        </Show>
      </span>
      <span class="inline-flex w-7 items-center justify-end gap-1 text-[var(--plc-success)]">
        <Show when={props.better}>
          <span class="h-1.5 w-1.5 rounded-full bg-[var(--plc-success)]" />
          {props.better}
        </Show>
      </span>
    </span>
  );
}

/** Proportional split of files better (green, left) vs worse (red, right) on a fixed track. */
export function SplitBar(props: { better: number; worse: number; max: number }) {
  const pct = (n: number) => `${props.max ? (n / props.max) * 50 : 0}%`;
  return (
    <span class="relative block h-1.5 w-16 rounded-full bg-[var(--plc-surface-muted)]" aria-hidden="true">
      <span class="absolute inset-y-0 left-1/2 w-px bg-[var(--plc-border-strong)]" />
      <span
        class="absolute inset-y-0 rounded-l-full bg-[var(--plc-success)]"
        style={{ right: "50%", width: pct(props.better) }}
      />
      <span
        class="absolute inset-y-0 rounded-r-full bg-[var(--plc-error)]"
        style={{ left: "50%", width: pct(props.worse) }}
      />
    </span>
  );
}
