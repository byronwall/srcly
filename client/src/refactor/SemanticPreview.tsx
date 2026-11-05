import { For, Show } from "solid-js";
import type { RunStep } from "./api";

export default function SemanticPreview(props: { step?: RunStep }) {
  return <>
    <Show when={props.step?.executionCheck ?? props.step?.checkpoint}>{(check) => <section class="rf-semantic" data-refactor-checkpoint>
      <h3>Checkpoint {check().name} · {check().status}</h3>
      <p>{check().seconds}s · exit {check().exitCode}</p>
      <code>{check().argv.join(" ")}</code><pre>{check().output}</pre>
      <Show when={check().truncated}><p>Output truncated at 100 KB.</p></Show>
    </section>}</Show>
    <Show when={props.step?.machine}>{(machine) => <section class="rf-semantic" data-refactor-machine>
      <h3>State machine · {machine().states.length} states · {machine().events.length} events</h3>
      <p>{machine().proof}</p>
      <table><thead><tr><th>State ↓ / Event →</th><For each={machine().events}>{(event) => <th>{event}</th>}</For></tr></thead><tbody><For each={machine().states}>{(state) => <tr data-refactor-machine-state={state}><th>{state}</th><For each={machine().events}>{(event) => <td>{machine().transitions.find((t) => t.from === state && t.event === event)?.to}</td>}</For></tr>}</For></tbody></table>
    </section>}</Show>
    <Show when={props.step?.ownership}>{(ownership) => <section class="rf-semantic" data-refactor-ownership>
      <h3>{ownership().provider} → {ownership().hook}</h3>
      <p>{ownership().scope}</p>
      <p>Root: <code>{ownership().root.file} · {ownership().root.name}</code></p>
      <div class="rf-owner-chain"><strong>{ownership().provider}</strong><span>→</span><code>{ownership().values.join(", ")}</code><span>→</span><strong>{ownership().hook}()</strong></div>
      <ul><For each={ownership().consumers}>{(consumer) => <li><code>{consumer.file} · {consumer.name}</code></li>}</For></ul>
    </section>}</Show>
  </>;
}
