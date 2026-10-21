import { createMemo, For, Show, type ComponentProps } from "solid-js";
import { ChevronRight, FolderGit2 } from "lucide-solid";
import FolderMenu from "./FolderMenu";
import { baseName, crumbsFor } from "./location";
import { go, location } from "./store";

// Every header control is 28px tall, so the row reads as one line.
const crumbClass =
  "flex h-7 min-w-0 items-center rounded-md px-1.5 transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]";

/**
 * Where you are, read left to right: the analyzed folder (its menu switches
 * or rescans it), then the path inside it. One breadcrumb for every view.
 */
export default function LocationBar(props: {
  rootPath: string;
  menu: Omit<ComponentProps<typeof FolderMenu>, "path">;
}) {
  const crumbs = createMemo(() => crumbsFor(location().at, baseName(props.rootPath)));
  const root = () => crumbs()[0];
  const path = () => crumbs().slice(1);

  return (
    <nav aria-label="Location" class="flex min-w-0 flex-1 items-center overflow-hidden text-[14px]">
      <button
        type="button"
        class={`${crumbClass} min-w-[6rem] max-w-[16rem] shrink-[4] gap-1.5 font-medium text-[var(--plc-on-surface)]`}
        aria-current={path().length === 0 ? "location" : undefined}
        title={`${props.rootPath}\nGo to the top level`}
        onClick={() => go({ at: root().at })}
      >
        <FolderGit2 size={15} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
        <span class="truncate">{root().label}</span>
      </button>
      <span class="flex shrink-0">
        <FolderMenu path={props.rootPath} {...props.menu} />
      </span>
      <For each={path()}>
        {(crumb, i) => (
          <>
            <ChevronRight size={14} class="shrink-0 text-[var(--plc-on-disabled)]" aria-hidden="true" />
            <Show
              when={i() < path().length - 1}
              fallback={
                <span aria-current="location" class="min-w-[5rem] max-w-[24rem] shrink truncate px-1.5 font-semibold text-[var(--plc-on-surface)]">
                  {crumb.label}
                </span>
              }
            >
              {/* Middle crumbs give way first, then the folder name, then the current place. */}
              <button
                type="button"
                class={`${crumbClass} min-w-[2.75rem] max-w-[14rem] shrink-[8] text-[var(--plc-on-muted)]`}
                title={crumb.at}
                onClick={() => go({ at: crumb.at })}
              >
                <span class="truncate">{crumb.label}</span>
              </button>
            </Show>
          </>
        )}
      </For>
    </nav>
  );
}
