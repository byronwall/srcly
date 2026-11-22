import { Match, Show, Switch } from "solid-js";
import type { AnchorQuestion, TraceWitness, routeQuestion } from "./traceQuestionModel";

const DIRECTIONS = { backward: "Where it comes from", forward: "Where it goes", both: "Where it comes from and goes" };

function Witness(props: { witness: TraceWitness; onOpen: (path: string, line: number) => void }) {
  return (
    <button
      type="button"
      data-trace-witness
      title={`Source span ends at ${props.witness.span.endLine}:${props.witness.span.endColumn}`}
      class="mt-1 max-w-full break-all text-left text-[var(--plc-accent)] underline"
      onClick={() => props.onOpen(props.witness.absPath, props.witness.span.startLine)}
    >
      Open line · {props.witness.file}:{props.witness.span.startLine}:{props.witness.span.startColumn}
    </button>
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
              <p class="mt-1 font-semibold" data-trace-direct-read>Direct field read</p>
              <Witness witness={read()} onOpen={props.onOpen} />
              <Show when={a().direction !== "forward"}>
                <p class="mt-1 text-[var(--plc-on-muted)]">The proof here identifies this read, not the field’s earlier producer.</p>
                <Show when={a().context}>{(context) => (
                  <details class="mt-1">
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
