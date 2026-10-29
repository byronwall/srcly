import { createMemo, createSignal } from "solid-js";

// A component anchored by name walks its own state too: each value its body
// makes from a call is where its data starts, so a page with no props (a
// route) still shows how its data flows to what it renders.
export function Counter() { // @trace own-state forward symbol Counter
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);
  return <button onClick={() => setCount(count() + 1)}>{doubled()}</button>; // @reaches own-state render-terminal
}
