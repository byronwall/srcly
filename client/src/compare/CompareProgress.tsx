import { For } from "solid-js";
import { Button } from "../components/ui/Button";
import type { ComparePhase, CompareSnapshot } from "./api";

const PHASE_TEXT: Record<ComparePhase, string> = {
  queued: "Starting",
  resolving: "Resolving refs and listing changed files",
  base: "Scanning the base side",
  head: "Scanning the head side",
  diffing: "Comparing",
  complete: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Fixed-size progress panel: one bar per side, so nothing shifts as numbers change. */
export function CompareProgress(props: { snapshot: CompareSnapshot; onCancel: () => void }) {
  const order: ComparePhase[] = ["queued", "resolving", "base", "head", "diffing"];
  const reached = (side: "base" | "head") => order.indexOf(props.snapshot.phase) > order.indexOf(side);
  return (
    <div class="flex flex-1 items-center justify-center p-6">
      <div class="plc-panel w-[420px] border p-4">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">{PHASE_TEXT[props.snapshot.phase]}</div>
          <Button variant="ghost" size="sm" onClick={() => props.onCancel()}>
            Cancel
          </Button>
        </div>
        <div class="mt-3 space-y-2.5">
          <For each={["base", "head"] as const}>
            {(side) => {
              const p = () => props.snapshot.sides[side];
              const pct = () =>
                reached(side) ? 100 : p().files_total ? Math.round((p().files_done / p().files_total) * 100) : 0;
              return (
                <div>
                  <div class="flex justify-between text-xs text-[var(--plc-on-muted)]">
                    <span class="capitalize">{side} · {side === "base" ? props.snapshot.base : props.snapshot.head}</span>
                    <span class="plc-data-sm">
                      {reached(side) ? "done" : p().files_total ? `${p().files_done} / ${p().files_total}` : ""}
                    </span>
                  </div>
                  <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--plc-surface-muted)]">
                    <div
                      class="h-full rounded-full bg-[var(--plc-accent)] transition-[width] duration-150"
                      style={{ width: `${pct()}%` }}
                    />
                  </div>
                </div>
              );
            }}
          </For>
        </div>
        <div class="plc-data-sm mt-3 h-4 truncate text-[var(--plc-on-subtle)]">
          {props.snapshot.sides[props.snapshot.phase === "head" ? "head" : "base"].current_path ?? ""}
        </div>
      </div>
    </div>
  );
}
