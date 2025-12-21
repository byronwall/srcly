import { createSignal, For, Show } from "solid-js";

export function SidebarTree(props: {
  node: () => any;
  depth: number;
  getChildren: (node: any) => any[];
  isHidden?: (node: any) => boolean;
  getIcon?: (node: any) => string;
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

    // eslint-disable-next-line no-console
    console.log("[breadcrumb] sidebar click", {
      name: n?.name ?? null,
      type: n?.type ?? null,
      start_line: s ?? null,
      end_line: eLine ?? null,
      hasSpan,
      depth: props.depth,
      childCount: (() => {
        try {
          return props.getChildren(n)?.length ?? 0;
        } catch {
          return null;
        }
      })(),
    });

    if (hasSpan) {
      props.onSelect(n);
    } else if (hasChildren()) {
      setExpanded(!expanded());
    }
  };

  const icon = () => {
    const n = props.node();
    return props.getIcon?.(n) ?? "•";
  };

  return (
    <div class="select-none">
      <div
        class="flex items-center gap-1 py-1 px-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer rounded"
        style={{ "padding-left": `${props.depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        <span
          class="w-4 h-4 flex items-center justify-center text-[10px] text-gray-500 hover:text-white"
          onClick={toggle}
        >
          {hasChildren() ? (expanded() ? "▼" : "▶") : ""}
        </span>
        <span class="font-mono text-[10px] opacity-70">{icon()}</span>
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


