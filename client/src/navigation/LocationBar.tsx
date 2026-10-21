import { createMemo, For, Show, type ComponentProps } from "solid-js";
import { ChevronRight, FolderGit2 } from "lucide-solid";
import FolderMenu from "./FolderMenu";
import { baseName, crumbsFor } from "./location";
import { go, location } from "./store";

const crumbClass = "min-w-0 truncate rounded px-1.5 py-0.5 transition-colors duration-150";

/**
 * Where you are, read left to right: the analyzed folder (its menu switches
 * or rescans it), then the path inside it. One breadcrumb for every view.
 */
export default function LocationBar(props: {
  rootPath: string;
  menu: Omit<ComponentProps<typeof FolderMenu>, "path">;
}) {
  const crumbs = createMemo(() => crumbsFor(location().at, baseName(props.rootPath)));
  const isLast = (i: number) => i === crumbs().length - 1;

  return (
    <nav aria-label="Location" class="flex min-w-0 flex-1 items-center text-[14px]">
      <For each={crumbs()}>
        {(crumb, i) => (
          <>
            <Show when={i() > 0}>
              <ChevronRight size={14} class="shrink-0 text-[var(--plc-on-disabled)]" aria-hidden="true" />
            </Show>
            <button
              type="button"
              class={crumbClass}
              classList={{
                "shrink-0 flex items-center gap-1.5 font-semibold": i() === 0,
                "max-w-[14rem]": i() > 0 && !isLast(i()),
                "shrink-0 font-semibold text-[var(--plc-on-surface)] cursor-default": isLast(i()) && i() > 0,
                "text-[var(--plc-on-surface)] hover:bg-[var(--plc-surface-hover)]": i() === 0,
                "text-[var(--plc-on-muted)] hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-accent)]":
                  i() > 0 && !isLast(i()),
              }}
              aria-current={isLast(i()) ? "location" : undefined}
              title={i() === 0 ? `${props.rootPath} · go to the top level` : crumb.at}
              onClick={() => go({ at: crumb.at })}
            >
              <Show when={i() === 0}>
                <FolderGit2 size={15} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
              </Show>
              {crumb.label}
            </button>
            <Show when={i() === 0}>
              <FolderMenu path={props.rootPath} {...props.menu} />
            </Show>
          </>
        )}
      </For>
    </nav>
  );
}
