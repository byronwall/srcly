import { PanelLeftOpen } from "lucide-solid";
import { IconButton } from "./ui/IconButton";

/**
 * What's left of the explorer sidebar while it is collapsed: a re-open
 * button lined up with the toolbars, and the whole rail as a click target.
 */
export function SidebarRail(props: { name: string; onExpand: () => void }) {
  return (
    <div class="flex h-full w-9 shrink-0 flex-col items-center border-r border-[var(--plc-border)] bg-[var(--plc-surface)]">
      <div class="plc-toolbar flex w-full shrink-0 items-center justify-center border-b">
        <IconButton label="Show sidebar ( [ )" onClick={() => props.onExpand()}>
          <PanelLeftOpen size={15} aria-hidden="true" />
        </IconButton>
      </div>
      <button
        type="button"
        tabindex={-1}
        aria-hidden="true"
        class="flex w-full flex-1 justify-center pt-3 text-[var(--plc-on-subtle)] transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]"
        onClick={() => props.onExpand()}
      >
        <span class="plc-label-caps [writing-mode:vertical-rl]">
          Files{props.name ? ` · ${props.name}` : ""}
        </span>
      </button>
    </div>
  );
}
