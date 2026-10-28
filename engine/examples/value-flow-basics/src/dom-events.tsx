import { createSignal } from "solid-js";

// A function written as an element's event attribute is called by the
// browser with the event, so what it reads from the event starts there. A
// component's `onPick` is a prop its own code calls: no event.
function Picker(props: { onPick: (value: string) => void }) {
  return <button onClick={() => props.onPick("a")}>pick</button>;
}

export function Search() {
  const [query, setQuery] = createSignal(""); // @visits event-typed literal
  // @trace event-typed backward query() @reaches event-typed parameter
  return <input value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />;
}

export function Picked() {
  const [picked, setPicked] = createSignal("");
  // `@reaches` is exhaustive: `value` drawn as an origin would fail this trace.
  // @trace prop-picked backward picked()
  return <p><Picker onPick={(value) => setPicked(value)} />{picked()}</p>;
}
