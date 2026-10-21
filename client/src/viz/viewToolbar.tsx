import { createSignal, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

// The view toolbar holds a slot for the active view's own tools, so a view
// adds controls to that one row instead of stacking a toolbar of its own.
const [slot, setSlot] = createSignal<HTMLElement>();

export const ViewToolSlot = () => (
  <div ref={setSlot} class="flex shrink-0 items-center empty:hidden [&>div]:contents" />
);

/** Renders its children into the view toolbar's slot. */
export function ViewTools(props: { children: JSX.Element }) {
  return <Show when={slot()}>{(el) => <Portal mount={el()}>{props.children}</Portal>}</Show>;
}
