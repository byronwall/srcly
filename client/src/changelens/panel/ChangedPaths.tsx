import { createMemo, createSignal, For, Show } from "solid-js";
import { TextInput } from "../../components/ui/TextInput";
import type { LensChangedPath, LensChangedPaths } from "../types";

const LABEL: Record<LensChangedPath["status"], string> = {
  added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed", reverted: "Touched only",
};

export function ChangedPaths(props: {
  inventory: LensChangedPaths | null | undefined;
  rows: LensChangedPath[];
  selected: string | null | undefined;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = createSignal("");
  const rows = createMemo(() => {
    const q = filter().trim().toLowerCase();
    return q ? props.rows.filter((r) => r.path.toLowerCase().includes(q) || r.oldPath?.toLowerCase().includes(q)) : props.rows;
  });
  return (
    <section class="flex min-h-0 flex-1 flex-col px-3 py-2" aria-label="Changed paths" data-changed-paths>
      <Show when={props.inventory && !props.inventory.unavailableReason}
        fallback={<p class="text-sm" role="status">{props.inventory?.unavailableReason ?? "This server does not include a changed-path inventory."}</p>}
      >
        <div class="mb-2 shrink-0 space-y-1">
          <TextInput type="search" class="w-full" aria-label="Filter changed paths" placeholder="Filter changed paths…" value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} />
          <p class="text-[12px] text-[var(--plc-on-muted)]">
            {props.rows.length} changed {props.rows.length === 1 ? "path" : "paths"} · {props.rows.filter((r) => r.measured).length} with structural metrics
          </p>
        </div>
        <ul class="min-h-0 flex-1 overflow-auto px-1" aria-label="Paths in scope" aria-busy={props.busy}>
          <For each={rows()} fallback={<li class="py-2 text-[12px]">No changed paths match here.</li>}>
            {(row) => (
              <li>
                <button type="button" class="w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-[var(--plc-surface-hover)] focus-visible:outline focus-visible:outline-[var(--plc-accent)]"
                  classList={{ "bg-[var(--plc-surface-selected)]": row.id === props.selected }}
                  aria-current={row.id === props.selected ? "true" : undefined}
                  disabled={props.busy}
                  data-changed-path={row.path}
                  onClick={() => props.onSelect(row.id)}
                >
                  <span class="plc-data-sm block break-all">{row.path}</span>
                  <Show when={row.oldPath && row.oldPath !== row.path}><span class="block break-all">from {row.oldPath}</span></Show>
                  <span class="block text-[var(--plc-on-muted)]">
                    {LABEL[row.status]}{row.commits.length ? ` · ${row.commits.length} ${row.commits.length === 1 ? "touch" : "touches"}` : ""}{!row.measured ? " · No structural metrics" : ""}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
