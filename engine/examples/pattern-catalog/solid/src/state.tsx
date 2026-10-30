import { batch, createContext, createEffect, createMemo, createResource, createSignal, For, Index, mergeProps, Show, splitProps, useContext, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { Dynamic } from "solid-js/web";

// S1 signal with input
export function NameField() {
  const [name, setName] = createSignal("");
  return <input value={name()} onInput={(e) => setName(e.currentTarget.value)} />; // @trace s-signal-input forward e.currentTarget.value
}

// S2 functional updater
export function Counter(props: { step: number }) {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount((c) => c + props.step)}>{count()}</button>; // @trace s-updater forward props.step
}

// S3 memo
export function Total(props: { prices: number[] }) { // @trace s-memo forward props.prices
  const sum = createMemo(() => props.prices.reduce((a, b) => a + b, 0));
  return <b>{sum()}</b>;
}

// S4 effect writes another signal
export function Mirror(props: { source: string }) { // @trace s-effect forward props.source
  const [copy, setCopy] = createSignal("");
  createEffect(() => setCopy(props.source.toUpperCase()));
  return <i>{copy()}</i>;
}

// S5 store path setter
export function Todos(props: { title: string }) { // @trace s-store forward props.title
  const [state, setState] = createStore({ todos: [] as { title: string }[] });
  const add = () => setState("todos", (list) => [...list, { title: props.title }]);
  return <div><button onClick={add}>add</button><For each={state.todos}>{(todo) => <p>{todo.title}</p>}</For></div>;
}

// S6 resource
export function Profile(props: { id: string }) { // @trace s-resource forward props.id
  const [user] = createResource(() => props.id, (id) => fetch(`/api/users/${id}`).then((r) => r.json() as Promise<{ name: string }>));
  return <p>{user()?.name}</p>;
}

// S7 splitProps / mergeProps
function Button(props: { label?: string; kind?: string; onClick?: () => void }) {
  const merged = mergeProps({ kind: "primary" }, props);
  const [local, rest] = splitProps(merged, ["label"]);
  return <button class={rest.kind} onClick={rest.onClick}>{local.label}</button>;
}
export function Toolbar(props: { label: string }) { // @trace s-split-props forward props.label
  return <Button label={props.label} />;
}

// S8 For with item callback
export function List(props: { items: { id: string; label: string }[] }) { // @trace s-for forward props.items
  return <ul><For each={props.items}>{(item) => <li>{item.label}</li>}</For></ul>;
}

// S9 Show with keyed callback
export function Detail(props: { user?: { name: string } }) { // @trace s-show forward props.user
  return <Show when={props.user}>{(user) => <h1>{user().name}</h1>}</Show>;
}

// S10 context
const Theme = createContext("light");
function Themed() {
  const theme = useContext(Theme);
  return <div class={theme}>x</div>;
}
export function ThemeRoot(props: { theme: string }) { // @trace s-context forward props.theme
  return <Theme.Provider value={props.theme}><Themed /></Theme.Provider>;
}

// S11 callback prop
function Picker(props: { onPick: (id: string) => void }) {
  return <button onClick={() => props.onPick("a")}>pick</button>;
}
export function PickerHost() {
  const [picked, setPicked] = createSignal<string | null>(null);
  return <div><Picker onPick={setPicked} />{picked()}</div>; // @trace s-callback-prop backward picked()
}

// S12 children
function Panel(props: { children: JSX.Element }) {
  return <section>{props.children}</section>;
}
export function Page(props: { body: string }) { // @trace s-children forward props.body
  return <Panel><p>{props.body}</p></Panel>;
}

// S13 Index
export function Tags(props: { tags: string[] }) { // @trace s-index forward props.tags
  return <Index each={props.tags}>{(tag) => <span>{tag()}</span>}</Index>;
}

// S14 Dynamic
export function Heading(props: { level: "h1" | "h2"; text: string }) { // @trace s-dynamic forward props.text
  return <Dynamic component={props.level}>{props.text}</Dynamic>;
}

// S15 batch two setters
export function Pair(props: { a: string; b: string }) { // @trace s-batch forward props.a
  const [a, setA] = createSignal("");
  const [b, setB] = createSignal("");
  const both = () => batch(() => { setA(props.a); setB(props.b); });
  return <button onClick={both}>{a()}{b()}</button>;
}

// S16 module-level signal store
const [selected, setSelected] = createSignal<string | null>(null);
export function select(id: string) { // @trace s-global-signal forward symbol id
  setSelected(id);
}
export function SelectedView() {
  return <p>{selected()}</p>;
}

// S17 derived function (accessor helper)
export function Greeting(props: { name: string }) { // @trace s-derived-fn forward props.name
  const greeting = () => `Hello ${props.name}`;
  return <p>{greeting()}</p>;
}

// S18 ref callback
export function Focus(props: { hint: string }) { // @trace s-ref forward props.hint
  let input!: HTMLInputElement;
  return <input ref={input} placeholder={props.hint} onFocus={() => input.select()} />;
}
