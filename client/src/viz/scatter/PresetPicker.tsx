import { createSignal, For } from "solid-js";
import { Check, ChevronDown } from "lucide-solid";
import Popover from "../../components/Popover";
import { Button } from "../../components/ui/Button";
import { OptionRow, PopoverPanel } from "../../components/ui/PopoverPanel";
import type { QuadrantPreset } from "./quadrants";

/**
 * Which two metrics the 2x2 plots. A menu rather than a row of tabs: each
 * preset shows its axes and what it is for, and the toolbar keeps its room.
 */
export default function PresetPicker(props: {
  presets: QuadrantPreset[];
  selected: QuadrantPreset | undefined;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = createSignal(false);

  return (
    <Popover
      isOpen={open()}
      onOpenChange={setOpen}
      placement="bottom-start"
      offset={{ x: 0, y: 4 }}
      trigger={(trigger) => (
        <Button
          ref={trigger.ref}
          class="min-w-[5.5rem] max-w-[14rem] shrink gap-1.5"
          aria-haspopup="listbox"
          aria-expanded={open()}
          title={props.selected ? `${props.selected.x.label} × ${props.selected.y.label}` : undefined}
          onClick={(e) => trigger.onClick(e)}
        >
          <span class="plc-collapsible-label font-normal text-[var(--plc-on-subtle)]">2x2</span>
          <span class="min-w-0 truncate">{props.selected?.label ?? "No presets"}</span>
          <ChevronDown size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
        </Button>
      )}
    >
      <PopoverPanel class="w-[26rem] max-w-[92vw] p-1" role="listbox" aria-label="2x2 preset">
        <For each={props.presets}>
          {(p) => {
            const current = () => props.selected?.id === p.id;
            return (
              <OptionRow
                role="option"
                aria-selected={current()}
                selected={current()}
                class="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-2 px-2 py-1.5 text-left"
                onClick={() => {
                  setOpen(false);
                  props.onSelect(p.id);
                }}
              >
                <span class="mt-[3px] flex">
                  {current() && <Check size={13} aria-hidden="true" />}
                </span>
                <span class="min-w-0">
                  <span class="flex items-baseline gap-2">
                    <span class="text-[13px] font-semibold">{p.label}</span>
                    <span class="truncate text-[12px] text-[var(--plc-on-subtle)]">
                      {p.x.label} × {p.y.label}
                    </span>
                  </span>
                  <span class="block text-[12px] leading-[17px] text-[var(--plc-on-muted)]">{p.description}</span>
                </span>
              </OptionRow>
            );
          }}
        </For>
      </PopoverPanel>
    </Popover>
  );
}
