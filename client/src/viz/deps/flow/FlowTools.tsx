import { For } from "solid-js";
import { Button } from "../../../components/ui/Button";
import { segmentedKeyDown } from "../../../components/ui/segmentedKeys";
import { go, location } from "../../../navigation/store";

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
