import { ArrowDown, ChevronDown, ChevronRight, Columns3, Search } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import Popover from "../components/Popover";
import { Button } from "../components/ui/Button";
import { CheckboxRow } from "../components/ui/CheckboxRow";
import { PopoverPanel } from "../components/ui/PopoverPanel";
import { cx } from "../components/ui/classes";
import { DiffStat, Health, MagnitudeBar, StatusIcon } from "./bits";
import {
  compareMetricLabel,
  fileHealth,
  formatDelta,
  formatValue,
  STATUS_COLOR,
  STATUS_LABEL,
  VERDICT_TEXT,
} from "./metrics";
import {
  ALL_STATUSES,
  buildRows,
  collectFiles,
  filterFiles,
  indexFiles,
  type CompareRow,
  type FileRow,
  type FolderRow,
  type RowSort,
} from "./rows";
import type { ChangeStatus, ComparePayload } from "./types";

const ROW_H = 30;
const INDENT = 14;

function MetricCell(props: { metric: string; row: FileRow; max: number }) {
  return (
    <Switch>
      <Match when={props.row.change}>
        {(change) => (
          <Show when={change().deltas[props.metric]}>
            {(d) => {
              const isNew = () => d().before === null;
              const isGone = () => d().after === null;
              const moved = () => !isNew() && !isGone() && d().verdict !== "same";
              return (
                <span class="flex items-center justify-end gap-1">
                  <span class="plc-data-sm w-9 text-right text-[var(--plc-on-subtle)]">
                    <Show when={moved()}>{formatValue(props.metric, d().before)}</Show>
                    <Show when={isNew()}>
                      <span class="text-[var(--plc-on-disabled)]">new</span>
                    </Show>
                  </span>
                  <span class="plc-data-sm w-2.5 text-center text-[var(--plc-on-disabled)]">{moved() ? "→" : ""}</span>
                  <span
                    class={cx(
                      "plc-data-sm w-9 text-right",
                      isGone()
                        ? "text-[var(--plc-on-disabled)] line-through"
                        : moved() || isNew()
                          ? "text-[var(--plc-on-surface)]"
                          : "text-[var(--plc-on-subtle)]"
                    )}
                  >
                    {formatValue(props.metric, isGone() ? d().before : d().after)}
                  </span>
                  <span class={cx("plc-data-sm w-10 text-right font-semibold", VERDICT_TEXT[d().verdict])}>
                    {moved() ? formatDelta(props.metric, d().delta) : ""}
                  </span>
                  <MagnitudeBar delta={moved() ? d().delta : 0} max={props.max} verdict={d().verdict} width={24} />
                </span>
              );
            }}
          </Show>
        )}
      </Match>
      <Match when={props.row.metrics}>
        {(metrics) => (
          <span class="flex items-center justify-end gap-1">
            <span class="plc-data-sm w-9 text-right text-[var(--plc-on-disabled)]">
              {metrics()[props.metric] ? formatValue(props.metric, metrics()[props.metric]) : ""}
            </span>
            <span class="w-[68px]" />
          </span>
        )}
      </Match>
    </Switch>
  );
}

function StatusToggle(props: { status: ChangeStatus; count: number; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      disabled={!props.count}
      class={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors duration-150 disabled:cursor-default disabled:opacity-40",
        props.on
          ? "bg-[var(--plc-surface-muted)] text-[var(--plc-on-surface)] hover:bg-[var(--plc-border)]"
          : "text-[var(--plc-on-subtle)] hover:bg-[var(--plc-surface-hover)]"
      )}
      onClick={() => props.onToggle()}
    >
      <span style={{ opacity: props.on ? 1 : 0.45 }}>
        <StatusIcon status={props.status} />
      </span>
      {STATUS_LABEL[props.status]}
      <span class="plc-data-sm text-[var(--plc-on-subtle)]">{props.count}</span>
    </button>
  );
}

/**
 * Changed files with a per-file verdict, diffstat, and before → after metrics.
 * Folders by default; "Most regressed" or a metric header flattens and ranks.
 */
export function CompareTable(props: {
  payload: ComparePayload;
  columns: string[];
  onColumnsChange: (columns: string[]) => void;
  sort: RowSort;
  onSortChange: (sort: RowSort) => void;
  selected: string | null;
  onSelect: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const [showUnchanged, setShowUnchanged] = createSignal(false);
  const [regressionsOnly, setRegressionsOnly] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [statuses, setStatuses] = createSignal<Set<ChangeStatus>>(new Set(ALL_STATUSES));
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());

  const headFiles = createMemo(() => indexFiles(props.payload.trees?.head));
  const files = createMemo(() =>
    filterFiles(collectFiles(props.payload.files, headFiles(), showUnchanged()), {
      statuses: statuses(),
      regressionsOnly: regressionsOnly(),
      query: query(),
    })
  );
  const rows = createMemo(() =>
    buildRows(files(), { showUnchanged: showUnchanged(), sort: props.sort, collapsed: collapsed() })
  );
  const fileRows = createMemo(() => rows().filter((r): r is FileRow => r.kind === "file"));
  const visibleCount = createMemo(() => files().filter((f) => f.change).length);
  const available = createMemo(() =>
    props.payload.metrics.map((m) => m.name).filter((name) => props.payload.summary.metrics[name])
  );
  // Data bars scale per column against the largest visible change.
  const columnMax = createMemo(() => {
    const out: Record<string, number> = {};
    for (const name of props.columns)
      out[name] = Math.max(1, ...files().map((f) => Math.abs(f.change?.deltas[name]?.delta ?? 0)));
    return out;
  });
  const grid = () => `22px minmax(220px, 1fr) 72px 128px repeat(${props.columns.length}, 176px)`;
  const health = createMemo(() => new Map(props.payload.files.map((f) => [f.path, fileHealth(f.deltas)])));

  const toggleFolder = (path: string) => {
    const next = new Set(collapsed());
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsed(next);
  };
  const toggleStatus = (status: ChangeStatus) => {
    const next = new Set(statuses());
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setStatuses(next.size ? next : new Set(ALL_STATUSES));
  };

  let scroller: HTMLDivElement | undefined;
  // Keep the selected row in view as the keyboard moves it.
  createEffect(() => {
    const idx = rows().findIndex((r) => r.kind === "file" && r.path === props.selected);
    if (idx < 0 || !scroller) return;
    const top = idx * ROW_H;
    const header = 40;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + ROW_H + header > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = top + ROW_H + header - scroller.clientHeight;
  });
  const onKeyDown = (e: KeyboardEvent) => {
    const list = fileRows();
    if (!list.length) return;
    const i = list.findIndex((r) => r.path === props.selected);
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      props.onSelect(list[Math.min(list.length - 1, i + 1)].path);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      props.onSelect(list[Math.max(0, i - 1)].path);
    } else if (e.key === "Enter" && props.selected) {
      props.onOpenFile(props.selected);
    }
  };

  const statusCount = (s: ChangeStatus) => props.payload.summary.files[s];

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="plc-toolbar flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5">
        <label class="relative flex items-center">
          <Search size={13} class="pointer-events-none absolute left-2 text-[var(--plc-on-subtle)]" aria-hidden="true" />
          <input
            type="search"
            placeholder="Filter paths"
            aria-label="Filter paths"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            class="h-7 w-52 rounded-md border border-[var(--plc-border-strong)] bg-[var(--plc-surface)] pl-7 pr-2 text-[12px] outline-none transition-colors placeholder:text-[var(--plc-on-disabled)] focus:border-[var(--plc-border-focus)]"
          />
        </label>
        <div class="flex items-center gap-0.5" role="group" aria-label="Change types">
          <For each={ALL_STATUSES}>
            {(s) => (
              <StatusToggle
                status={s}
                count={statusCount(s)}
                on={statuses().has(s)}
                onToggle={() => toggleStatus(s)}
              />
            )}
          </For>
        </div>
        <CheckboxRow label="Regressions only" checked={regressionsOnly()} onChange={setRegressionsOnly} />
        <CheckboxRow label="Unchanged neighbors" checked={showUnchanged()} onChange={setShowUnchanged} />
        <div class="ml-auto flex items-center gap-1">
          <div class="flex items-center rounded-md bg-[var(--plc-surface-muted)] p-0.5" role="group" aria-label="Order">
            <For each={[["tree", "Folders"], ["regressed", "Most regressed"]] as const}>
              {([value, label]) => (
                <button
                  type="button"
                  aria-pressed={props.sort === value}
                  class={cx(
                    "h-6 rounded px-2 text-xs transition-colors duration-150",
                    props.sort === value
                      ? "bg-[var(--plc-surface)] font-semibold text-[var(--plc-on-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                      : "text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)]"
                  )}
                  onClick={() => props.onSortChange(value)}
                >
                  {label}
                </button>
              )}
            </For>
          </div>
          <Popover
            placement="bottom-end"
            trigger={(t) => (
              <Button ref={t.ref} variant="ghost" size="sm" onClick={t.onClick} class="gap-1.5">
                <Columns3 size={13} aria-hidden="true" />
                Columns
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
        </div>
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKeyDown}
        // Rows show selection themselves; the scroller's focus ring would only frame the table.
        style={{ outline: "none" }}
        class="min-h-0 flex-1 overflow-auto bg-[var(--plc-surface)]"
      >
        <div class="min-w-max">
          <div
            class="plc-label-sm sticky top-0 z-10 grid h-10 items-center border-b border-[var(--plc-border)] bg-[var(--plc-surface-subtle)] text-[var(--plc-on-muted)]"
            style={{ "grid-template-columns": grid() }}
          >
            <span />
            <span class="flex items-baseline gap-2">
              File
              <span class="font-normal text-[var(--plc-on-subtle)]">
                {visibleCount()} of {props.payload.files.length}
              </span>
            </span>
            <span class="pr-3 text-right" title="Risk metrics that got worse / better in the file">
              Verdict
            </span>
            <span class="pr-3 text-right">Lines</span>
            <For each={props.columns}>
              {(name) => {
                const total = () => props.payload.summary.metrics[name];
                return (
                  <button
                    type="button"
                    class={cx(
                      "flex h-full flex-col items-end justify-center pr-3 transition-colors duration-150 hover:bg-[var(--plc-surface-hover)] hover:text-[var(--plc-on-surface)]",
                      props.sort === name && "text-[var(--plc-accent)]"
                    )}
                    title={`Rank files by change in ${compareMetricLabel(name)}`}
                    onClick={() => props.onSortChange(props.sort === name ? "tree" : name)}
                  >
                    <span class="flex items-center gap-1">
                      {compareMetricLabel(name)}
                      <Show when={props.sort === name}>
                        <ArrowDown size={11} aria-hidden="true" />
                      </Show>
                    </span>
                    <Show when={total()}>
                      {(t) => (
                        <span class={cx("plc-data-sm font-normal", VERDICT_TEXT[t().verdict])}>
                          {t().filesWorse || t().filesBetter
                            ? `${t().filesWorse} worse · ${t().filesBetter} better`
                            : t().delta
                              ? formatDelta(name, t().delta)
                              : "unchanged"}
                        </span>
                      )}
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>

          <Show
            when={rows().length}
            fallback={<div class="px-4 py-8 text-sm text-[var(--plc-on-subtle)]">No files match these filters.</div>}
          >
            <For each={rows() as CompareRow[]}>
              {(row) => (
                <Switch>
                  <Match when={row.kind === "folder" && (row as FolderRow)}>
                    {(folder) => (
                      <button
                        type="button"
                        class="grid w-full items-center border-b border-[var(--plc-divider)] bg-[var(--plc-surface-subtle)] text-left text-[13px] transition-colors duration-150 hover:bg-[var(--plc-surface-muted)]"
                        style={{ "grid-template-columns": grid(), height: `${ROW_H}px` }}
                        onClick={() => toggleFolder(folder().path)}
                      >
                        <span />
                        <span class="flex min-w-0 items-center gap-1" style={{ "padding-left": `${folder().depth * INDENT}px` }}>
                          <Show
                            when={collapsed().has(folder().path)}
                            fallback={<ChevronDown size={13} class="shrink-0 text-[var(--plc-on-subtle)]" />}
                          >
                            <ChevronRight size={13} class="shrink-0 text-[var(--plc-on-subtle)]" />
                          </Show>
                          <span class="truncate font-medium text-[var(--plc-on-muted)]">{folder().name}/</span>
                          <span class="ml-1.5 shrink-0 text-xs text-[var(--plc-on-subtle)]">{folder().changed}</span>
                        </span>
                        <span class="pr-3 text-right">
                          <Health worse={folder().filesWorse} better={folder().filesBetter} />
                        </span>
                        <span class="pr-3 text-right">
                          <DiffStat additions={folder().additions} deletions={folder().deletions} />
                        </span>
                      </button>
                    )}
                  </Match>
                  <Match when={row.kind === "file" && (row as FileRow)}>
                    {(file) => {
                      const h = () => health().get(file().path);
                      const isSelected = () => props.selected === file().path;
                      return (
                        <button
                          type="button"
                          class={cx(
                            "grid w-full items-center border-b border-[var(--plc-divider)] text-left text-[13px] transition-colors duration-150",
                            isSelected()
                              ? "bg-[var(--plc-surface-selected)]"
                              : "bg-[var(--plc-surface)] hover:bg-[var(--plc-surface-hover)]",
                            !file().change && "text-[var(--plc-on-subtle)]"
                          )}
                          style={{ "grid-template-columns": grid(), height: `${ROW_H}px` }}
                          onClick={() => {
                            if (file().change) props.onSelect(file().path);
                          }}
                          onDblClick={() => props.onOpenFile(file().path)}
                        >
                          <span class="flex h-full items-center justify-center">
                            <Show when={file().change}>
                              {(c) => (
                                <span title={STATUS_LABEL[c().status]} style={{ color: STATUS_COLOR[c().status] }}>
                                  <StatusIcon status={c().status} />
                                </span>
                              )}
                            </Show>
                          </span>
                          <span class="flex min-w-0 items-baseline" style={{ "padding-left": `${file().depth * INDENT + 4}px` }}>
                            <span
                              class={cx(
                                "truncate",
                                file().change && "text-[var(--plc-on-surface)]",
                                file().change?.status === "removed" && "line-through decoration-[var(--plc-error)]/40"
                              )}
                            >
                              {file().name}
                            </span>
                            <Show when={file().change?.oldPath}>
                              {(old) => (
                                <span class="ml-2 shrink-0 truncate text-xs text-[var(--plc-on-subtle)]">from {old()}</span>
                              )}
                            </Show>
                          </span>
                          <span class="pr-3 text-right">
                            <Show when={h()}>{(hh) => <Health worse={hh().worse.length} better={hh().better.length} />}</Show>
                          </span>
                          <span class="pr-3 text-right">
                            <Show when={file().change}>
                              {(c) => <DiffStat additions={c().additions} deletions={c().deletions} />}
                            </Show>
                          </span>
                          <For each={props.columns}>
                            {(name) => (
                              <span class="pr-3">
                                <MetricCell metric={name} row={file()} max={columnMax()[name]} />
                              </span>
                            )}
                          </For>
                        </button>
                      );
                    }}
                  </Match>
                </Switch>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
