import { createStore } from "solid-js/store";

// Field paths: a value packed as one field reaches only the reads of that
// field. `props.left` reaches `copy.left` (through a spread), never
// `nested.inner.right`'s slot; `props.right` reaches `nested.inner.right`
// (through a nested pack), never `copy.left`'s. Read back, each slot enters
// the pack through its own field alone.
export function Paired(props: { left: string; right: string }) { // @stop fp-lb,fp-rb untraced parameter
  const pair = { left: props.left, right: props.right }; // @trace fp-left forward props.left @trace fp-right forward props.right @visits fp-lb field-read * "left" @never-reaches fp-lb field-read "right" @visits fp-rb field-read * "right" @never-reaches fp-rb field-read "left"
  const copy = { ...pair, extra: 1 };
  const nested = { inner: pair };
  // @outcome fp-left,fp-right ok
  return (
    <p>
      {/* @trace fp-lb backward copy.left @reaches fp-left render-terminal @never-reaches fp-right render-terminal */}
      <b>{copy.left}</b>
      {/* @trace fp-rb backward nested.inner.right @reaches fp-right render-terminal @never-reaches fp-left render-terminal */}
      <i>{nested.inner.right}</i>
    </p>
  );
}

// A store's path setter writes a field the walk cannot name: its value reaches the store's reads.
const [doc, setDoc] = createStore({ title: "", body: "" });

export function Retitled(props: { title: string }) {
  setDoc("title", props.title); // @trace fp-title forward props.title @outcome fp-title ok
  return <h2>{doc.title}</h2>; // @reaches fp-title render-terminal
}
