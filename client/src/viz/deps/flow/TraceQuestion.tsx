import { For, Match, Show, Switch } from "solid-js";
import type { AnchorQuestion, HandoffKind, NamedWitness, ProducerCandidate, StopReason, TraceWitness, routeQuestion } from "./traceQuestionModel";


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
      <code class="block whitespace-pre-wrap break-all">{props.witness.text}</code>
      <Witness witness={props.witness} onOpen={props.onOpen} label={props.label ?? "Open"} />
    </div>
  );
}

const HANDOFF: Record<HandoffKind, (field: string) => string> = {
  initialization: (field) => `Initialization: the store's first value holds ${field}. Later writes may replace it.`,
  return: (field) => `Returned: the object a call returns holds ${field}, and this read takes it.`,
  field: (field) => `Field: the object built here holds ${field}, and this read takes it.`,
  mixed: (field) => `Several handoffs carry this ${field} to the read: returned on one path, a store's first value or an object's field on another.`,
};

/** One candidate: its expression, the handoff that carries it to the read, and why it may not be what the read sees. */
function Candidate(props: { candidate: ProducerCandidate; field: string; onOpen: (path: string, line: number) => void }) {
  return (
    <div class="mt-2 border-t border-[var(--plc-divider)] pt-2 first-of-type:border-t-0 first-of-type:pt-0" data-trace-producer data-trace-caveats={props.candidate.caveats.length}>
      <Named witness={props.candidate.producer} onOpen={props.onOpen} />
      <div class="mt-1" data-trace-handoff={props.candidate.handoff.kind}>
        <p class="text-[var(--plc-on-muted)]">{HANDOFF[props.candidate.handoff.kind](props.field)}</p>
        <Witness witness={props.candidate.handoff.object} onOpen={props.onOpen} label="Open handoff" />
      </div>
      <Show when={props.candidate.caveats.length}>
        <ul class="mt-1 list-disc pl-4 text-[var(--plc-on-muted)]">
          {/* One line per reason, with a link to each place it applies. */}
          <For each={[...new Set(props.candidate.caveats.map((caveat) => caveat.reason))]}>
            {(reason) => (
              <li data-trace-caveat={reason}>
                May not hold: {STOP_WORDS[reason]}
                <For each={props.candidate.caveats.filter((caveat) => caveat.reason === reason)}>
                  {(caveat) => <div><Witness witness={caveat} onOpen={props.onOpen} /></div>}
                </For>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function Producers(props: { question: AnchorQuestion; onOpen: (path: string, line: number) => void }) {
  const field = () => props.question.field ?? "the field";
  return (
    <>
      <p class="mt-2 font-semibold" data-trace-producers={props.question.only ? "only" : props.question.candidates.length}>
        {props.question.only
          ? `Producer · the only one found${props.question.candidates[0].handoff.kind === "initialization" ? " · initial value" : ""}`
          : props.question.candidates.length === 1 ? "Producer candidate" : `Producer candidates · ${props.question.candidates.length}`}
      </p>
      <Show when={!props.question.only}>
        <p class="text-[var(--plc-on-muted)]">
          {props.question.candidates.length === 1
            ? `This can fill ${field()}, but the static source does not settle that the read sees it.`
            : `Each can fill ${field()}. The static source does not settle which value this read sees.`}
        </p>
      </Show>
      <For each={props.question.candidates}>{(candidate) => <Candidate candidate={candidate} field={field()} onOpen={props.onOpen} />}</For>
      <Show when={props.question.laterWrites.length}>
        <p class="mt-2 font-semibold">Later writes to {field()}</p>
        <p class="text-[var(--plc-on-muted)]">Code that can replace the first value. Not observed updates.</p>
        <For each={props.question.laterWrites}>
          {(write) => <div data-trace-later-write><Named witness={write} onOpen={props.onOpen} /></div>}
        </For>
      </Show>
    </>
  );
}

const STOP_WORDS: Record<StopReason, string> = {
  receiver: "This is a method: another object's method of the same name may run for this call.",
  "no-return": "No source in the analysis returns a value into this call, so the field's value past it is not known.",
  "dead-end": "The field's path ends here: its value comes from outside what the analysis can follow.",
  missing: "This object has no own field with this name, so on this path the value comes from its prototype or is undefined.",
  callback: "This value is returned to a library call it was handed to (a callback, a store creator), which decides what the caller gets.",
  fallthrough: "This function can also end without this return (a branch with no return, or a generator), so the call may yield something else.",
  mutable: "The code changes this object after building it, so the value written here may not be what the read sees.",
  widened: "Here the value is reshaped (a library call, an array), so the field is no longer one the path can name.",
  "unnamed-member": "A spread or computed key here may hold the field, so the named one is not certain.",
  operand: "Here the value is an operator's or a condition's result, not one of its inputs.",
  callers: "More than one call reaches this function, so which call's value it holds is not known.",
  binding: "A destructured or defaulted name holds this value; the analysis does not name which part, or whether the default applies.",
  accessor: "This reads the getter function itself, not the value it returns.",
  factory: "The state starts from its factory's call; the analysis does not name an initial value for this field there.",
  write: "A write lands on this field directly, so its first value may not be what the read sees.",
  budget: "The walk ran out of work before every path ended.",
};

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
              <p class="mt-1 font-semibold" data-trace-direct-read>{a().candidates.length ? "Read" : "Direct field read"}</p>
              <Witness witness={read()} onOpen={props.onOpen} label="Open read" />
              <Show when={a().direction !== "forward"}>
                <Show when={a().candidates.length} fallback={<p class="mt-1 text-[var(--plc-on-muted)]" data-trace-no-producer>The proof here identifies this read, not the field’s earlier producer.</p>}>
                  <Producers question={a()} onOpen={props.onOpen} />
                </Show>
                <Show when={a().callers.length}>
                  <div data-trace-callers={a().callers.length}>
                    <p class="mt-2 font-semibold">Shared component · {a().callers.length} call sites</p>
                    <p class="text-[var(--plc-on-muted)]">Each call site passes its own value. Open one to follow it further.</p>
                    <For each={a().callers}>{(site) => <Named witness={site} onOpen={props.onOpen} label="Open call site" />}</For>
                  </div>
                </Show>
                <Show when={a().stops.length}>
                  <p class="mt-2 font-semibold">{a().candidates.length ? "Other paths end without a producer" : a().stops[0].reason === "no-return" ? "Stops at a call" : "Stops here"}</p>
                  <For each={a().stops.slice(0, 3)}>
                    {(stop) => (
                      <div data-trace-boundary={stop.reason}>
                        <p class="text-[var(--plc-on-muted)]">{STOP_WORDS[stop.reason]}</p>
                        <Named witness={stop} onOpen={props.onOpen} />
                      </div>
                    )}
                  </For>
                </Show>
                <Show when={a().candidates.length}>
                  <p class="mt-2 text-[10.5px] text-[var(--plc-on-disabled)]" data-trace-scope>Scope: static source relationship. No runtime value history. Writes through another name for the object are not tracked.</p>
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
