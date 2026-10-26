import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// A state pair: what goes into the setter is what later reads of the getter
// see, and the initial value seeds it. `props.next` reaches the slot through
// `setName` and `name()`; `props.start` seeds it. Two signals never mix:
// `props.other` goes into `setCount`, never `name`'s slot. A store read
// through the object that holds its pair (`state.doc`) sees the store.
export function Named(props: { start: string; next: string; other: number }) {
  const [name, setName] = createSignal(props.start);
  const [count, setCount] = createSignal(0);
  setName(props.next);
  setCount(props.other);
  return (
    <p>
      <span>{name()}</span>
      <em>{count()}</em>
    </p>
  );
}

const state = (() => {
  const [doc, setDoc] = createStore({ title: "" });
  return { doc, setDoc };
})();

export function Titled(props: { title: string }) {
  state.setDoc({ title: props.title });
  return <h1>{state.doc.title}</h1>;
}
