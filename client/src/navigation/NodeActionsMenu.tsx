import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Crosshair, FileCode2, FolderOpen, Maximize2 } from "lucide-solid";
import { nodeActions, type NodeActionId, type NodeKind } from "./nodeActions";

export interface NodeMenuTarget {
  /** Viewport point to open at (the cursor, or the "⋯" button's corner). */
  x: number;
  y: number;
  at: string;
  kind: NodeKind;
  /** Full name shown above the actions. */
  title: string;
  /** Where the view is now; actions that wouldn't move are disabled. */
  currentAt: string;
  /** Graph only: offer Expand in place, or Collapse of the opened folder around it. */
  expand?: boolean | { collapse: string };
}

const ICONS: Record<NodeActionId, typeof Crosshair> = {
  focus: Crosshair,
  expand: Maximize2,
  open: FileCode2,
  folder: FolderOpen,
};

const MENU_WIDTH = 224;
const EDGE = 8;

/**
 * Focus · Open code · Show folder for one node, shared by the treemap and the
 * graph. Opens at a point; closes on a pick, Escape, an outside press, scroll
 * or resize. Arrow keys move between items.
 */
export default function NodeActionsMenu(props: {
  target: NodeMenuTarget;
  onAction: (id: NodeActionId) => void;
  onClose: () => void;
}) {
  let menu!: HTMLDivElement;
  const [pos, setPos] = createSignal({ left: props.target.x, top: props.target.y });
  const actions = () => nodeActions(props.target);
  // "a/b/c.ts#Foo" → name "c.ts#Foo", parent "a/b"; paths wrap only at "/".
  const name = () => props.target.title.slice(props.target.title.lastIndexOf("/") + 1);
  const parent = () => props.target.title.slice(0, Math.max(0, props.target.title.lastIndexOf("/")));

  const items = () => Array.from(menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])"));
  const move = (delta: number) => {
    const list = items();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = i < 0 ? (delta > 0 ? 0 : list.length - 1) : (i + delta + list.length) % list.length;
    list[next].focus();
  };

  onMount(() => {
    // Keep the whole menu on screen.
    const rect = menu.getBoundingClientRect();
    setPos({
      left: Math.max(EDGE, Math.min(props.target.x, window.innerWidth - rect.width - EDGE)),
      top: Math.max(EDGE, Math.min(props.target.y, window.innerHeight - rect.height - EDGE)),
    });
    // Focus the menu itself: arrows step into the items, and a mouse-opened
    // menu shows no focus ring.
    menu.focus();

    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) props.onClose();
    };
    const close = () => props.onClose();
    // Capture so a press that also starts a pan or a click elsewhere still closes it first.
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    onCleanup(() => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    });
  });

  return (
    <Portal>
      <div
        ref={menu}
        role="menu"
        aria-label={`Actions for ${props.target.title}`}
        tabIndex={-1}
        class="plc-floating fixed z-[60] rounded-lg border py-1 text-[12px]"
        // The container takes focus only to route arrow keys; items show focus.
        style={{ left: `${pos().left}px`, top: `${pos().top}px`, width: `${MENU_WIDTH}px`, outline: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onClose();
          else if (e.key === "ArrowDown") move(1);
          else if (e.key === "ArrowUp") move(-1);
          else if (e.key === "Tab") props.onClose();
          else return;
          e.preventDefault();
        }}
      >
        <div class="px-3 pb-1 pt-0.5 leading-4">
          <div class="font-medium text-[var(--plc-on-surface)]">{name()}</div>
          <Show when={parent()}>
            <div class="text-[11px] text-[var(--plc-on-subtle)]">
              <For each={parent().split("/")}>
                {(part, i) => (
                  <>
                    {i() > 0 ? "/" : ""}
                    <wbr />
                    {part}
                  </>
                )}
              </For>
            </div>
          </Show>
        </div>
        <For each={actions()}>
          {(action) => {
            const Icon = ICONS[action.id];
            return (
              <button
                type="button"
                role="menuitem"
                disabled={Boolean(action.disabledReason)}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--plc-on-surface)] transition-colors duration-[140ms] hover:bg-[var(--plc-surface-hover)] focus-visible:bg-[var(--plc-surface-hover)] focus-visible:outline-none active:bg-[var(--plc-surface-selected)] disabled:cursor-default disabled:text-[var(--plc-on-disabled)] disabled:hover:bg-transparent"
                onClick={() => {
                  // Act first: closing unmounts the menu and its target.
                  props.onAction(action.id);
                  props.onClose();
                }}
              >
                <Icon size={13} aria-hidden="true" class="shrink-0" />
                <span class="flex-1">{action.label}</span>
                <span class="text-[11px] text-[var(--plc-on-disabled)]">{action.disabledReason}</span>
              </button>
            );
          }}
        </For>
      </div>
    </Portal>
  );
}
