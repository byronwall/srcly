import { createContext, createSignal, For, useContext, type Accessor, type JSX, type Setter } from "solid-js";
import { createStore, produce, reconcile, type SetStoreFunction } from "solid-js/store";

type Todo = { id: string; title: string; done: boolean };

// S33 nested store path setter with an index
export function Board(props: { title: string }) { // @trace s-store-nested-path forward props.title @want render-terminal
  const [state, setState] = createStore({ lists: [{ name: "a", cards: [{ title: "" }] }] });
  const rename = () => setState("lists", 0, "cards", 0, "title", props.title);
  return <p onClick={rename}>{state.lists[0].cards[0].title}</p>;
}

// S34 store setter with an object merge
export function Profile(props: { email: string }) { // @trace s-store-merge forward props.email @want render-terminal
  const [user, setUser] = createStore({ name: "", email: "" });
  return <p onClick={() => setUser({ email: props.email })}>{user.email}</p>;
}

// S35 produce that assigns a field
export function Editor(props: { draft: string }) { // @trace s-produce-assign forward props.draft @want render-terminal
  const [doc, setDoc] = createStore({ body: "", title: "" });
  const save = () => setDoc(produce((d) => { d.body = props.draft; }));
  return <article onClick={save}>{doc.body}</article>;
}

// S36 reconcile of a whole store from fetched data
export function Inbox() {
  const [state, setState] = createStore<{ mail: string[] }>({ mail: [] });
  const load = async () => setState(reconcile(await (await fetch("/api/mail")).json()));
  return <ul onClick={load}><For each={state.mail}>{(m) => <li>{m}</li>}</For></ul>; // @trace s-reconcile-fetch backward state.mail @want fetch-input
}

// S37 store array rendered by For, row field written by a predicate path
export function Checklist(props: { todos: Todo[]; label: string }) { // @trace s-store-for-predicate forward props.label @want render-terminal
  const [state, setState] = createStore({ todos: props.todos });
  const retitle = (id: string) => setState("todos", (t) => t.id === id, "title", props.label);
  return <For each={state.todos}>{(todo) => <p onClick={() => retitle(todo.id)}>{todo.title}</p>}</For>;
}

// S38 store held in a context (tuple)
const TodoContext = createContext<[{ todos: Todo[] }, SetStoreFunction<{ todos: Todo[] }>]>();
export function TodoProvider(props: { initial: Todo[]; children: JSX.Element }) { // @trace s-store-context forward props.initial @want render-terminal
  const [state, setState] = createStore({ todos: props.initial });
  return <TodoContext.Provider value={[state, setState]}>{props.children}</TodoContext.Provider>;
}
export function TodoCount() {
  const [state] = useContext(TodoContext)!;
  return <b>{state.todos.length}</b>;
}

// S39 signal tuple held in a context, written by a consumer
const NameContext = createContext<[Accessor<string>, Setter<string>]>();
export function NameProvider(props: { children: JSX.Element }) {
  const pair = createSignal("");
  return <NameContext.Provider value={pair}>{props.children}</NameContext.Provider>;
}
export function NameInput() {
  const [, setName] = useContext(NameContext)!;
  return <input onInput={(e) => setName(e.currentTarget.value)} />; // @trace s-signal-context forward e.currentTarget.value @want render-terminal
}
export function NameLabel() {
  const [name] = useContext(NameContext)!;
  return <label>{name()}</label>;
}

// S40 context object with an action, built by a hook
type Cart = { items: Accessor<string[]>; add: (sku: string) => void };
const CartContext = createContext<Cart>();
const useCart = () => useContext(CartContext)!;
export function CartProvider(props: { children: JSX.Element }) {
  const [items, setItems] = createSignal<string[]>([]);
  const add = (sku: string) => setItems((list) => [...list, sku]);
  return <CartContext.Provider value={{ items, add }}>{props.children}</CartContext.Provider>;
}
export function AddButton(props: { sku: string }) { // @trace s-context-action forward props.sku @want render-terminal
  const cart = useCart();
  return <button onClick={() => cart.add(props.sku)}>add</button>;
}
export function CartList() {
  const cart = useCart();
  return <For each={cart.items()}>{(sku) => <li>{sku}</li>}</For>;
}

// S41 store getter (derived field inside a store)
export function FullName(props: { first: string }) { // @trace s-store-getter forward props.first @want render-terminal
  const [state] = createStore({ first: props.first, last: "x", get full() { return `${this.first} ${this.last}`; } });
  return <h2>{state.full}</h2>;
}

// S42 module-level store with an exported action
const [settings, setSettings] = createStore({ theme: "light", size: 12 });
export function setTheme(theme: string) { // @trace s-global-store forward symbol theme @want dom-terminal
  setSettings("theme", theme);
}
export function Shell() {
  return <main class={settings.theme}>x</main>;
}
