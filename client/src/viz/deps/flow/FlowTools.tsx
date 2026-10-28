import { createMemo, createSignal, For, Show } from "solid-js";
import { ChevronDown, Crosshair, FolderTree, History, Route } from "lucide-solid";
import Popover from "../../../components/Popover";
import { Button } from "../../../components/ui/Button";
import { OptionRow, PopoverPanel, PopoverSectionTitle } from "../../../components/ui/PopoverPanel";
import { segmentedKeyDown } from "../../../components/ui/segmentedKeys";
import { recentFlowPlaces } from "../../../navigation/flowPlaces";
import { shortAge } from "../../../navigation/history";
import { isDataFlow, samePlace, type Direction } from "../../../navigation/location";
import { go, history, location } from "../../../navigation/store";
import { REACH_MODES, type ReachMode } from "./reach";

const DIRECTIONS: { id: Direction; label: string; title: string }[] = [
  { id: "backward", label: "From", title: "Where the value comes from: origins and the steps between" },
  { id: "both", label: "Both", title: "Where it comes from and where it goes" },
  { id: "forward", label: "To", title: "Where the value goes: render slots, effects, returns" },
];
const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);
/** The reach a selected box lights for each trace direction: what it comes from is upstream, where it goes downstream. */
export const REACH_OF_DIRECTION: Record<Direction, ReachMode> = { backward: "up", both: "both", forward: "down" };

/** Anchor mode: which way the value is traced from the anchor. */
export function DirectionSwitch(props: { dir: Direction; onChange: (dir: Direction) => void }) {
  return (
    <label class="flex shrink-0 items-center gap-1 px-1 text-[12px]">
      <span class="text-[var(--plc-on-muted)]">Trace</span>
      <div
        role="radiogroup"
        aria-label="Trace direction"
        onKeyDown={(e) => segmentedKeyDown(e, DIRECTION_IDS, props.dir, props.onChange)}
        class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
      >
        <For each={DIRECTIONS}>
          {(d) => (
            <Button
              variant="tab"
              size="sm"
              role="radio"
              aria-checked={props.dir === d.id}
              tabIndex={props.dir === d.id ? 0 : -1}
              active={props.dir === d.id}
              class="px-2"
              title={d.title}
              onClick={() => props.onChange(d.id)}
            >
              {d.label}
            </Button>
          )}
        </For>
      </div>
    </label>
  );
}

const LENSES = [
  { id: "data", label: "Data", title: "How the route's data flows: its params, resources and state, to what it renders" },
  { id: "components", label: "Components", title: "The route's render tree: every component, Show and For it renders" },
] as const;
type Lens = (typeof LENSES)[number]["id"];

/** A page route: its data trace (the component's anchor) or its render tree. */
export function RouteLensSwitch(props: { route: string; lens: Lens; onChange: (lens: Lens) => void }) {
  return (
    <div class="flex shrink-0 items-center gap-1 px-1 text-[12px]" data-route-lens={props.lens}>
      <Show when={props.route}>
        <span class="text-[var(--plc-on-muted)]">Route</span>
        <span class="max-w-[12rem] truncate font-medium">{props.route}</span>
      </Show>
      <div
        role="radiogroup"
        aria-label="Route lens"
        onKeyDown={(e) => segmentedKeyDown(e, LENSES.map((l) => l.id), props.lens, props.onChange)}
        class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
      >
        <For each={LENSES}>
          {(l) => (
            <Button variant="tab" size="sm" role="radio" aria-checked={props.lens === l.id} tabIndex={props.lens === l.id ? 0 : -1} active={props.lens === l.id} class="px-2" title={l.title} onClick={() => props.onChange(l.id)}>
              {l.label}
            </Button>
          )}
        </For>
      </div>
    </div>
  );
}

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
  const mode = (): Mode => (isDataFlow(location()) ? "flow" : "imports");
  const select = (next: Mode) => {
    if (next === mode()) return;
    go({ flow: next === "flow" ? "" : undefined, anchor: undefined, dir: undefined, open: undefined });
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

const DIR_WORD: Record<Direction, string> = { backward: "from", both: "both ways", forward: "to" };

/**
 * Anchor history (T18): the anchors and routes traced in this tab, newest
 * first, from the visit ring (sessionStorage only). A click goes there as a
 * new Back step; Return and Forward walk the same history.
 */
export function RecentFlowMenu(props: { routeName: (key: string) => string }) {
  const [open, setOpen] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  const places = createMemo(() => recentFlowPlaces(history(), location().repo, props.routeName));
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
          class="shrink-0 gap-1 whitespace-nowrap px-2"
          aria-haspopup="menu"
          aria-expanded={open()}
          aria-label="Recent anchors and routes"
          title="Anchors and routes traced in this tab (Return and Forward walk them)"
        >
          <History size={13} aria-hidden="true" />
          Recent
          <ChevronDown size={12} class="text-[var(--plc-on-subtle)]" aria-hidden="true" />
        </Button>
      )}
    >
      <PopoverPanel class="max-h-[70vh] w-[24rem] max-w-[90vw] overflow-y-auto p-0">
        <PopoverSectionTitle class="mb-0 border-b border-[var(--plc-border)] px-3 py-2">Recent anchors and routes</PopoverSectionTitle>
        <Show when={places().length > 0} fallback={<p class="px-3 py-3 text-[12px] text-[var(--plc-on-subtle)]">Anchors you trace and routes you open show up here.</p>}>
          <div class="py-1" role="menu" aria-label="Recent anchors and routes">
            <For each={places()}>
              {({ entry, label }) => {
                const current = () => samePlace(entry.loc, location());
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
                    <span class="mt-[2px] flex text-[var(--plc-on-subtle)]">
                      {label.kind === "anchor" ? <Crosshair size={13} aria-label="Anchor" /> : label.kind === "exports" ? <FolderTree size={13} aria-label="File or folder" /> : <Route size={13} aria-label="Route" />}
                    </span>
                    <span class="min-w-0 break-words leading-[18px]">
                      <span class="font-mono text-[12px] font-medium">{label.leaf}</span>
                      <Show when={label.dir}>{(dir) => <span class="text-[var(--plc-on-subtle)]"> · {DIR_WORD[dir()]}</span>}</Show>
                      <Show when={label.detail}>{(detail) => <span class="block truncate text-[11px] text-[var(--plc-on-subtle)]">{detail()}</span>}</Show>
                    </span>
                    <span class="text-right tabular-nums leading-[18px] text-[var(--plc-on-subtle)]">{shortAge(entry.time, now())}</span>
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
