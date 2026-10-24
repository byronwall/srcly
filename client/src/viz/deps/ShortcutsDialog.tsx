import { For } from "solid-js";
import { X } from "lucide-solid";
import { DialogHeader, DialogShell } from "../../components/dialog/DialogShell";
import { IconButton } from "../../components/ui/IconButton";

// Every key and pointer gesture the dependency graph understands, in one
// place: the `?` sheet renders this list.

type Row = [keys: string[][], does: string];

export const GRAPH_SHORTCUTS: { title: string; note?: string; rows: Row[] }[] = [
  {
    title: "Move",
    rows: [
      [[["←"], ["↑"], ["→"], ["↓"]], "Select the next box in that direction"],
      [[["/"]], "Go to any folder, file or symbol by name"],
      [[["Esc"]], "Clear the selection"],
      [[["U"], ["Backspace"]], "Up one level: focus the parent folder"],
      [[["Alt", "←"], ["Alt", "→"]], "Back / forward through the places visited, each as you left it (camera, selection, metric, filters)"],
    ],
  },
  {
    title: "Act on a box",
    note: "Keys act on the selected box, or on the box under the pointer.",
    rows: [
      [[["Enter"], ["F"]], "Same as a click: focus it (drill in), isolate a symbol"],
      [[["Shift", "Enter"], ["E"], ["Space"]], "Same as Shift-click: open it in place, or close the folder frame around it"],
      [[["C"]], "Close the opened folder around it"],
      [[["O"]], "Open its code"],
      [[["M"]], "Actions menu"],
    ],
  },
  {
    title: "View",
    rows: [
      [[["+"], ["−"]], "More / less detail: open or close a level of folders"],
      [[["R"]], "Close every opened folder"],
      [[["0"]], "Fit the graph to the window"],
      [[["X"]], "Toggle external packages"],
      [[["T"]], "Toggle tests"],
      [[["Y"]], "Toggle type-only imports"],
      [[["?"]], "Show this sheet"],
    ],
  },
  {
    title: "Mouse",
    rows: [
      [[["Click"]], "Focus it (drill in) · isolate a symbol"],
      [[["Shift", "Click"], ["Alt", "Click"]], "Open it in place (a file shows its symbols), or close its frame"],
      [[["Double-click"]], "Open a file's code · focus a folder"],
      [[["⌘", "Click"], ["Middle-click"]], "Open its code"],
      [[["Right-click"]], "Actions menu"],
      [[["Drag"], ["Wheel"]], "Pan · zoom"],
      [[["Hover"]], "Highlight its edges; hover a count, badge or strip for the list behind it"],
    ],
  },
];

function Keys(props: { combos: string[][] }) {
  return (
    <span class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <For each={props.combos}>
        {(combo, i) => (
          <>
            {i() > 0 ? <span class="text-[11px] text-[var(--plc-on-subtle)]">or</span> : null}
            <span class="inline-flex items-center gap-0.5">
              <For each={combo}>
                {(k) => (
                  <kbd class="min-w-[1.4rem] rounded border border-[var(--plc-border)] border-b-[var(--plc-border-strong)] bg-[var(--plc-surface-subtle)] px-1.5 py-px text-center text-[11px] font-medium leading-4 text-[var(--plc-on-surface)]">
                    {k}
                  </kbd>
                )}
              </For>
            </span>
          </>
        )}
      </For>
    </span>
  );
}

export function ShortcutsDialog(props: { open: boolean; onClose: () => void }) {
  return (
    <DialogShell open={props.open} onClose={props.onClose} size="lg" class="!h-auto max-h-[90vh] !w-[min(52rem,96vw)]" aria-label="Graph shortcuts">
      <DialogHeader
        title="Graph shortcuts"
        subtitle="Press ? any time in the graph"
        actions={
          <IconButton size="sm" label="Close (Esc)" onClick={props.onClose}>
            <X size={14} />
          </IconButton>
        }
      />
      <div class="grid grid-cols-1 gap-x-8 gap-y-4 overflow-auto px-4 py-3 text-[12.5px] lg:grid-cols-2">
        <For each={GRAPH_SHORTCUTS}>
          {(section) => (
            <section>
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]">{section.title}</h3>
              {section.note ? <p class="mt-0.5 text-[11px] text-[var(--plc-on-subtle)]">{section.note}</p> : null}
              <dl class="mt-1.5 grid grid-cols-[10.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
                <For each={section.rows}>
                  {([combos, does]) => (
                    <>
                      <dt>
                        <Keys combos={combos} />
                      </dt>
                      <dd class="text-[var(--plc-on-muted)]">{does}</dd>
                    </>
                  )}
                </For>
              </dl>
            </section>
          )}
        </For>
      </div>
    </DialogShell>
  );
}
