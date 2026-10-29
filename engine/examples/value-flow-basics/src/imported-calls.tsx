import { cx } from "class-kit";
import { onCleanup } from "solid-js";

// `cx` is imported from a module with no source and no model row. That its
// value derives from its arguments, and that the call is an external effect
// at all, are assumed, never proven: knowing only that the call leaves the
// program says nothing about what it does.
export function Tag(props: { tone: string }) {
  const className = cx("tag", props.tone); // @trace classed forward props.tone @outcome classed partial @reaches classed external-effect @edge classed argument partial external-call @edge classed effect-input * external-call @no-edge classed * * host-api
  return <span class={className} />; // @reaches classed dom-terminal
}

// `console.log` is a host API the engine models: its argument is written to
// stdout, and its effect keeps the modelled `host-api` proof.
export function report(message: string) {
  console.log(message); // @trace logged-out forward message @reaches logged-out stdout @reaches logged-out external-effect @edge logged-out effect-input * host-api @no-edge logged-out effect-input * external-call
}

// `onCleanup` is a Solid framework call: what Solid does with the function is
// its model, never an external effect, so no edge here is a guess.
export function useRegistration(key: string) {
  onCleanup(leave(key)); // @stop leave untraced * "onCleanup(leave(key))"
}

function leave(key: string) { // @trace leave forward symbol leave @outcome leave partial @no-edge leave effect-input * external-call @no-edge leave * * host-api
  return () => key; // @reaches leave return
}
