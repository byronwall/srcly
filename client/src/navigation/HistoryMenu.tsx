import { createSignal, For, Show } from "solid-js";
import { ChevronDown, GitFork, History, LayoutGrid } from "lucide-solid";
import Popover from "../components/Popover";
import { Button } from "../components/ui/Button";
import { OptionRow, PopoverPanel, PopoverSectionTitle } from "../components/ui/PopoverPanel";
import { shortAge, type HistoryEntry } from "./history";
import { baseName, crumbsFor, samePlace } from "./location";
import { go, history, location } from "./store";

/** Splits a place into a muted parent trail and its own name. */
function placeLabel(entry: HistoryEntry) {
  const crumbs = crumbsFor(entry.loc.at, baseName(entry.loc.repo));
  const leaf = crumbs[crumbs.length - 1].label;
  const parent = crumbs
    .slice(1, -1)
    .map((c) => c.label)
    .join("/");
  return { leaf, parent };
}

/** Header dropdown of the last places visited in this tab; click to jump. */
export default function HistoryMenu() {
  const [open, setOpen] = createSignal(false);
  // Ages are computed when the list opens, not ticked live.
  const [now, setNow] = createSignal(Date.now());

  const toggle = (next: boolean) => {
    if (next) setNow(Date.now());
    setOpen(next);
  };

  return (
    <Popover
      isOpen={open()}
      onOpenChange={toggle}
      placement="bottom-end"
      offset={{ x: 0, y: 4 }}
      trigger={(trigger) => (
        <Button
          ref={trigger.ref}
          onClick={(e) => trigger.onClick(e)}
          variant="ghost"
          class="shrink-0 gap-1.5 whitespace-nowrap"
          aria-haspopup="menu"
          aria-expanded={open()}
          title="Places visited in this tab (Back and Forward also work)"
        >
          <History size={14} aria-hidden="true" />
          History
          <ChevronDown size={12} class="text-[var(--plc-on-subtle)]" aria-hidden="true" />
        </Button>
      )}
    >
      <PopoverPanel class="max-h-[70vh] w-[30rem] max-w-[90vw] overflow-y-auto p-0">
        <PopoverSectionTitle class="mb-0 border-b border-[var(--plc-border)] px-3 py-2">
          Recent places
        </PopoverSectionTitle>
        <Show
          when={history().length > 0}
          fallback={
            <p class="px-3 py-3 text-[12px] text-[var(--plc-on-subtle)]">
              Places you zoom or focus on show up here.
            </p>
          }
        >
          <div class="py-1" role="menu">
            <For each={history()}>
              {(entry) => {
                const label = placeLabel(entry);
                const current = () => samePlace(entry.loc, location());
                const otherRepo = () => entry.loc.repo !== location().repo;
                return (
                  <OptionRow
                    role="menuitem"
                    selected={current()}
                    aria-current={current() ? "location" : undefined}
                    class="grid grid-cols-[14px_minmax(0,1fr)_2.5rem] items-start gap-2 rounded-none px-3 py-1.5"
                    onClick={() => {
                      setOpen(false);
                      go(entry.loc);
                    }}
                  >
                    <span class="mt-[2px] flex text-[var(--plc-on-subtle)]" title={entry.loc.view === "graph" ? "Graph" : "Treemap"}>
                      {entry.loc.view === "graph" ? (
                        <GitFork size={13} aria-label="Graph" />
                      ) : (
                        <LayoutGrid size={13} aria-label="Treemap" />
                      )}
                    </span>
                    <span class="min-w-0 break-words leading-[18px]">
                      <Show when={otherRepo()}>
                        <span class="text-[var(--plc-on-subtle)]">{baseName(entry.loc.repo)} · </span>
                      </Show>
                      <Show when={label.parent}>
                        <span class="text-[var(--plc-on-subtle)]">{label.parent}/</span>
                      </Show>
                      <span class="font-medium">{label.leaf}</span>
                    </span>
                    <span class="text-right tabular-nums leading-[18px] text-[var(--plc-on-subtle)]">
                      {shortAge(entry.time, now())}
                    </span>
                  </OptionRow>
                );
              }}
            </For>
          </div>
        </Show>
      </PopoverPanel>
    </Popover>
  );
}
