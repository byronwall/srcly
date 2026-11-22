// One line under the map that says what every fill and mark means.

import { For, Show } from "solid-js";
import { formatMetricValue, metricDef, metricLabel } from "../utils/metricsStore";
import { TREEMAP_GRADIENT } from "../viz/treemap/utils/colors";
import { ADDED_FILL, DELETED_FILL, deltaGradient, deltaSpan, NOT_MEASURED_FILL, REVERTED_FILL, STATE_GLYPH, STATE_LABEL, type Lens, type TileState } from "./colors";
import type { LensLayout } from "./urlState";

const STATES: { id: Exclude<TileState, "value">; fill: (lens: Lens) => string; outline?: string; hint: string }[] = [
  { id: "added", fill: (lens) => (lens.color === "delta" ? ADDED_FILL : "var(--plc-surface-muted)"), hint: "Not in the base. A delta lens has nothing to subtract from, so it gets its own fill." },
  { id: "deleted", fill: () => DELETED_FILL, hint: "Not in the head. Its lines are the base's." },
  { id: "moved", fill: () => "var(--plc-surface-muted)", outline: "1px dashed rgba(15, 23, 42, 0.65)", hint: "The same symbol in another file, or in a renamed file" },
  { id: "reverted", fill: () => REVERTED_FILL, outline: "1px dashed var(--plc-on-disabled)", hint: "Changed in the window, then put back: the base and the head are equal" },
  { id: "not-measured", fill: () => NOT_MEASURED_FILL, hint: "No analyzer measures this metric here. It is not a zero." },
];

export default function Legend(props: { lens: Lens; layout: LensLayout }) {
  const span = () => deltaSpan(props.lens.metric);
  const domain = () => metricDef(props.lens.metric)?.color_domain ?? [0, 10, 50];
  const value = (n: number) => formatMetricValue(props.lens.metric, n);
  return (
    <div class="flex h-[26px] shrink-0 items-center gap-x-4 overflow-hidden whitespace-nowrap border-t border-[var(--plc-border)] px-3 text-[11px] text-[var(--plc-on-muted)]" data-lens-legend={props.lens.color}>
      <span class="flex shrink-0 items-center gap-1.5">
        <span class="font-semibold text-[var(--plc-on-surface)]">
          {metricLabel(props.lens.metric)} {props.lens.color === "delta" ? "delta" : "now"}
        </span>
        <Show
          when={props.lens.color === "delta"}
          fallback={
            <>
              <span class="tabular-nums">{value(domain()[0])}</span>
              <span class="h-2.5 w-24 rounded-sm" style={{ background: TREEMAP_GRADIENT }} />
              <span class="tabular-nums">{value(domain()[2])}+</span>
            </>
          }
        >
          <span class="tabular-nums">fell −{value(span())}</span>
          <span class="flex h-2.5 w-28 overflow-hidden rounded-sm">
            <span class="flex-1" style={{ background: deltaGradient("fell") }} />
            <span class="flex-1" style={{ background: deltaGradient("rose") }} />
          </span>
          <span class="tabular-nums">rose +{value(span())}</span>
        </Show>
      </span>
      <For each={STATES}>
        {(s) => (
          <span class="flex shrink-0 items-center gap-1.5" title={s.hint} data-legend-state={s.id}>
            <span
              aria-hidden="true"
              class="flex h-3 w-[18px] items-center justify-center rounded-[2px] text-[10px] font-semibold leading-none text-[#0f172a] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]"
              style={{ background: s.fill(props.lens), outline: s.outline, "outline-offset": "-1px" }}
            >
              {STATE_GLYPH[s.id]}
            </span>
            {STATE_LABEL[s.id]}
          </span>
        )}
      </For>
      <span class="min-w-0 flex-1 truncate text-right text-[var(--plc-on-subtle)]">
        {props.layout === "edits" ? "Area: changed lines · dots: commits that touched the chunk" : "Area: file LOC · bands: edited chunks at their lines"}
      </span>
    </div>
  );
}
