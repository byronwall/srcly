import { For, Show } from "solid-js";
import { SidebarTree } from "./SidebarTree";

export function StructurePanel(props: {
  baseName: () => string;
  path: () => any[];
  activeNode: () => any;
  getChildren: (node: any) => any[];
  isHidden: (node: any) => boolean;
  onSelectBreadcrumbIndex: (index: number, node: any) => void;
  onSelectNode: (node: any) => void;
}) {
  const displayPath = () => props.path().filter((n) => !props.isHidden(n));

  return (
    <Show when={displayPath().length > 0}>
      <div class="mb-6">
        <Show when={displayPath().length > 1}>
          <div class="mb-4 flex flex-col items-start gap-1">
            <For each={displayPath()}>
              {(node, i) => {
                const n = () => node;
                return (
                  <div class="flex items-center gap-1 w-full">
                    <span class="text-[var(--plc-on-disabled)] text-[10px] w-3 flex justify-center">
                      {i() > 0 ? "↳" : ""}
                    </span>
                    <button
                      class={`text-xs truncate hover:underline text-left flex-1 ${
                        i() === displayPath().length - 1
                          ? "font-bold text-[var(--plc-on-surface)] cursor-default hover:no-underline"
                          : "text-[var(--plc-accent)] hover:text-[var(--plc-accent-hover)]"
                      }`}
                      onClick={() => {
                        if (i() === displayPath().length - 1) return;
                        props.onSelectBreadcrumbIndex(i(), n());
                      }}
                    >
                      {i() === 0 ? props.baseName() : n().name}
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        <h3 class="plc-label-caps mb-3 border-b border-[var(--plc-border)] pb-1 text-[var(--plc-on-muted)]">
          Structure
        </h3>

        <div class="space-y-1">
          <For each={props.getChildren(props.activeNode())}>
            {(child) => {
              const childNode = () => child;
              return (
                <SidebarTree
                  node={childNode}
                  depth={0}
                  getChildren={props.getChildren}
                  isHidden={props.isHidden}
                  getIcon={(n) => {
                    if (n?.type === "function") return "ƒ";
                    if (n?.type === "class") return "C";
                    if (n?.type === "folder") return "📁";
                    return "•";
                  }}
                  onSelect={props.onSelectNode}
                />
              );
            }}
          </For>

          <Show when={!props.getChildren(props.activeNode())?.length}>
            <div class="text-xs text-[var(--plc-on-subtle)] italic px-2">No sub-items</div>
          </Show>
        </div>
      </div>
    </Show>
  );
}

