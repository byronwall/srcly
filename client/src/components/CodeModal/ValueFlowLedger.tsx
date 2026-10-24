import { For, Match, Show, Switch } from "solid-js";
import { X } from "lucide-solid";
import { IconButton } from "../ui/IconButton";
import type { ValueFlowResult } from "../../dataflow/contract.generated";
import { labelFor, toneFor } from "../../dataflow/outcome";
import type { LedgerState } from "../../investigation/valueFlowInspector";

type Row = ValueFlowResult["rows"][number];

const KIND_LABEL: Record<Row["kind"], string> = {
  input: "Input",
  transfer: "Transfer",
  fallback: "Fallback",
  branch: "Branch",
  transform: "Transform",
  terminal: "Terminal",
  boundary: "Boundary",
};

const baseName = (file: string) => file.slice(file.lastIndexOf("/") + 1);

/**
 * The value-flow ledger for one selected expression, in operation order:
 * what it is made of, then where it goes. Every row names its evidence
 * status; the query outcome is named above the rows. Click a row in this
 * file to go to its line.
 */
export function ValueFlowLedger(props: {
  state: LedgerState;
  /** Absolute path of the file in the viewer: rows here jump, rows elsewhere name their file. */
  filePath: string | null;
  marked: boolean;
  onToggleMarks: () => void;
  onJump: (line: number) => void;
  onClose: () => void;
}) {
  const inThisFile = (row: Row) => row.absPath === props.filePath;
  return (
    <section class="mb-4 border-b border-[var(--plc-divider)] pb-2.5" aria-label="Value flow">
      <h3 class="mb-1 flex items-center gap-2 pl-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]">
        Value flow
        <Show when={props.state.phase === "done"}>
          <button
            type="button"
            class="rounded px-1 text-[10.5px] font-normal normal-case tracking-normal"
            classList={{ "bg-[var(--plc-accent-subtle)] text-[var(--plc-accent)]": props.marked, "text-[var(--plc-on-subtle)] hover:text-[var(--plc-on-surface)]": !props.marked }}
            title="Mark the ledger's lines in the code"
            onClick={props.onToggleMarks}
          >
            {props.marked ? "Marked" : "Mark lines"}
          </button>
        </Show>
        <IconButton label="Close the value-flow ledger" size="xs" class="ml-auto" onClick={props.onClose}>
          <X size={12} />
        </IconButton>
      </h3>
      <Switch>
        <Match when={props.state.phase === "loading" && props.state}>
          {(s) => <p class="pl-1.5 text-[11px] text-[var(--plc-on-disabled)]">Tracing <code class="font-mono">{(s() as { text: string }).text}</code>…</p>}
        </Match>
        <Match when={props.state.phase === "na" && props.state}>
          {(s) => <p class="pl-1.5 text-[11px] text-[var(--plc-on-muted)]">{(s() as { message: string }).message}</p>}
        </Match>
        <Match when={props.state.phase === "done" && (props.state as { ledger: ValueFlowResult }).ledger}>
          {(ledger) => (
            <>
              <p class="mb-1 pl-1.5 text-[11px] text-[var(--plc-on-subtle)]">
                <code class="font-mono text-[var(--plc-on-surface)]">{ledger().selection.text}</code>
                {" · "}
                <span class="font-semibold text-[var(--plc-on-surface)]">{outcomeText(ledger())}</span>
              </p>
              <ol class="flex flex-col">
                <For each={ledger().rows}>
                  {(row, i) => (
                    <li>
                      <button
                        type="button"
                        class="w-full rounded px-1.5 py-1 text-left hover:bg-[var(--plc-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)] disabled:cursor-default disabled:hover:bg-transparent"
                        disabled={!inThisFile(row)}
                        title={[row.note, row.typeText ? `Type: ${row.typeText}` : null, row.reason ? `Stops: ${row.reason}` : null, ...row.proof.map((p) => p.detail)].filter(Boolean).join("\n")}
                        onClick={() => props.onJump(row.line)}
                      >
                        <div class="flex items-baseline gap-2 text-[11px] text-[var(--plc-on-subtle)]">
                          <span class="plc-data-sm w-4 shrink-0 text-right text-[var(--plc-on-disabled)]">{i() + 1}</span>
                          <span class="font-medium text-[var(--plc-on-muted)]">{KIND_LABEL[row.kind]}</span>
                          <span
                            class="rounded px-1 text-[10px] leading-4"
                            classList={{ "bg-[var(--plc-surface-muted)]": true }}
                            style={{ color: toneFor(row.status) }}
                          >
                            {row.status}
                          </span>
                          <span class="plc-data-sm ml-auto shrink-0">{inThisFile(row) ? `L${row.line}` : `${baseName(row.file)}:${row.line}`}</span>
                        </div>
                        <div class="truncate pl-6 font-mono text-[11.5px] text-[var(--plc-on-surface)]">{row.label}</div>
                        <Show when={row.note}>
                          <div class="line-clamp-2 pl-6 text-[11px] text-[var(--plc-on-muted)]">{row.note}</div>
                        </Show>
                      </button>
                    </li>
                  )}
                </For>
              </ol>
              <p class="mt-1 pl-1.5 text-[10.5px] text-[var(--plc-on-disabled)]">
                Generation {ledger().generation} · {ledger().coverage.elements} elements · {ledger().coverage.relations} relations
              </p>
            </>
          )}
        </Match>
      </Switch>
    </section>
  );
}

function outcomeText(ledger: ValueFlowResult): string {
  const terminals = ledger.terminals.length;
  const boundaries = ledger.frontiers.length;
  if (ledger.outcome === "ok") return `Reaches ${terminals} terminal${terminals === 1 ? "" : "s"}`;
  if (ledger.outcome === "partial") return `Partial: stops at ${boundaries} boundar${boundaries === 1 ? "y" : "ies"}${terminals ? `, reaches ${terminals} terminal${terminals === 1 ? "" : "s"}` : ""}`;
  return labelFor(ledger.outcome, null, ledger.reason) ?? ledger.outcome;
}
