// The Changes view's controls, drawn in the view toolbar's slot: which window,
// touched or net, which map, and what the color means.

import { createSignal, For, Show, type JSX } from "solid-js";
import { Check, ChevronDown } from "lucide-solid";
import Popover from "../components/Popover";
import { Button } from "../components/ui/Button";
import { OptionRow, PopoverPanel } from "../components/ui/PopoverPanel";
import { segmentedKeyDown } from "../components/ui/segmentedKeys";
import { TextInput } from "../components/ui/TextInput";
import { metricDef, metricLabel } from "../utils/metricsStore";
import type { LensMode, LensWindow } from "./types";
import { DEFAULT_LENS, type ColorMode, type LensLayout, type LensState } from "./urlState";

interface Option<T> {
  id: T;
  label: string;
  title: string;
}

function Segmented<T extends string>(props: { label: string; name: string; options: Option<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      data-lens-group={props.name}
      onKeyDown={(e) => segmentedKeyDown(e, props.options.map((o) => o.id), props.value, props.onChange)}
      class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
    >
      <For each={props.options}>
        {(o) => (
          <Button
            variant="tab"
            size="sm"
            role="radio"
            aria-checked={props.value === o.id}
            tabIndex={props.value === o.id ? 0 : -1}
            active={props.value === o.id}
            class="px-2"
            title={o.title}
            data-lens-option={o.id}
            onClick={() => props.onChange(o.id)}
          >
            {o.label}
          </Button>
        )}
      </For>
    </div>
  );
}

const PRESETS: Option<Exclude<LensWindow, "custom">>[] = [
  { id: "branch", label: "This branch", title: "Every commit on this branch since it left the default branch" },
  { id: "24h", label: "24 hours", title: "Commits of the last 24 hours" },
  { id: "7d", label: "7 days", title: "Commits of the last 7 days" },
];
const WINDOW_IDS: LensWindow[] = ["branch", "24h", "7d", "custom"];

const MODES: Option<LensMode>[] = [
  { id: "touched", label: "Touched", title: "Every chunk a commit in the window changed, with work that was later put back" },
  { id: "net", label: "Net", title: "Only what differs between the start and the end of the window" },
];
const LAYOUTS: Option<LensLayout>[] = [
  { id: "edits", label: "Only edits", title: "Pack the edited chunks together; area is changed lines" },
  { id: "repo", label: "In repo", title: "Show in repo: the whole file map, with edited chunks marked in their files" },
];
const COLORS: Option<ColorMode>[] = [
  { id: "now", label: "Now", title: "Color by the value at the end of the window" },
  { id: "delta", label: "Delta", title: "Color by how much the value changed in the window" },
];

/** ISO time ↔ the value of a `datetime-local` input, in the browser's zone. */
const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string): string => (value ? new Date(value).toISOString() : "");

function Field(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <label class="grid grid-cols-[3.5rem_1fr] items-center gap-2 text-[12px] text-[var(--plc-on-muted)]" title={props.hint}>
      {props.label}
      {props.children}
    </label>
  );
}

/** The window presets, with Custom opening a small form for refs and times. */
function WindowPicker(props: { state: LensState; onChange: (patch: Partial<LensState>) => void }) {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal({ base: "", head: "", since: "", until: "" });
  const openCustom = () => {
    const s = props.state;
    setDraft({ base: s.base, head: s.head, since: toLocalInput(s.since), until: toLocalInput(s.until) });
    setOpen(true);
  };
  const apply = () => {
    const d = draft();
    setOpen(false);
    props.onChange({ window: "custom", base: d.base.trim(), head: d.head.trim(), since: fromLocalInput(d.since), until: fromLocalInput(d.until), commit: null });
  };
  const pick = (id: LensWindow) => (id === "custom" ? openCustom() : props.onChange({ window: id, commit: null }));
  const active = (id: LensWindow) => props.state.window === id;
  const edit = (key: "base" | "head" | "since" | "until") => (e: InputEvent & { currentTarget: HTMLInputElement }) => setDraft({ ...draft(), [key]: e.currentTarget.value });

  return (
    <div
      role="radiogroup"
      aria-label="Window"
      data-lens-group="window"
      onKeyDown={(e) => {
        // Arrow keys step through the presets; Custom needs its form, so they stop before it.
        if ((e.target as HTMLElement).closest("[data-lens-custom-form]")) return;
        segmentedKeyDown(e, WINDOW_IDS, props.state.window, pick);
      }}
      class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5"
    >
      <For each={PRESETS}>
        {(o) => (
          <Button variant="tab" size="sm" role="radio" aria-checked={active(o.id)} tabIndex={active(o.id) ? 0 : -1} active={active(o.id)} class="px-2" title={o.title} data-lens-option={o.id} onClick={() => pick(o.id)}>
            {o.label}
          </Button>
        )}
      </For>
      <Popover
        isOpen={open()}
        onOpenChange={setOpen}
        placement="bottom-start"
        offset={{ x: 0, y: 6 }}
        trigger={(trigger) => (
          <Button
            ref={trigger.ref}
            variant="tab"
            size="sm"
            role="radio"
            aria-checked={active("custom")}
            aria-haspopup="dialog"
            aria-expanded={open()}
            tabIndex={active("custom") ? 0 : -1}
            active={active("custom")}
            class="gap-1 px-2"
            title="Pick the two revisions, or a time range"
            data-lens-option="custom"
            onClick={() => (open() ? setOpen(false) : openCustom())}
          >
            Custom
            <ChevronDown size={12} aria-hidden="true" />
          </Button>
        )}
      >
        <PopoverPanel class="w-[21rem] max-w-[92vw] p-3" role="dialog" aria-label="Custom window" data-lens-custom-form>
          <form
            class="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          >
            <Field label="From" hint="A branch, tag or sha. Empty: the commit before the first one in the time range.">
              <TextInput size="sm" class="plc-data-sm" placeholder="main, v1.4.0 or a sha" value={draft().base} onInput={edit("base")} ref={(el) => queueMicrotask(() => el.focus())} />
            </Field>
            <Field label="To" hint="A branch, tag or sha. Empty: HEAD with the working tree.">
              <TextInput size="sm" class="plc-data-sm" placeholder="HEAD and the working tree" value={draft().head} onInput={edit("head")} />
            </Field>
            <Field label="Since" hint="Only commits at or after this time">
              <TextInput size="sm" type="datetime-local" value={draft().since} onInput={edit("since")} />
            </Field>
            <Field label="Until" hint="Only commits at or before this time">
              <TextInput size="sm" type="datetime-local" value={draft().until} onInput={edit("until")} />
            </Field>
            <div class="mt-1 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" data-lens-custom-apply>
                Show this window
              </Button>
            </div>
          </form>
        </PopoverPanel>
      </Popover>
    </div>
  );
}

/** Which metric drives the color. Only metrics with a before and after in this window. */
function MetricMenu(props: { metricIds: string[]; selected: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = createSignal(false);
  return (
    <Popover
      isOpen={open()}
      onOpenChange={setOpen}
      placement="bottom-start"
      offset={{ x: 0, y: 4 }}
      trigger={(trigger) => (
        <Button ref={trigger.ref} class="max-w-[13rem] shrink gap-1.5" aria-haspopup="listbox" aria-expanded={open()} data-lens-metric onClick={(e) => trigger.onClick(e)}>
          <span class="plc-collapsible-label font-normal text-[var(--plc-on-subtle)]">Color</span>
          <span class="min-w-0 truncate">{metricLabel(props.selected)}</span>
          <ChevronDown size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
        </Button>
      )}
    >
      <PopoverPanel class="w-[22rem] max-w-[92vw] p-1" role="listbox" aria-label="Color metric">
        <For each={props.metricIds} fallback={<div class="px-2 py-1.5 text-[12px] text-[var(--plc-on-subtle)]">No metric has a value in this window.</div>}>
          {(id) => (
            <OptionRow
              role="option"
              aria-selected={props.selected === id}
              selected={props.selected === id}
              data-lens-metric-option={id}
              class="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-2 px-2 py-1.5"
              onClick={() => {
                setOpen(false);
                props.onSelect(id);
              }}
            >
              <span class="mt-[3px] flex">{props.selected === id && <Check size={13} aria-hidden="true" />}</span>
              <span class="min-w-0">
                <span class="block text-[13px] font-semibold">{metricLabel(id)}</span>
                <Show when={metricDef(id)?.description}>{(text) => <span class="line-clamp-2 block text-[12px] leading-[17px] text-[var(--plc-on-muted)]">{text()}</span>}</Show>
              </span>
            </OptionRow>
          )}
        </For>
      </PopoverPanel>
    </Popover>
  );
}

const Divider = () => <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-[var(--plc-border)]" />;

export default function WindowBar(props: { state: LensState; metricIds: string[]; onChange: (patch: Partial<LensState>) => void }) {
  // The default metric stays offered while a result is loading or empty.
  const metricIds = () => (props.metricIds.length ? props.metricIds : [DEFAULT_LENS.metric]);
  return (
    <>
      <Divider />
      <WindowPicker state={props.state} onChange={props.onChange} />
      <Segmented label="Changes to show" name="mode" options={MODES} value={props.state.mode} onChange={(mode) => props.onChange({ mode })} />
      <Segmented label="Map" name="layout" options={LAYOUTS} value={props.state.layout} onChange={(layout) => props.onChange({ layout })} />
      <Divider />
      <MetricMenu metricIds={metricIds()} selected={props.state.metric} onSelect={(metric) => props.onChange({ metric })} />
      <Segmented label="Color by" name="color" options={COLORS} value={props.state.color} onChange={(color) => props.onChange({ color })} />
    </>
  );
}
