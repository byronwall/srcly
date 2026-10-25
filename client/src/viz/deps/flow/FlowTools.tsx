import { For } from "solid-js";
import { Button } from "../../../components/ui/Button";
import { segmentedKeyDown } from "../../../components/ui/segmentedKeys";
import { go, location } from "../../../navigation/store";
import { REACH_MODES, type ReachMode } from "./reach";

const REACH_IDS = REACH_MODES.map((m) => m.id);

/** Which way a selected box's reach is lit: both ways, only what reaches it, or only what it reaches. `R` cycles. */
export function ReachModeSwitch(props: { mode: ReachMode; onChange: (mode: ReachMode) => void }) {
  return (
    <label class="flex shrink-0 items-center gap-1 px-1 text-[12px]">
      <span class="text-[var(--plc-on-muted)]">Reach</span>
      <div
        role="radiogroup"
        aria-label="Reach direction"
        onKeyDown={(e) => segmentedKeyDown(e, REACH_IDS, props.mode, props.onChange)}
        class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
      >
        <For each={REACH_MODES}>
          {(m) => (
            <Button
              variant="tab"
              size="sm"
              role="radio"
              aria-checked={props.mode === m.id}
              tabIndex={props.mode === m.id ? 0 : -1}
              active={props.mode === m.id}
              class="px-2"
              title={`${m.title} (R cycles)`}
              onClick={() => props.onChange(m.id)}
            >
              {m.label}
            </Button>
          )}
        </For>
      </div>
    </label>
  );
}

type Mode = "imports" | "flow";
const MODES: { id: Mode; label: string; title: string }[] = [
  { id: "imports", label: "Imports", title: "What imports what" },
  { id: "flow", label: "Data flow", title: "How values reach what a route renders" },
];
const MODE_IDS = MODES.map((m) => m.id);

/** The graph's two modes, in the view toolbar. Data flow keeps its route in the URL (`flow`). */
export function FlowModeSwitch() {
  const mode = (): Mode => (location().flow === undefined ? "imports" : "flow");
  const select = (next: Mode) => {
    if (next === mode()) return;
    go({ flow: next === "flow" ? "" : undefined, open: undefined });
  };
  return (
    <div
      role="radiogroup"
      aria-label="Graph mode"
      onKeyDown={(e) => segmentedKeyDown(e, MODE_IDS, mode(), select)}
      class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
    >
      <For each={MODES}>
        {(m) => (
          <Button
            variant="tab"
            size="sm"
            role="radio"
            aria-checked={mode() === m.id}
            tabIndex={mode() === m.id ? 0 : -1}
            active={mode() === m.id}
            class="px-2"
            title={m.title}
            onClick={() => select(m.id)}
          >
            {m.label}
          </Button>
        )}
      </For>
    </div>
  );
}
