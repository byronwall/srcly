// Where HEAD stands against the default branch, drawn at the start of the
// status row when HEAD is off it (or behind it). A time window also gets a
// toggle between HEAD's history and the default branch's.

import { For, Show } from "solid-js";
import { GitBranch } from "lucide-solid";
import type { LensBranch, LensHistory, LensSelection } from "./types";
import type { LensState } from "./urlState";

/** HEAD is on another branch, or on the default branch but behind its newest ref. */
export const isOffMain = (b: LensBranch | null): b is LensBranch => !!b && (!b.onDefault || b.behind > 0);

/** History picks the ref of a time window; branch and revision windows name their own. */
export const historyApplies = (s: Pick<LensState, "window" | "base" | "head">) => s.window === "24h" || s.window === "7d" || (s.window === "custom" && !s.base && !s.head);

const fmt = (n: number) => n.toLocaleString("en-US");

export default function BranchNotice(props: { selection: LensSelection; toggle: boolean; onHistory: (h: LensHistory) => void }) {
  const b = () => props.selection.branch as LensBranch;
  const name = () => b().name ?? "Detached HEAD";
  const counts = () => {
    const parts = [];
    if (b().behind) parts.push(`${fmt(b().behind)} behind`);
    if (b().ahead) parts.push(`${fmt(b().ahead)} ahead of`);
    return parts.length ? `${parts.join(", ")} ${b().defaultRef}` : `level with ${b().defaultRef}`;
  };
  const options = (): { id: LensHistory; label: string; title: string }[] => [
    { id: "head", label: b().name ?? "HEAD", title: `Read the commits on ${name()}` },
    { id: "main", label: b().defaultRef, title: `Read the commits on ${b().defaultRef}, without checking anything out` },
  ];
  return (
    <span class="flex min-w-0 shrink items-center gap-1.5" data-lens-branch data-lens-history={props.selection.history}>
      <GitBranch size={12} class="shrink-0 text-[var(--plc-warning)]" aria-hidden="true" />
      <span class="plc-data-sm min-w-0 max-w-[20rem] truncate text-[12px] text-[var(--plc-on-surface)]" title={name()}>
        {name()}
      </span>
      <span class="shrink-0 tabular-nums" data-lens-behind={b().behind}>
        {counts()}
      </span>
      <Show when={props.toggle}>
        <span class="ml-1 shrink-0 text-[var(--plc-on-subtle)]">History</span>
        <span role="radiogroup" aria-label="History" class="flex h-[22px] shrink-0 rounded border border-[var(--plc-border)] bg-[var(--plc-surface-muted)]">
          <For each={options()}>
            {(o) => (
              <button
                type="button"
                role="radio"
                aria-checked={props.selection.history === o.id}
                title={o.title}
                data-lens-history-option={o.id}
                class="plc-data-sm max-w-[12rem] truncate rounded-[3px] px-1.5 text-[12px] transition-colors duration-150"
                classList={{
                  "bg-[var(--plc-surface)] text-[var(--plc-on-surface)] shadow-sm": props.selection.history === o.id,
                  "text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)]": props.selection.history !== o.id,
                }}
                onClick={() => props.selection.history !== o.id && props.onHistory(o.id)}
              >
                {o.label}
              </button>
            )}
          </For>
        </span>
      </Show>
    </span>
  );
}
