import { For, Match, Show, Switch } from "solid-js";
import type { AnchorQuestion, FieldProducerAnswer, HandoffKind, NamedWitness, TraceWitness, routeQuestion } from "./traceQuestionModel";

const DIRECTIONS = { backward: "Where it comes from", forward: "Where it goes", both: "Where it comes from and goes" };

function Witness(props: { witness: TraceWitness; onOpen: (path: string, line: number) => void; label?: string }) {
  return (
    <button
      type="button"
      data-trace-witness
      title={`Source span ends at ${props.witness.span.endLine}:${props.witness.span.endColumn}`}
      class="mt-1 max-w-full break-all text-left text-[var(--plc-accent)] underline"
      onClick={() => props.onOpen(props.witness.absPath, props.witness.span.startLine)}
    >
      {props.label ?? "Open line"} · {props.witness.file}:{props.witness.span.startLine}:{props.witness.span.startColumn}
    </button>
  );
}

/** A named source expression and the button that opens it. */
function Named(props: { witness: NamedWitness; onOpen: (path: string, line: number) => void; label?: string }) {
  return (
    <div>
      <code class="break-all">{props.witness.text}</code>
      <Witness witness={props.witness} onOpen={props.onOpen} label={props.label ?? "Open"} />
    </div>
  );
}

const HANDOFF: Record<HandoffKind, (field: string) => string> = {
  initialization: (field) => `Initialization: the store's first value holds ${field}. Later writes may replace it.`,
  return: (field) => `Returned: the object a call returns holds ${field}, and this read takes it.`,
  field: (field) => `Field: the object built here holds ${field}, and this read takes it.`,
};

function Producer(props: { answer: FieldProducerAnswer; onOpen: (path: string, line: number) => void }) {
  return (
    <>
      <p class="mt-2 font-semibold">{props.answer.handoff.kind === "initialization" ? "Proven producer · initial value" : "Proven producer"}</p>
      <div data-trace-producer>
        <Named witness={props.answer.producer} onOpen={props.onOpen} />
      </div>
      <p class="mt-2 font-semibold">Proven handoff</p>
      <div data-trace-handoff={props.answer.handoff.kind}>
        <p class="text-[var(--plc-on-muted)]">{HANDOFF[props.answer.handoff.kind](props.answer.field)}</p>
        <Witness witness={props.answer.handoff.object} onOpen={props.onOpen} label="Open handoff" />
      </div>
      <Show when={props.answer.laterWrites.length}>
        <p class="mt-2 font-semibold">Later writes to {props.answer.field}</p>
        <p class="text-[var(--plc-on-muted)]">Code that can replace the first value. Not observed updates.</p>
        <For each={props.answer.laterWrites}>
          {(write) => <div data-trace-later-write><Named witness={write} onOpen={props.onOpen} /></div>}
        </For>
      </Show>
    </>
  );
}

export function TraceQuestion(props: {
  anchor: AnchorQuestion | null;
  route: ReturnType<typeof routeQuestion> | null;
  onOpen: (path: string, line: number) => void;
}) {
  return (
    <Switch>
      <Match when={props.anchor}>{(a) => (
        <section aria-label="Trace question" class="border-b border-[var(--plc-border)] px-1 py-2">
          <h4 class="text-[11px] font-semibold text-[var(--plc-on-muted)]">Source expression · {DIRECTIONS[a().direction]}</h4>
          <p><code class="break-all">{a().expression}</code></p>
          <Show when={a().fieldRead}>{(read) => (
            <>
              <p class="mt-1 font-semibold" data-trace-direct-read>{a().producer ? "Read" : "Direct field read"}</p>
              <Witness witness={read()} onOpen={props.onOpen} label="Open read" />
              <Show when={a().direction !== "forward"}>
                <Switch fallback={<p class="mt-1 text-[var(--plc-on-muted)]" data-trace-no-producer>The proof here identifies this read, not the field’s earlier producer.</p>}>
                  <Match when={a().producer}>{(answer) => <Producer answer={answer()} onOpen={props.onOpen} />}</Match>
                  <Match when={a().alternatives.length}>
                    <p class="mt-2 font-semibold" data-trace-ambiguous>No single producer</p>
                    <p class="text-[var(--plc-on-muted)]">Each of these fills the field on one path. Another path can fill it too, so the source does not prove which value this read sees.</p>
                    <For each={a().alternatives}>{(item) => <Named witness={item} onOpen={props.onOpen} />}</For>
                  </Match>
                </Switch>
                <Show when={a().callers.length}>
                  <div data-trace-callers={a().callers.length}>
                    <p class="mt-2 font-semibold">Shared component · {a().callers.length} call sites</p>
                    <p class="text-[var(--plc-on-muted)]">Each call site passes its own value. Open one to follow it further.</p>
                    <For each={a().callers}>{(site) => <Named witness={site} onOpen={props.onOpen} label="Open call site" />}</For>
                  </div>
                </Show>
                <Show when={a().boundary}>{(call) => (
                  <div data-trace-boundary>
                    <p class="mt-2 font-semibold">Stops at a call</p>
                    <p class="text-[var(--plc-on-muted)]">No source in the analysis returns a value into this call, so the field has no producer to show.</p>
                    <Named witness={call()} onOpen={props.onOpen} />
                  </div>
                )}</Show>
                <Show when={a().producer}>
                  <p class="mt-2 text-[10.5px] text-[var(--plc-on-disabled)]" data-trace-scope>Scope: static source relationship. No runtime value history.</p>
                </Show>
                <Show when={a().context}>{(context) => (
                  <details class="mt-1" data-trace-context>
                    <summary class="cursor-pointer">Context · whole value passed into the component</summary>
                    <Witness witness={context()} onOpen={props.onOpen} />
                  </details>
                )}</Show>
              </Show>
            </>
          )}</Show>
          <Show when={a().stop}>{(reason) => <p class="mt-1 text-[var(--plc-on-muted)]">Limit: {reason().replaceAll("-", " ")}</p>}</Show>
        </section>
      )}</Match>
      <Match when={props.route}>{(r) => (
        <section aria-label="Trace question" class="border-b border-[var(--plc-border)] px-1 py-2">
          <h4 class="text-[11px] font-semibold text-[var(--plc-on-muted)]">Selected route origin · {r().route}</h4>
          <p class="break-all">{r().origin ?? "Choose an origin to see its reach on this route."}</p>
          <Switch>
            <Match when={r().tracing}><p>Tracing route evidence…</p></Match>
            <Match when={r().lineage?.status === "partial"}><p>Partial field evidence for this origin.</p></Match>
            <Match when={r().lineage?.status === "unavailable"}><p>Field evidence unavailable: {r().lineage?.unavailableReason}</p></Match>
          </Switch>
        </section>
      )}</Match>
    </Switch>
  );
}
