import { ErrorBoundary, Show } from "solid-js";

// A `Show` without `keyed` hands its callback an accessor of the `when`
// value, so the parameter's own fields are the accessor's (a function's
// `length` is its arity), not the value's: the trace stops at the accessor.
// With `keyed` it hands the value. A `keyed` no reader can decide hands neither.
export function Counts(props: { names: string[]; flag: boolean }) {
  return (
    <section>
      {/* @trace sk-accessor forward props.names @outcome sk-accessor partial @reaches sk-accessor branch-condition */}
      <Show when={props.names}>
        {(names) => <i>{names.length}</i> /* @never-reaches sk-accessor render-terminal @stop sk-accessor disconnected value */}
      </Show>
      {/* @trace sk-called forward props.names @outcome sk-called ok @reaches sk-called branch-condition */}
      <Show when={props.names}>
        {(names) => <b>{names().length}</b> /* @reaches sk-called render-terminal */}
      </Show>
      {/* @trace sk-value forward props.names @outcome sk-value ok @reaches sk-value branch-condition */}
      <Show when={props.names} keyed>
        {(names) => <u>{names.length}</u> /* @reaches sk-value render-terminal */}
      </Show>
      {/* @trace sk-unknown forward props.names @outcome sk-unknown ok @reaches sk-unknown branch-condition */}
      <Show when={props.names} keyed={props.flag}>
        {(names) => <s>{String(names)}</s> /* @never-reaches sk-unknown render-terminal */}
      </Show>
    </section>
  );
}

// An `ErrorBoundary`'s function `fallback` takes the error it caught, which no
// prop supplies: the fallback is called, not written to the page.
export function Guarded(props: { label: string }) {
  return (
    <ErrorBoundary fallback={(error: Error) => <p>{error.message}</p>}>
      {/* @trace eb-children forward props.label @outcome eb-children ok @reaches eb-children render-terminal @never-reaches eb-children dom-terminal */}
      <p>{props.label}</p>
    </ErrorBoundary>
  );
}
