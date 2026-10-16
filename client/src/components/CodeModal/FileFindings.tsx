import { For, Show, createResource } from "solid-js";
import { cx } from "../ui/classes";
import type { FindingsTool } from "../../utils/metricsStore";

type Finding = {
  line: number;
  column: number;
  rule: string;
  message: string;
  severity: "error" | "warning";
  tool: string;
};
type FileFindingsResponse = {
  status: "ok" | "running" | "na";
  reason: string;
  tools: FindingsTool[];
  findings: Finding[];
};

async function fetchFindings(path: string): Promise<FileFindingsResponse> {
  const res = await fetch(`/api/files/findings?path=${encodeURIComponent(path)}`);
  if (!res.ok) return { status: "na", reason: `Couldn't read the checks (${res.status})`, tools: [], findings: [] };
  return (await res.json()) as FileFindingsResponse;
}

const toolName = (tools: FindingsTool[], id: string) => tools.find((t) => t.id === id)?.tool ?? id.split(":")[0];

/**
 * The lint/type-check findings for the file: the evidence behind Findings
 * and Errors, labelled with the checker that ran. Click one to go to its line.
 */
export function FileFindings(props: { path: string; onJump: (line: number) => void }) {
  const [data] = createResource(() => props.path, fetchFindings);
  return (
    <section class="mt-4 border-t border-[var(--plc-divider)] pt-2.5" aria-label="Findings">
      <h3 class="mb-1 flex items-baseline gap-2 pl-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]">
        Findings
        <Show when={data()?.status === "ok"}>
          <span class="plc-data-sm font-normal normal-case tracking-normal text-[var(--plc-on-disabled)]">
            {data()!.findings.length}
          </span>
        </Show>
      </h3>
      <Show
        when={data()}
        fallback={<p class="pl-1.5 text-[11px] text-[var(--plc-on-disabled)]">Reading checks…</p>}
      >
        {(res) => (
          <>
            <Show when={res().tools.length > 0}>
              <p
                class="mb-1 truncate pl-1.5 text-[11px] text-[var(--plc-on-subtle)]"
                title={res().tools.map((t) => (t.status === "ok" ? t.label : `${t.label}: ${t.reason}`)).join("\n")}
              >
                Checked by {res().tools.map((t) => t.label).join(", ")}
              </p>
            </Show>
            <Show
              when={res().status === "ok" && res().findings.length > 0}
              fallback={
                <p class="pl-1.5 text-[11px] text-[var(--plc-on-disabled)]">
                  {res().status === "ok"
                    ? "Clean: no findings"
                    : res().status === "running"
                      ? "Checks are still running…"
                      : `N/A: ${res().reason}`}
                </p>
              }
            >
              <ol class="flex flex-col">
                <For each={res().findings}>
                  {(f) => (
                    <li>
                      <button
                        type="button"
                        class="w-full rounded px-1.5 py-1 text-left hover:bg-[var(--plc-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]"
                        title={`${toolName(res().tools, f.tool)} ${f.rule} (${f.severity}) at line ${f.line}:${f.column}\n\n${f.message}`}
                        onClick={() => props.onJump(f.line)}
                      >
                        <div class="flex items-baseline gap-2 text-[11px] text-[var(--plc-on-subtle)]">
                          <span
                            class={cx(
                              "plc-data-sm",
                              f.severity === "error" ? "font-semibold text-[var(--plc-on-surface)]" : "text-[var(--plc-on-muted)]"
                            )}
                          >
                            {f.rule}
                          </span>
                          <span class="truncate">{toolName(res().tools, f.tool)}</span>
                          <span class="plc-data-sm ml-auto shrink-0">L{f.line}</span>
                        </div>
                        <div class="line-clamp-2 text-[12px] text-[var(--plc-on-surface)]">{f.message.split("\n")[0]}</div>
                      </button>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
