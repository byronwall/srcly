import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// A state pair: what goes into the setter is what later reads of the getter
// see, and the initial value seeds it. `props.next` reaches the slot through
// `setName` and `name()`; `props.start` seeds it. Two signals never mix:
// `props.other` goes into `setCount`, never `name`'s slot. A store read
// through the object that holds its pair (`state.doc`) sees the store.
// The framework's model says what the factory, setter and getter calls do:
// none of them is library code assumed to pass the value on.
export function Named(props: { start: string; next: string; other: number }) { // @stop name-back untraced parameter
  const [name, setName] = createSignal(props.start); // @trace start forward props.start @visits name-back field-read * "start" @never-reaches other
  const [count, setCount] = createSignal(0); // @never-reaches start,next,name-back
  setName(props.next); // @trace next forward props.next @visits name-back field-read * "next"
  setCount(props.other); // @trace other forward props.other @never-reaches name-back
  // @outcome start,next ok @edge start,next * partial framework-state @no-edge start,next * * external-call
  return (
    <p>
      {/* @trace name-back backward name() @reaches start,next render-terminal */}
      <span>{name()}</span>
      {/* @reaches other render-terminal @never-reaches start,next */}
      <em>{count()}</em>
    </p>
  );
}

const state = (() => {
  const [doc, setDoc] = createStore({ title: "" });
  return { doc, setDoc }; // @reaches title return
})();

export function Titled(props: { title: string }) {
  state.setDoc({ title: props.title }); // @trace title forward props.title @outcome title ok @edge title * partial framework-state @no-edge title * * external-call
  return <h1>{state.doc.title}</h1>; // @reaches title render-terminal
}
