import { ChevronRight } from "lucide-solid";
import { createSignal, For, Show, type JSX } from "solid-js";

export function SidebarTree(props: {
  node: () => any;
  depth: number;
  getChildren: (node: any) => any[];
  isHidden?: (node: any) => boolean;
  getIcon?: (node: any) => JSX.Element;
  onSelect: (node: any) => void;
}) {
  if (props.isHidden?.(props.node())) return null;

  const [expanded, setExpanded] = createSignal(props.depth < 1);
  const children = () => props.getChildren(props.node());
  const hasChildren = () => children().length > 0;

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded());
  };

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    const n = props.node();

    const s = n?.start_line;
    const eLine = n?.end_line;
    const hasSpan =
      (typeof s === "number" && typeof eLine === "number") ||
      (typeof s === "string" &&
        typeof eLine === "string" &&
        s.trim() !== "" &&
        eLine.trim() !== "" &&
        Number.isFinite(Number(s)) &&
        Number.isFinite(Number(eLine)));


    if (hasSpan) {
      props.onSelect(n);
    } else if (hasChildren()) {
      setExpanded(!expanded());
    }
  };

  const icon = () => {
    const n = props.node();
    return props.getIcon?.(n) ?? null;
  };

  return (
    <div class="select-none">
      <div
        class="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)] cursor-pointer"
        style={{ "padding-left": `${props.depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        <span
          class="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--plc-on-subtle)] hover:text-[var(--plc-on-surface)]"
          onClick={toggle}
        >
          <Show when={hasChildren()}>
            <ChevronRight
              size={13}
              aria-hidden="true"
              class={`transition-transform duration-150 ${expanded() ? "rotate-90" : ""}`}
            />
          </Show>
        </span>
        <span class="flex shrink-0 text-[var(--plc-on-subtle)]">{icon()}</span>
        <span class="truncate">{props.node()?.name}</span>
      </div>
      <Show when={expanded() && hasChildren()}>
        <For each={children()}>
          {(child) => {
            const childNode = () => child;
            return (
              <SidebarTree
                node={childNode}
                depth={props.depth + 1}
                getChildren={props.getChildren}
                isHidden={props.isHidden}
                getIcon={props.getIcon}
                onSelect={props.onSelect}
              />
            );
          }}
        </For>
      </Show>
    </div>
  );
}

