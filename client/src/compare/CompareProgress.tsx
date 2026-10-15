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

const seconds = (s: number) => (s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`);

/** `checkout 0.4s · scan 12s · graph 2.1s`, or `cached 0.1s` for a cache hit. */
export function stepText(steps: Record<string, number> | undefined): string {
  if (!steps) return "";
  const entries = Object.entries(steps);
  if (entries.length === 1 && entries[0][0] === "cache") return `cached ${seconds(entries[0][1])}`;
  return entries
    .filter(([name, s]) => name !== "cache" || s >= 0.05)
    .map(([name, s]) => `${name} ${seconds(s)}`)
    .join(" · ");
}

/**
 * Fixed-size progress panel: one bar per side, so nothing shifts as numbers
 * change. Each side also shows where its time goes (checkout, scan, graph),
 * which is what tells a slow cold compare apart from a cache hit.
 */
export function CompareProgress(props: { snapshot: CompareSnapshot; onCancel: () => void }) {
  const order: ComparePhase[] = ["queued", "resolving", "base", "head", "diffing"];
  const reached = (side: "base" | "head") => order.indexOf(props.snapshot.phase) > order.indexOf(side);
  const resolving = () => props.snapshot.timings?.phases?.resolving;
  return (
    <div class="flex flex-1 items-center justify-center p-6">
      <div class="plc-panel w-[460px] border p-4">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">{PHASE_TEXT[props.snapshot.phase]}</div>
          <div class="flex items-center gap-2">
            <span class="plc-data-sm text-[var(--plc-on-subtle)]">{seconds(props.snapshot.elapsed_seconds)}</span>
            <Button variant="ghost" size="sm" onClick={() => props.onCancel()}>
              Cancel
            </Button>
          </div>
        </div>
        <div class="mt-3 space-y-2.5">
          <For each={["base", "head"] as const}>
            {(side) => {
              const p = () => props.snapshot.sides[side];
              const steps = () => props.snapshot.timings?.[side];
              const pct = () =>
                reached(side) ? 100 : p().files_total ? Math.round((p().files_done / p().files_total) * 100) : 0;
              return (
                <div>
                  <div class="flex justify-between gap-3 text-xs text-[var(--plc-on-muted)]">
                    <span class="min-w-0 truncate">
                      <span class="capitalize">{side}</span> · {side === "base" ? props.snapshot.base : props.snapshot.head}
                    </span>
                    <span class="plc-data-sm shrink-0">
                      {reached(side) ? "done" : p().files_total ? `${p().files_done} / ${p().files_total}` : ""}
                    </span>
                  </div>
                  <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--plc-surface-muted)]">
                    <div
                      class="h-full rounded-full bg-[var(--plc-accent)] transition-[width] duration-150"
                      style={{ width: `${pct()}%` }}
                    />
                  </div>
                  <div class="plc-data-sm mt-1 h-4 truncate text-[var(--plc-on-subtle)]">{stepText(steps())}</div>
                </div>
              );
            }}
          </For>
        </div>
        <div class="plc-data-sm mt-2 flex h-4 justify-between gap-3 text-[var(--plc-on-subtle)]">
          <span class="min-w-0 truncate">
            {props.snapshot.sides[props.snapshot.phase === "head" ? "head" : "base"].current_path ?? ""}
          </span>
          <span class="shrink-0">{resolving() !== undefined ? `resolve ${seconds(resolving()!)}` : ""}</span>
        </div>
      </div>
    </div>
  );
}
