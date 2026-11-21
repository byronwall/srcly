// Small shared pieces for the Change Lens panel.

import { ArrowRight, Circle, Minus, Plus, RotateCcw } from "lucide-solid";
import { Show, type JSX } from "solid-js";
import type { ChunkMatch, ChunkStatus } from "../types";
import { MATCH_LABEL, STATUS_COLOR, STATUS_LABEL } from "./model";

const STATUS_ICON = { modified: Circle, added: Plus, deleted: Minus, moved: ArrowRight, reverted: RotateCcw } as const;

export function StatusMark(props: { status: ChunkStatus }) {
  const Icon = STATUS_ICON[props.status];
  const dot = () => props.status === "modified";
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[props.status]}
      title={STATUS_LABEL[props.status]}
      class="inline-flex h-3 w-3 shrink-0 items-center justify-center"
      style={{ color: STATUS_COLOR[props.status] }}
    >
      <Icon size={dot() ? 7 : 12} stroke-width={dot() ? 0 : 2.5} fill={dot() ? "currentColor" : "none"} />
    </span>
  );
}

/** A labeled pill for a match the reader should know about; nothing for `exact` and `none`. */
export function MatchBadge(props: { match: ChunkMatch }) {
  const uncertain = () => props.match === "uncertain";
  return (
    <Show when={MATCH_LABEL[props.match]}>
      {(label) => (
        <span
          data-match={props.match}
          class="inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-[11px] font-medium"
          style={{
            background: uncertain() ? "var(--plc-warning-subtle)" : "var(--plc-accent-subtle)",
            color: uncertain() ? "var(--plc-warning)" : "var(--plc-accent)",
          }}
        >
          {label()}
        </span>
      )}
    </Show>
  );
}

/** `+12 −3` in diff colors. */
export function LineCounts(props: { added: number; deleted: number }) {
  return (
    <span class="plc-data-sm inline-flex gap-1 whitespace-nowrap">
      <span class="text-[var(--plc-success)]">+{props.added.toLocaleString("en-US")}</span>
      <span class="text-[var(--plc-error)]">−{props.deleted.toLocaleString("en-US")}</span>
    </span>
  );
}

export function Empty(props: { children: JSX.Element }) {
  return <p class="px-3 py-2 text-[12px] leading-snug text-[var(--plc-on-subtle)]">{props.children}</p>;
}
