import { createEffect, createMemo, createSelector, createSignal, ErrorBoundary, For, Match, on, onMount, Switch } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { makePersisted } from "@solid-primitives/storage";

// S23 onMount fetch into a signal
export function Loader(props: { url: string }) { // @trace s-onmount-fetch forward props.url @want external-effect
  const [text, setText] = createSignal("");
  onMount(async () => setText(await (await fetch(props.url)).text()));
  return <pre>{text()}</pre>;
}

// S24 Switch / Match on a status
export function Status(props: { state: "idle" | "busy"; label: string }) { // @trace s-switch forward props.label @want render-terminal
  return (
    <Switch fallback={<i>?</i>}>
      <Match when={props.state === "idle"}><span>{props.label}</span></Match>
    </Switch>
  );
}

// S25 store with produce
export function Todos(props: { title: string }) { // @trace s-produce forward props.title @want render-terminal
  const [state, setState] = createStore({ items: [] as string[] });
  const add = () => setState(produce((s) => { s.items.push(props.title); }));
  return <ul onClick={add}><For each={state.items}>{(item) => <li>{item}</li>}</For></ul>;
}

// S26 store reconcile from data
export function Synced(props: { rows: string[] }) { // @trace s-reconcile forward props.rows @want render-terminal
  const [state, setState] = createStore({ rows: [] as string[] });
  createEffect(() => setState("rows", reconcile(props.rows)));
  return <p>{state.rows.length}</p>;
}

// S27 createSelector for the active row
export function Rows(props: { active: string; rows: string[] }) { // @trace s-selector forward props.active @want dom-terminal|render-terminal
  const isActive = createSelector(() => props.active);
  return <For each={props.rows}>{(row) => <p classList={{ on: isActive(row) }}>{row}</p>}</For>;
}

// S28 on() with an explicit dependency
export function Echo(props: { value: string }) { // @trace s-on forward props.value @want render-terminal
  const [last, setLast] = createSignal("");
  createEffect(on(() => props.value, (value) => setLast(value)));
  return <p>{last()}</p>;
}

// S29 persisted signal
export function Theme() {
  const [theme, setTheme] = makePersisted(createSignal("light"), { name: "theme" });
  return <div class={theme()} onClick={() => setTheme("dark")}>t</div>; // @trace s-persisted backward theme() @want literal|external-read|origin
}

// S30 ErrorBoundary fallback with the error
export function Safe(props: { label: string }) { // @trace s-error-boundary forward props.label @want render-terminal
  return <ErrorBoundary fallback={(err) => <p>{String(err)}</p>}><span>{props.label}</span></ErrorBoundary>;
}

// S31 memo of a filtered list
export function Filtered(props: { items: string[]; query: string }) { // @trace s-filter-memo forward props.query @want dom-terminal|render-terminal
  const shown = createMemo(() => props.items.filter((item) => item.includes(props.query)));
  return <For each={shown()}>{(item) => <p>{item}</p>}</For>;
}

// S32 signal passed as an accessor prop
function Badge(props: { count: () => number }) {
  return <b>{props.count()}</b>; // @trace s-accessor-prop backward props.count() @want literal
}
export function Counter() {
  const [count, setCount] = createSignal(0);
  return <div onClick={() => setCount(count() + 1)}><Badge count={count} /></div>;
}
