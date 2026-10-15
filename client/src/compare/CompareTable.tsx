import { ArrowDown, ArrowRight, ChevronDown, ChevronRight, Circle, Columns3, Minus, Plus } from "lucide-solid";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import Popover from "../components/Popover";
import { Button } from "../components/ui/Button";
import { CheckboxRow } from "../components/ui/CheckboxRow";
import { PopoverPanel } from "../components/ui/PopoverPanel";
import { cx } from "../components/ui/classes";
import { compareMetricLabel, formatDelta, formatValue, STATUS_COLOR, STATUS_LABEL, VERDICT_TEXT } from "./metrics";
import { buildRows, collectFiles, indexFiles, type FileRow, type FolderRow } from "./rows";
import type { ChangeStatus, ComparePayload } from "./types";

const STATUS_ICON: Record<ChangeStatus, typeof Plus> = {
  added: Plus,
  removed: Minus,
  modified: Circle,
  renamed: ArrowRight,
};

function StatusIcon(props: { status: ChangeStatus }) {
  const Icon = STATUS_ICON[props.status];
  return (
    <span title={STATUS_LABEL[props.status]} class="inline-flex" style={{ color: STATUS_COLOR[props.status] }}>
      <Icon size={props.status === "modified" ? 7 : 12} stroke-width={props.status === "modified" ? 0 : 2.5} fill={props.status === "modified" ? "currentColor" : "none"} />
    </span>
  );
}

function Lines(props: { additions: number; deletions: number }) {
  return (
    <span class="plc-data-sm whitespace-nowrap">
      <span class="text-[var(--plc-success)]">+{props.additions}</span>{" "}
      <span class="text-[var(--plc-error)]">−{props.deletions}</span>
    </span>
  );
}

function MetricCell(props: { metric: string; row: FileRow }) {
  return (
    <Switch>
      <Match when={props.row.change}>
        {(change) => {
          const d = () => change().deltas[props.metric];
          return (
            <Show when={d()}>
              {(delta) => (
                <span class="flex items-baseline justify-end gap-2 whitespace-nowrap">
                  <span class="plc-data-sm text-[var(--plc-on-subtle)]">
                    {formatValue(props.metric, delta().before)} → {formatValue(props.metric, delta().after)}
                  </span>
                  <span class={cx("plc-data-sm w-12 text-right font-semibold", VERDICT_TEXT[delta().verdict])}>
                    {delta().before === null || delta().after === null || delta().verdict === "same"
                      ? ""
                      : formatDelta(props.metric, delta().delta)}
                  </span>
                </span>
              )}
            </Show>
          );
        }}
      </Match>
      <Match when={props.row.metrics}>
        {(metrics) => (
          <span class="plc-data-sm block pr-14 text-right text-[var(--plc-on-disabled)]">
            {metrics()[props.metric] ? formatValue(props.metric, metrics()[props.metric]) : ""}
          </span>
        )}
      </Match>
    </Switch>
  );
}

/**
 * Changed files as a folder tree with before → after metrics. Click a metric
 * header to rank files by the size of that metric's change.
 */
export function CompareTable(props: {
  payload: ComparePayload;
  columns: string[];
  onColumnsChange: (columns: string[]) => void;
  sortMetric: string | null;
  onSortChange: (metric: string | null) => void;
  onOpenFile: (row: FileRow) => void;
}) {
  const [showUnchanged, setShowUnchanged] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
  const headFiles = createMemo(() => indexFiles(props.payload.trees?.head));
  const files = createMemo(() => collectFiles(props.payload.files, headFiles(), showUnchanged()));
  const rows = createMemo(() =>
    buildRows(files(), { showUnchanged: showUnchanged(), sortMetric: props.sortMetric, collapsed: collapsed() })
  );
  // Metrics worth offering as columns: anything that moved in this compare.
  const available = createMemo(() =>
    props.payload.metrics.map((m) => m.name).filter((name) => props.payload.summary.metrics[name])
  );
  const grid = () => `20px minmax(260px, 1fr) 96px repeat(${props.columns.length}, 168px)`;

  const toggle = (path: string) => {
    const next = new Set(collapsed());
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsed(next);
  };

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="plc-toolbar flex shrink-0 items-center gap-4 border-b px-4">
        <CheckboxRow
          label="Show unchanged files in changed folders"
          checked={showUnchanged()}
          onChange={setShowUnchanged}
        />
        <Popover
          placement="bottom-start"
          trigger={(t) => (
            <Button ref={t.ref} variant="ghost" size="sm" onClick={t.onClick} class="gap-1.5">
              <Columns3 size={13} aria-hidden="true" />
              Metrics ({props.columns.length})
            </Button>
          )}
        >
          <PopoverPanel class="max-h-96 w-60 overflow-auto p-2">
            <For each={available()}>
              {(name) => (
                <CheckboxRow
                  class="py-1"
                  label={compareMetricLabel(name)}
                  checked={props.columns.includes(name)}
                  onChange={(on) =>
                    props.onColumnsChange(
                      on
                        ? available().filter((n) => n === name || props.columns.includes(n))
                        : props.columns.filter((c) => c !== name)
                    )
                  }
                />
              )}
            </For>
          </PopoverPanel>
        </Popover>
        <Show when={props.sortMetric}>
          <span class="text-xs text-[var(--plc-on-subtle)]">
            Ranked by change in {compareMetricLabel(props.sortMetric!)} ·{" "}
            <button
              type="button"
              class="text-[var(--plc-accent)] transition-colors hover:text-[var(--plc-accent-hover)]"
              onClick={() => props.onSortChange(null)}
            >
              back to folders
            </button>
          </span>
        </Show>
      </div>

      <div class="min-h-0 flex-1 overflow-auto bg-[var(--plc-surface)]">
        <div class="min-w-max">
          <div
            class="plc-table-header plc-label-sm sticky top-0 z-10 grid items-center border-b"
            style={{ "grid-template-columns": grid() }}
          >
            <span />
            <button
              type="button"
              class="text-left transition-colors hover:text-[var(--plc-on-surface)]"
              onClick={() => props.onSortChange(null)}
            >
              File
            </button>
            <span class="pr-3 text-right">Lines</span>
            <For each={props.columns}>
              {(name) => (
                <button
                  type="button"
                  class={cx(
                    "flex items-center justify-end gap-1 pr-3 transition-colors hover:text-[var(--plc-on-surface)]",
                    props.sortMetric === name && "text-[var(--plc-accent)]"
                  )}
                  title={`Rank files by change in ${compareMetricLabel(name)}`}
                  onClick={() => props.onSortChange(props.sortMetric === name ? null : name)}
                >
                  {compareMetricLabel(name)}
                  <Show when={props.sortMetric === name}>
                    <ArrowDown size={11} aria-hidden="true" />
                  </Show>
                </button>
              )}
            </For>
          </div>

          <For each={rows()}>
            {(row) => (
              <Switch>
                <Match when={row.kind === "folder" && (row as FolderRow)}>
                  {(folder) => (
                    <button
                      type="button"
                      class="plc-row grid h-7 min-h-0 w-full items-center border-b text-left text-[13px] transition-colors"
                      style={{ "grid-template-columns": grid() }}
                      onClick={() => toggle(folder().path)}
                    >
                      <span />
                      <span class="flex min-w-0 items-center gap-1" style={{ "padding-left": `${folder().depth * 16}px` }}>
                        <Show
                          when={collapsed().has(folder().path)}
                          fallback={<ChevronDown size={13} class="shrink-0 text-[var(--plc-on-subtle)]" />}
                        >
                          <ChevronRight size={13} class="shrink-0 text-[var(--plc-on-subtle)]" />
                        </Show>
                        <span class="font-medium text-[var(--plc-on-muted)]">{folder().name}/</span>
                        <span class="ml-1 text-xs text-[var(--plc-on-subtle)]">{folder().changed} changed</span>
                      </span>
                      <span class="pr-3 text-right">
                        <Lines additions={folder().additions} deletions={folder().deletions} />
                      </span>
                    </button>
                  )}
                </Match>
                <Match when={row.kind === "file" && (row as FileRow)}>
                  {(file) => (
                    <button
                      type="button"
                      class={cx(
                        "plc-row grid h-7 min-h-0 w-full items-center border-b text-left text-[13px] transition-colors",
                        !file().change && "text-[var(--plc-on-subtle)]"
                      )}
                      style={{ "grid-template-columns": grid() }}
                      onClick={() => props.onOpenFile(file())}
                    >
                      <span class="flex justify-center">
                        <Show when={file().change}>{(c) => <StatusIcon status={c().status} />}</Show>
                      </span>
                      <span class="min-w-0 truncate" style={{ "padding-left": `${file().depth * 16 + 4}px` }}>
                        <span class={cx(file().change?.status === "removed" && "line-through decoration-[var(--plc-error)]/50")}>
                          {file().name}
                        </span>
                        <Show when={file().change?.oldPath}>
                          {(old) => <span class="ml-2 text-xs text-[var(--plc-on-subtle)]">from {old()}</span>}
                        </Show>
                      </span>
                      <span class="pr-3 text-right">
                        <Show when={file().change}>
                          {(c) => <Lines additions={c().additions} deletions={c().deletions} />}
                        </Show>
                      </span>
                      <For each={props.columns}>
                        {(name) => (
                          <span class="pr-3">
                            <MetricCell metric={name} row={file()} />
                          </span>
                        )}
                      </For>
                    </button>
                  )}
                </Match>
              </Switch>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
