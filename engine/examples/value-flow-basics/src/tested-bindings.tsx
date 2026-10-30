// A binding every read of which decides a branch ends at its binding: the
// value is consumed by the tests, through `!`, `&&` or an accessor's call. A
// binding that is also read as a value carries on to that read.
import { Show } from "solid-js";

export function chase(distance: number, limit: number) { // @trace forgotten forward symbol distance @outcome forgotten ok
  const forgotten = distance > limit; // @reaches forgotten alias "forgotten"
  if (limit > 0) {
    if (forgotten) return "idle";
    else if (distance > 1) return "near"; // @reaches forgotten derived
  }
  return "chase";
}

export function Overlay(props: { error: string | null }) {
  const isVisible = () => props.error !== null; // @trace visible forward props.error @outcome visible ok
  return <Show when={isVisible()}><p>error</p></Show>; // @reaches visible branch-condition
}

export function label(ready: boolean) { // @trace ready-value forward symbol ready @outcome ready-value ok
  const shown = ready;
  if (shown) return "yes";
  return String(shown); // @reaches ready-value return
}
