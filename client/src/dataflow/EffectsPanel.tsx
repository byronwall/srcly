// The effects panel (M6, T15): what one function touches, from the engine's
// functionEffects. Known facts by family and the places the analysis could
// not follow sit together; the assumptions are always in view; a witness row
// opens its line. Shown in the code viewer's rail for the selected scope and
// in the data-flow inspector for a box's function. Never a score.
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { Button } from "../components/ui/Button";
import { ensureStarted } from "./availability";
import type { FunctionEffectsResult } from "./contract.generated";
import { fetchFunctionEffects } from "./api";
import { ACTIVATION_WORDS, effectsView, FRONTIER_WORDS, HANDLING_WORDS, viaText, type EffectsView } from "./effectsModel";
import { labelFor, reasonText } from "./outcome";

export type EffectsState =
  | { phase: "loading" }
  | { phase: "done"; view: EffectsView; generation: number | null }
  | { phase: "na"; message: string };

/** The function enclosing a line of a file under a scan root. */
export interface EffectsTarget {
  root: string;
  /** Absolute path of the file. */
  file: string;
  line: number;
}

/** Fetch the effects for a target whenever it changes; the newest request wins. */
export function createEffectsQuery(target: () => EffectsTarget | null): () => EffectsState | null {
  const [state, setState] = createSignal<EffectsState | null>(null);
  let token = 0;
  createEffect(
    on(
      () => {
        const t = target();
        return t ? `${t.root}\n${t.file}\n${t.line}` : null;
      },
      (key) => {
        const mine = ++token;
        if (!key) return setState(null);
        const [root, file, line] = key.split("\n");
        setState({ phase: "loading" });
        void (async () => {
          try {
            const status = await ensureStarted(root);
            if (mine !== token) return;
            if (status.state === "na") return setState({ phase: "na", message: `Effects N/A: ${reasonText(status.reason, status.message)}` });
            const reply = await fetchFunctionEffects({ path: root, file, line: Number(line) });
            if (mine !== token) return;
            if (!reply.effects) return setState({ phase: "na", message: labelFor(reply.outcome, reply.reason, reply.message) ?? reply.outcome });
            setState({ phase: "done", view: effectsView(reply.effects), generation: reply.generation ?? null });
          } catch (error) {
            if (mine === token) setState({ phase: "na", message: String((error as Error)?.message ?? error) });
          }
        })();
      },
    ),
  );
  return state;
}

const H = "pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]";
const STATUS_TONE: Record<"proven" | "partial", string> = { proven: "var(--plc-success)", partial: "var(--plc-warning)" };

/**
 * The panel itself. `compact` drops the title row (the host already names
 * the function). `onOpen` takes a witness to its file and line.
 */
export function EffectsPanel(props: { state: EffectsState; onOpen?: (absPath: string, line: number) => void; compact?: boolean; title?: string }) {
  const view = () => (props.state.phase === "done" ? props.state.view : null);
  const [assumptionsOpen, setAssumptionsOpen] = createSignal(false);
  const witnessRow = (label: string, detail: string, witness: FunctionEffectsResult["facts"][number]["witness"], extra?: () => string | null, tone?: string) => (
    <li>
      <button
        type="button"
        class="w-full rounded px-1.5 py-1 text-left hover:bg-[var(--plc-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plc-border-focus)]"
        title={`${detail}\n${witness.file}:${witness.line}`}
        onClick={() => props.onOpen?.(witness.absPath, witness.line)}
      >
        <div class="flex items-baseline gap-2 text-[11px]">
          <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--plc-on-surface)]">{label}</span>
          <span class="plc-data-sm shrink-0 text-[var(--plc-on-disabled)]" style={tone ? { color: tone } : undefined}>
            {baseName(witness.file)}:{witness.line}
          </span>
        </div>
        <div class="line-clamp-2 text-[11px] text-[var(--plc-on-muted)]">
          <Show when={extra?.()}>{(text) => <span class="text-[10.5px] text-[var(--plc-on-subtle)]">{String(text())} · </span>}</Show>
          {detail}
        </div>
      </button>
    </li>
  );
  return (
    <section class="text-[12px]" aria-label="Function effects">
      <Show when={!props.compact}>
        <h3 class={H}>{props.title ?? "Effects"}</h3>
      </Show>
      <Show when={props.state.phase === "loading"}>
        <p class="pl-1.5 text-[11px] text-[var(--plc-on-muted)]">Reading what it touches…</p>
      </Show>
      <Show when={props.state.phase === "na" && props.state}>
        {(s) => <p class="pl-1.5 text-[11px] text-[var(--plc-on-muted)]">{(s() as { message: string }).message}</p>}
      </Show>
      <Show when={view()}>
        {(v) => (
          <>
            <p class="pl-1.5 text-[11px] text-[var(--plc-on-subtle)]">
              <span class="font-mono text-[var(--plc-on-surface)]">{v().callable.name || "(anonymous)"}</span>
              <Show when={v().callable.async}> <span class="text-[var(--plc-on-muted)]">async</span></Show>
              {" · "}
              <span class="font-semibold text-[var(--plc-on-surface)]">{v().headline}</span>
            </p>
            <For each={v().groups}>
              {(group) => (
                <>
                  <h4 class={H} title={group.hint}>
                    {group.title} <span class="font-normal normal-case tracking-normal text-[var(--plc-on-subtle)]">· {group.facts.length}</span>
                  </h4>
                  <ul>
                    <For each={group.facts}>
                      {(fact) =>
                        witnessRow(
                          fact.label,
                          fact.detail,
                          fact.witness,
                          () => [fact.status === "partial" ? "partial" : null, fact.activation === "direct" ? null : ACTIVATION_WORDS[fact.activation], viaText(fact.via)].filter(Boolean).join(" · ") || null,
                          STATUS_TONE[fact.status],
                        )
                      }
                    </For>
                  </ul>
                </>
              )}
            </For>
            <Show when={v().frontiers.length}>
              <h4 class={H} style={{ color: "var(--plc-warning)" }}>
                Could not follow <span class="font-normal normal-case tracking-normal text-[var(--plc-on-subtle)]">· {v().frontiers.length}</span>
              </h4>
              <ul>
                <For each={v().frontiers}>
                  {(frontier) => witnessRow(frontier.label, frontier.detail, frontier.witness, () => [FRONTIER_WORDS[frontier.reason] ?? frontier.reason, viaText(frontier.via)].filter(Boolean).join(" · "), "var(--plc-warning)")}
                </For>
              </ul>
            </Show>
            <Show when={v().handling.length}>
              <h4 class={H}>Promises it makes</h4>
              <ul>
                <For each={v().handling}>{(h) => witnessRow(h.callee, `The promise is ${HANDLING_WORDS[h.handling]}.`, h.witness, () => HANDLING_WORDS[h.handling])}</For>
              </ul>
            </Show>
            <div class="mt-1 pl-1.5 text-[10.5px] text-[var(--plc-on-disabled)]">
              <Button variant="ghost" size="sm" class="-ml-1.5 px-1.5" onClick={() => setAssumptionsOpen((open) => !open)} aria-expanded={assumptionsOpen()}>
                {assumptionsOpen() ? "Hide" : "Show"} the {v().assumptions.length} assumptions
              </Button>
              <Show when={assumptionsOpen()}>
                <ul class="list-disc space-y-0.5 pl-4 text-[var(--plc-on-muted)]">
                  <For each={v().assumptions}>{(a) => <li>{a}</li>}</For>
                </ul>
              </Show>
              <div>
                {v().counts.callables} function{v().counts.callables === 1 ? "" : "s"} followed
                {props.state.phase === "done" && props.state.generation ? ` · generation ${props.state.generation}` : ""}
              </div>
            </div>
          </>
        )}
      </Show>
    </section>
  );
}

function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}
