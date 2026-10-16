import { For, Show } from "solid-js";
import { metricSections } from "../../utils/metricApplicability";
import { formatMetricValue } from "../../utils/metricsStore";

/**
 * One table of the metrics that apply to this file: grouped Size ·
 * Complexity · language, with the open scope's value beside the file's.
 */
export function MetricsTable(props: {
  path: string;
  fileNode: any;
  scopeNode: any;
  /** Open a scope of this file (the max-complexity witness). */
  onSelectNode?: (node: any) => void;
}) {
  const sections = () => metricSections(props.path, props.fileNode, props.scopeNode);
  const hasScope = () => Boolean(props.scopeNode);
  const hasFileOnlyRows = () =>
    hasScope() && sections().some((s) => s.rows.some((r) => r.scope === undefined));
  const hasNARows = () => sections().some((s) => s.rows.some((r) => r.file === null || r.scope === null));
  // "—": measured per file only. "N/A": doesn't apply here, skipped, or nothing to average.
  const cell = (id: string, value: number | null | undefined) =>
    value === undefined ? "—" : value === null ? "N/A" : formatMetricValue(id, value);
  const witness = () => props.fileNode?.metrics?.complexity_witness ?? null;
  const witnessNode = () => {
    const w = witness();
    if (!w) return null;
    const stack = [...(props.fileNode?.children ?? [])];
    while (stack.length) {
      const n = stack.pop();
      if (n?.path === w.path) return n;
      stack.push(...(n?.children ?? []));
    }
    return null;
  };

  return (
    <div class="mb-4">
      <table class="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col />
          <Show when={hasScope()}>
            <col class="w-11" />
          </Show>
          <col class="w-14" />
        </colgroup>
        <thead>
          <tr class="border-b border-[var(--plc-border)] text-[var(--plc-on-subtle)]">
            <th class="plc-label-caps pb-1.5 text-left text-[var(--plc-on-muted)]">Metrics</th>
            <Show when={hasScope()}>
              <th class="pb-1.5 text-right text-[11px] font-medium">Scope</th>
            </Show>
            <th class="pb-1.5 text-right text-[11px] font-medium">File</th>
          </tr>
        </thead>
        <For each={sections()}>
          {(section) => (
            <tbody>
              <tr>
                <th
                  colSpan={hasScope() ? 3 : 2}
                  class="pb-0.5 pt-2.5 text-left text-[11px] font-semibold text-[var(--plc-on-subtle)]"
                >
                  {section.title}
                </th>
              </tr>
              <For each={section.rows}>
                {(row) => (
                  <tr class="border-b border-[var(--plc-divider)] last:border-0">
                    <td class="truncate py-1 pr-2 text-[var(--plc-on-muted)]">
                      {row.label}
                      {/* Max complexity names the function that sets it; click to open it. */}
                      <Show when={row.id === "complexity" && witness()}>
                        {(w) => (
                          <button
                            type="button"
                            class="plc-data-sm block max-w-full truncate text-left text-[var(--plc-on-subtle)] hover:text-[var(--plc-accent)]"
                            title={`Open ${w().name}${w().start_line > 0 ? ` (line ${w().start_line})` : ""}`}
                            disabled={!witnessNode() || !props.onSelectNode}
                            onClick={() => props.onSelectNode?.(witnessNode())}
                          >
                            in <span class="underline decoration-dotted underline-offset-2">{w().name}</span>
                            {w().start_line > 0 ? ` · L${w().start_line}` : ""}
                          </button>
                        )}
                      </Show>
                    </td>
                    <Show when={hasScope()}>
                      <td
                        class={`plc-data-sm py-1 text-right ${
                          row.scope === undefined ? "text-[var(--plc-on-disabled)]" : "text-[var(--plc-on-surface)]"
                        }`}
                      >
                        {cell(row.id, row.scope)}
                      </td>
                    </Show>
                    <td
                      class={`plc-data-sm py-1 text-right ${
                        row.file === null
                          ? "text-[var(--plc-on-disabled)]"
                          : hasScope()
                            ? "text-[var(--plc-on-muted)]"
                            : "text-[var(--plc-on-surface)]"
                      }`}
                      title={row.file === null ? props.fileNode?.metrics?.na_reason || undefined : undefined}
                    >
                      {cell(row.id, row.file)}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          )}
        </For>
      </table>
      <Show when={hasFileOnlyRows()}>
        <p class="mt-2 text-[11px] text-[var(--plc-on-subtle)]">— measured per file only</p>
      </Show>
      <Show when={hasNARows()}>
        <p class="mt-1 text-[11px] text-[var(--plc-on-subtle)]">
          N/A: {props.fileNode?.metrics?.na_reason || "not measured here"}
        </p>
      </Show>
    </div>
  );
}
