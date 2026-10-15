import { For, Show } from "solid-js";
import { metricSections } from "../../utils/metricApplicability";
import { formatMetricValue } from "../../utils/metricsStore";

/**
 * One table of the metrics that apply to this file: grouped Size ·
 * Complexity · language, with the open scope's value beside the file's.
 */
export function MetricsTable(props: { path: string; fileNode: any; scopeNode: any }) {
  const sections = () => metricSections(props.path, props.fileNode, props.scopeNode);
  const hasScope = () => Boolean(props.scopeNode);
  const hasFileOnlyRows = () =>
    hasScope() && sections().some((s) => s.rows.some((r) => r.scope === undefined));
  const cell = (id: string, value: number | undefined) =>
    value === undefined ? "—" : formatMetricValue(id, value);

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
                    <td class="truncate py-1 pr-2 text-[var(--plc-on-muted)]">{row.label}</td>
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
                        hasScope() ? "text-[var(--plc-on-muted)]" : "text-[var(--plc-on-surface)]"
                      }`}
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
    </div>
  );
}
