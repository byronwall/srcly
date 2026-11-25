// React is not installed here: the engine knows its hooks by the module their imports name.
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

// `useImperativeHandle(ref, () => ({ fill }))` in a `forwardRef` component
// sets what `handle.current` holds for the element given `ref={handle}`. A
// call `handle.current?.fill(x)` runs that `fill`; `clear` runs its own
// member, and never `fill`.
type Handle = { fill: (text: string) => void; clear: (reason: string) => void };
const Field = forwardRef<Handle, { label: string }>(function Field(props, ref) {
  const [text, setText] = useState("");
  useImperativeHandle(ref, () => ({
    fill: (next: string) => setText(next),
    clear: (reason: string) => console.log(reason), // @reaches clear-handle stdout @reaches clear-handle external-effect
  }), []);
  return <label>{props.label}<span>{text}</span></label>; // @reaches fill-handle render-terminal
});

export function Form(props: { preset: string; why: string }) {
  const handle = useRef<Handle>(null);
  return (
    <div>
      <Field ref={handle} label="name" />
      <button onClick={() => handle.current?.fill(props.preset)}>fill</button>{/* @trace fill-handle forward props.preset @outcome fill-handle ok */}
      <button onClick={() => handle.current?.clear(props.why)}>clear</button>{/* @trace clear-handle forward props.why @outcome clear-handle ok @no-path clear-handle "props.why" "text" */}
    </div>
  );
}
