import { For, Show } from "solid-js";
import { metricSections } from "../../utils/metricApplicability";
import { HOTSPOT_METRICS, formatMetricValue } from "../../utils/metricsStore";
import { cx } from "../ui/classes";

/**
 * One table of the metrics that apply to this file: grouped Size ·
 * Complexity · language, with the open scope's value beside the file's.
 * Rows whose lines can be located toggle an overlay on the code.
 */
export function MetricsTable(props: {
  path: string;
  fileNode: any;
  scopeNode: any;
  scopeName: () => string | null;
  canLocate: (metricId: string) => boolean;
  activeMetric: () => string | null;
  onToggleMetric: (metricId: string) => void;
}) {
  const sections = () => metricSections(props.path, props.fileNode, props.scopeNode);
  const hasScope = () => Boolean(props.scopeNode);
  const hasFileOnlyRows = () =>
    hasScope() && sections().some((s) => s.rows.some((r) => r.scope === undefined));
  const cell = (id: string, value: number | undefined) =>
    value === undefined ? "—" : formatMetricValue(id, value);
  const anyLocatable = () => sections().some((s) => s.rows.some((r) => props.canLocate(r.id)));

  return (
    <div>
      {/* One fixed line, so picking a metric never shifts the table. */}
      <p class="mb-2 h-4 truncate text-[11px] text-[var(--plc-on-subtle)]">
        <Show
          when={props.activeMetric()}
          fallback={anyLocatable() ? "Click a metric to mark its lines in the code" : ""}
        >
          Marked in the code · Esc clears
        </Show>
      </p>
      <table class="w-full table-fixed border-collapse text-[12px]">
        <colgroup>
          <col />
          <Show when={hasScope()}>
            <col class="w-14" />
          </Show>
          <col class="w-14" />
        </colgroup>
        <thead>
          <tr class="border-b border-[var(--plc-border)] text-[11px] text-[var(--plc-on-subtle)]">
            <th class="pb-1 pl-1.5 text-left font-medium">Metric</th>
            <Show when={hasScope()}>
              <th class="truncate pb-1 pr-1.5 text-right font-medium" title={props.scopeName() ?? undefined}>
                Scope
              </th>
            </Show>
            <th class="pb-1 pr-1.5 text-right font-medium">File</th>
          </tr>
        </thead>
        <For each={sections()}>
          {(section) => (
            <tbody>
              <tr>
                <th
                  colSpan={hasScope() ? 3 : 2}
                  class="pb-0.5 pl-1.5 pt-2.5 text-left text-[11px] font-semibold text-[var(--plc-on-subtle)]"
                >
                  {section.title}
                </th>
              </tr>
              <For each={section.rows}>
                {(row) => {
                  const locatable = () => props.canLocate(row.id);
                  const active = () => props.activeMetric() === row.id;
                  return (
                    <tr
                      role={locatable() ? "button" : undefined}
                      tabIndex={locatable() ? 0 : undefined}
                      aria-pressed={locatable() ? active() : undefined}
                      title={locatable() ? (active() ? "Clear the overlay" : "Mark these lines in the code") : undefined}
                      onClick={() => locatable() && props.onToggleMetric(row.id)}
                      onKeyDown={(e) => {
                        if (locatable() && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          props.onToggleMetric(row.id);
                        }
                      }}
                      class={cx(
                        "transition-colors duration-150 focus:outline-none focus-visible:bg-[var(--plc-surface-hover)]",
                        locatable() && "cursor-pointer",
                        active()
                          ? HOTSPOT_METRICS.find((m) => m.id === row.id)?.invert
                            ? "bg-[var(--plc-surface-selected)]"
                            : "bg-[var(--plc-warning-subtle)]"
                          : locatable() && "hover:bg-[var(--plc-surface-muted)]"
                      )}
                    >
                      <td
                        class={cx(
                          "truncate rounded-l py-[5px] pl-1.5 pr-2",
                          active()
                            ? "font-semibold text-[var(--plc-on-surface)]"
                            : locatable()
                              ? "text-[var(--plc-on-surface)]"
                              : "text-[var(--plc-on-subtle)]"
                        )}
                      >
                        {row.label}
                      </td>
                      <Show when={hasScope()}>
                        <td
                          class={`plc-data-sm py-[5px] pr-1.5 text-right ${
                            row.scope === undefined ? "text-[var(--plc-on-disabled)]" : "text-[var(--plc-on-surface)]"
                          }`}
                        >
                          {cell(row.id, row.scope)}
                        </td>
                      </Show>
                      <td
                        class={`plc-data-sm rounded-r py-[5px] pr-1.5 text-right ${
                          hasScope() ? "text-[var(--plc-on-muted)]" : "text-[var(--plc-on-surface)]"
                        }`}
                      >
                        {cell(row.id, row.file)}
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          )}
        </For>
      </table>
      <Show when={hasFileOnlyRows()}>
        <p class="mt-2 pl-1.5 text-[11px] text-[var(--plc-on-subtle)]">— measured per file only</p>
      </Show>
    </div>
  );
}
