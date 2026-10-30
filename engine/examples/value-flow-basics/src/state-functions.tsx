// A function handed to a state pair where a value goes stands for what it
// returns: a setter's updater and React's lazy initial value. Its returns
// become the state, and an updater's parameter is the current state. Solid's
// `createSignal` does not call a function initial value: the signal holds
// the function itself.
import { useState } from "react";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

export function Stepper(props: { step: number }) {
  const [count, setCount] = useState(0);
  const bump = () => setCount((c) => c + props.step); // @trace react-updater forward props.step @outcome react-updater ok
  return <button onClick={bump}>{count}</button>; // @reaches react-updater render-terminal
}

export function Doubled(props: { seed: number }) {
  const [value] = useState(() => props.seed * 2); // @trace lazy-init forward props.seed @outcome lazy-init ok
  return <i>{value}</i>; // @reaches lazy-init render-terminal
}

export function SolidStepper(props: { step: number }) {
  const [count, setCount] = createSignal(0);
  const bump = () => setCount((c) => c + props.step); // @trace solid-updater forward props.step @outcome solid-updater ok
  return <button onClick={bump}>{count()}</button>; // @reaches solid-updater render-terminal
}

export function Todos(props: { title: string }) {
  const [state, setState] = createStore({ titles: [] as string[] });
  const add = () => setState("titles", (list) => [...list, props.title]); // @trace store-updater forward props.title @outcome store-updater ok
  return <button onClick={add}>{state.titles.join(", ")}</button>; // @reaches store-updater render-terminal
}

// The seed reaches the page only by calling the held function, never as the state itself.
export function HeldFunction(props: { seed: number }) {
  const [make] = createSignal(() => props.seed); // @trace held forward props.seed @no-edge held framework-flow * framework-state
  return <i>{make()()}</i>; // @reaches held render-terminal @stop held unresolved-symbol
}
