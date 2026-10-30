// A component's props reach the fields read from a view of them: a copy,
// or what `mergeProps` and both halves of `splitProps` pass through. A prop
// the caller binds lands where the view's field of the same name is read.
import { mergeProps, splitProps } from "solid-js";

function Button(props: { label?: string; kind?: string }) {
  const merged = mergeProps({ kind: "primary" }, props);
  const [local, rest] = splitProps(merged, ["label"]);
  return <button class={rest.kind}>{local.label}</button>; // @reaches split-label render-terminal @never-reaches split-label dom-terminal
}

export function Toolbar(props: { label: string }) {
  return <Button label={props.label} />; // @trace split-label forward props.label @outcome split-label ok @reaches split-label component-occurrence
}
