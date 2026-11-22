// The router and Solid are not installed here: the engine knows these calls by the module their import names.
import { action, useAction, useSubmission } from "@solidjs/router";
import { createContext, createResource, createRoot, createSignal, useContext } from "solid-js";
import { createStore, produce } from "solid-js/store";
import "./boundary-kit";
import { Boundary } from "boundary-kit";

// A submission's `result` is what the action's function returns, and its
// `input` the arguments of each call of the action. Another action's call
// never reaches it.
const addTodo = action(async (title: string) => {
  const response = await fetch("/api/todos", { method: "POST", body: title }); // @reaches sar-result fetch-input
  return (await response.json()) as { id: string };
});
const removeTodo = action(async (id: string) => fetch(`/api/todos/${id}`, { method: "DELETE" }));
export function Submitted() {
  const submission = useSubmission(addTodo);
  const add = useAction(addTodo);
  const remove = useAction(removeTodo);
  return (
    <section>
      {/* @trace sar-result backward submission.result?.id @outcome sar-result ok @path sar-result "response.json()" "submission.result?.id" */}
      <p>{submission.result?.id}</p>
      {/* @trace sar-input backward submission.input?.[0] @outcome sar-input ok */}
      <p>{submission.input?.[0]}</p>
      <button onClick={() => add("milk")}>add</button> {/* @visits sar-input literal @visits sar-result literal */}
      <button onClick={() => remove("old")}>remove</button> {/* @never-reaches sar-input */}
    </section>
  );
}

// A resource's `mutate(v)` sets the value its reads see. `refetch(x)` runs the
// fetcher again with `x` as its second parameter's `refetching`; a fetcher
// that never reads it stops at its parameter.
export function Likes(props: { bump: number }) {
  const [likes, { mutate }] = createResource(async () => (await fetch("/api/likes")).json() as Promise<number>);
  // @trace sar-mutate forward props.bump @outcome sar-mutate ok @no-edge sar-mutate * * external-call
  const bump = () => mutate(props.bump);
  return <button onClick={bump}>{likes()}</button>; // @reaches sar-mutate render-terminal
}
export function Feed(props: { cursor: string }) {
  const [page, { refetch }] = createResource(async (_: true, info: { refetching: unknown }) => (await fetch(`/api/feed?after=${String(info.refetching)}`)).text()); // @reaches sar-refetch external-effect @stop sar-refetch network fetch-input @stop sar-refetch framework-runtime resource-input
  // @trace sar-refetch forward props.cursor @outcome sar-refetch ok @path sar-refetch "props.cursor" "info"
  const more = () => refetch(props.cursor);
  return <pre onClick={more}>{page()}</pre>; // @reaches sar-refetch render-terminal @stop sar-refetch framework-runtime resource-result
}
export function Ignored(props: { cursor: string }) {
  const [page, { refetch }] = createResource(async (_: true, _info: { refetching: unknown }) => (await fetch("/api/feed")).text()); // @reaches sar-ignored parameter "_info"
  // @trace sar-ignored forward props.cursor @outcome sar-ignored ok
  const more = () => refetch(props.cursor);
  return <pre onClick={more}>{page()}</pre>; // @never-reaches sar-ignored
}

// A context read through a hook of the program's (`useCart`) is that context:
// `cart.add` runs the provider's `add`. Its write reaches the list's readers,
// and never the provider's other field.
type Cart = { items: () => string[]; label: string; add: (sku: string) => void };
const CartContext = createContext<Cart>();
const useCart = () => useContext(CartContext)!;
export function CartProvider(props: { children: unknown }) {
  const [items, setItems] = createSignal<string[]>([]);
  const add = (sku: string) => setItems((list) => [...list, sku]);
  return <CartContext.Provider value={{ items, label: "cart", add }}>{props.children}</CartContext.Provider>;
}
export function AddButton(props: { sku: string }) {
  const cart = useCart();
  return <button onClick={() => cart.add(props.sku)}>add</button>; // @trace sar-hook forward props.sku @outcome sar-hook ok
}
export function CartList() {
  const cart = useCart();
  return (
    <ul title={cart.label}>{/* @never-reaches sar-hook dom-terminal */}
      {cart.items().map((sku) => <li>{sku}</li>) /* @reaches sar-hook render-terminal */}
    </ul>
  );
}

// A signal pair provided whole: a reader's element 1 is its setter and element 0 its getter.
const NameContext = createContext<[() => string, (next: string) => void]>();
export function NameProvider(props: { children: unknown }) {
  const pair = createSignal("");
  return <NameContext.Provider value={pair}>{props.children}</NameContext.Provider>;
}
export function NameInput(props: { name: string }) {
  const [, setName] = useContext(NameContext)!;
  return <button onClick={() => setName(props.name)}>set</button>; // @trace sar-pair forward props.name @outcome sar-pair ok @no-edge sar-pair * * external-call
}
export function NameLabel() {
  const [name] = useContext(NameContext)!;
  return <label>{name()}</label>; // @reaches sar-pair render-terminal
}

// `produce(fn)` hands `fn` a draft of the store: a field it writes is that
// field of the store, so a sibling field's reads never see it.
export function Editor(props: { draft: string }) {
  const [doc, setDoc] = createStore({ body: "", title: "" });
  // @trace sar-produce forward props.draft @outcome sar-produce ok @reaches sar-produce field-read
  const save = () => setDoc(produce((d) => { d.body = props.draft; }));
  return (
    <article onClick={save}>
      <p>{doc.body}</p> {/* @reaches sar-produce render-terminal */}
      <h2>{doc.title}</h2> {/* @never-reaches sar-produce render-terminal */}
    </article>
  );
}

// A store's getter reads the store as `this`: `this.first` is the store's
// `first`, and a getter that reads only `this.last` does not carry it.
export function FullName(props: { first: string }) {
  // @trace sar-getter forward props.first @outcome sar-getter ok
  const [state] = createStore({ first: props.first, last: "x", get full() { return `${this.first} ${this.last}`; }, get tail() { return this.last.toUpperCase(); } });
  return (
    <div>
      <h2>{state.full}</h2> {/* @reaches sar-getter render-terminal */}
      <h3>{state.tail}</h3> {/* @never-reaches sar-getter render-terminal */}
    </div>
  );
}

// `createRoot(fn)` is what `fn` returns: a getter returned from it still reads its state.
export function Rooted(props: { start: number }) {
  const count = createRoot(() => {
    const [n] = createSignal(props.start); // @trace sar-root forward props.start @outcome sar-root ok @no-edge sar-root * * external-call
    return n;
  });
  return <p>{count()}</p>; // @reaches sar-root render-terminal
}

// A function a component calls as its children (`props.children(x)`) is the one written as its element's child.
function Mouse(props: { at: number; children: (x: number) => unknown }) {
  return <div>{props.children(props.at)}</div>;
}
export function Tracker(props: { at: number }) {
  return <Mouse at={props.at}>{(x) => <b>{x}</b>}</Mouse>; // @trace sar-children forward props.at @outcome sar-children ok @reaches sar-children component-occurrence @reaches sar-children render-terminal @path sar-children "at={props.at}" "x"
}

// A package's component calls the function it is given as a prop: its parameter begins there.
export function Guard() {
  return <Boundary fallback={(err: Error) => <p>{err.message}</p>}>x</Boundary>; // @trace sar-fallback backward err.message @outcome sar-fallback ok @visits sar-fallback parameter
}

// A test callback (`filter`) decides which items count: the query ends at its test, never as a rendered value.
export function Filtered(props: { items: string[]; query: string }) {
  // @trace sar-filter forward props.query @outcome sar-filter ok @reaches sar-filter branch-condition
  const shown = props.items.filter((item) => item.includes(props.query));
  return <ul>{shown.map((item) => <li>{item}</li>)}</ul>; // @never-reaches sar-filter
}
