import { createMemo, createSignal } from "solid-js";
import { useLabel } from "./router-kit";

// An accessor handed down as a prop: `props.count()` reads what the accessor
// yields. The call is modelled when every occurrence of the component binds
// the prop to an accessor (a signal's getter, a memo, or another component's
// accessor prop handed on).
function Badge(props: { count: () => number }) {
  return <b>{props.count()}</b>; // @reaches sap-signal render-terminal
}

function Relay(props: { count: () => number }) {
  return <Badge count={props.count} />; // @reaches sap-signal component-occurrence
}

export function Host(props: { start: number; other: number }) {
  const [count, setCount] = createSignal(0);
  const [unused, setUnused] = createSignal(0);
  const bump = () => setCount(props.start); // @trace sap-signal forward props.start @outcome sap-signal ok @path sap-signal "props.start" "props.count()" @no-edge sap-signal * * external-call
  // A signal no component is handed does not reach the badge.
  const skip = () => setUnused(props.other); // @trace sap-other forward props.other @no-path sap-other "props.other" "props.count()"
  return <div onClick={bump} onKeyDown={skip}><Relay count={count} />{unused()}</div>; // @reaches sap-other render-terminal @reaches sap-signal component-occurrence
}

function Total(props: { sum: () => number }) {
  return <b>{props.sum()}</b>; // @reaches sap-memo render-terminal
}

export function Sum(props: { n: number }) {
  const sum = createMemo(() => props.n * 2); // @trace sap-memo forward props.n @outcome sap-memo ok @path sap-memo "props.n" "props.sum()"
  return <Total sum={sum} />; // @reaches sap-memo component-occurrence
}

// One occurrence binds a function no row names, so the prop is not proven to
// be an accessor: the call stays assumed.
function Label(props: { text: () => string }) {
  return <i>{props.text()}</i>; // @reaches sap-mixed render-terminal
}

export function Mixed(props: { name: string }) {
  const [text, setText] = createSignal("");
  const label = useLabel();
  const set = () => setText(props.name); // @trace sap-mixed forward props.name @outcome sap-mixed assumed @edge sap-mixed * * external-call
  return <p onClick={set}><Label text={text} /><Label text={label} /></p>; // @reaches sap-mixed component-occurrence
}
