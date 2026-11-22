import { cloneElement, Component, createContext, forwardRef, lazy, Suspense, useCallback, useContext, useDeferredValue, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition, type ComponentType, type Dispatch, type ErrorInfo, type FormEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Scenarios of a real React application that `state.tsx`, `libs.tsx` and `more.tsx` do not cover.

// R36 reducer state and dispatch in two contexts
type CartAction = { type: "add"; sku: string } | { type: "clear" };
function cartReducer(state: string[], action: CartAction): string[] {
  return action.type === "add" ? [...state, action.sku] : [];
}
const CartState = createContext<string[]>([]);
const CartDispatch = createContext<Dispatch<CartAction>>(() => {});
function CartProvider(props: { children: ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, []);
  return <CartState.Provider value={items}><CartDispatch.Provider value={dispatch}>{props.children}</CartDispatch.Provider></CartState.Provider>;
}
function AddToCart(props: { sku: string }) { // @trace r-split-context forward props.sku @want render-terminal
  const dispatch = useContext(CartDispatch);
  return <button onClick={() => dispatch({ type: "add", sku: props.sku })}>add</button>;
}
function CartList() {
  const items = useContext(CartState);
  return <ul>{items.map((sku) => <li key={sku}>{sku}</li>)}</ul>;
}
export function Shop() {
  return <CartProvider><AddToCart sku="a1" /><CartList /></CartProvider>;
}

// R37 a prop drilled across three levels
function Leaf(props: { name: string }) {
  return <b>{props.name}</b>;
}
function Middle(props: { name: string }) {
  return <div><Leaf name={props.name} /></div>;
}
function Upper(props: { name: string }) {
  return <Middle name={props.name} />;
}
export function Drill(props: { user: { name: string } }) { // @trace r-drill-three forward props.user @want render-terminal
  return <Upper name={props.user.name} />;
}

// R38 lifted state: a list item calls the callback prop with its id
type Row = { id: string; label: string };
function RowList(props: { rows: Row[]; onSelect: (id: string) => void }) {
  return <ul>{props.rows.map((row) => <li key={row.id} onClick={() => props.onSelect(row.id)}>{row.label}</li>)}</ul>;
}
export function Master(props: { rows: Row[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div><RowList rows={props.rows} onSelect={(id) => setSelected(id)} /><p>{selected}</p></div>; // @trace r-item-callback backward selected @want parameter
}

// R39 a curried handler
export function Tabs(props: { tabs: string[] }) {
  const [active, setActive] = useState("");
  const select = (tab: string) => () => setActive(tab);
  return <div>{props.tabs.map((tab) => <button key={tab} onClick={select(tab)}>{tab}</button>)}<h2>{active}</h2></div>; // @trace r-curried backward active @want parameter
}

// R40 a custom hook made of other hooks
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
export function DebouncedSearch(props: { query: string }) {
  const q = useDebounced(props.query, 200);
  return <p>{q}</p>; // @trace r-debounce-hook backward q @want parameter
}

// R41 a useMemo chain into a useCallback
function SaveIds(props: { rows: Row[]; save: (ids: string[]) => void }) { // @trace r-memo-chain forward props.rows @want stdout
  const ids = useMemo(() => props.rows.map((r) => r.id), [props.rows]);
  const sorted = useMemo(() => [...ids].sort(), [ids]);
  const onSave = useCallback(() => props.save(sorted), [props, sorted]);
  return <button onClick={onSave}>save</button>;
}
export function SaveIdsHost(props: { rows: Row[] }) {
  return <SaveIds rows={props.rows} save={(ids) => console.log(ids)} />;
}

// R42 a ref that holds the latest value for a timer
export function LatestRef(props: { message: string }) { // @trace r-ref-latest forward props.message @want stdout
  const latest = useRef(props.message);
  useEffect(() => {
    latest.current = props.message;
  });
  useEffect(() => {
    const id = setInterval(() => console.log(latest.current), 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}

// R43 forwardRef with useImperativeHandle
type FillHandle = { fill: (text: string) => void };
const Fillable = forwardRef<FillHandle, { label: string }>(function Fillable(props, ref) {
  const [text, setText] = useState("");
  useImperativeHandle(ref, () => ({ fill: (next: string) => setText(next) }), []);
  return <label>{props.label}<span>{text}</span></label>;
});
export function Imperative(props: { preset: string }) { // @trace r-imperative forward props.preset @want render-terminal
  const handle = useRef<FillHandle>(null);
  return <div><Fillable ref={handle} label="x" /><button onClick={() => handle.current?.fill(props.preset)}>fill</button></div>;
}

// R44 children as a function
function Doubler(props: { value: number; children: (doubled: number) => ReactNode }) {
  return <div>{props.children(props.value * 2)}</div>;
}
export function DoublerHost(props: { value: number }) { // @trace r-children-fn forward props.value @want render-terminal
  return <Doubler value={props.value}>{(doubled) => <i>{doubled}</i>}</Doubler>;
}

// R45 a higher-order component
function withLoudTitle<P extends { title: string }>(Inner: ComponentType<P>) {
  return function Loud(props: P) {
    return <Inner {...props} title={props.title.toUpperCase()} />;
  };
}
function Heading(props: { title: string }) {
  return <h1>{props.title}</h1>;
}
const LoudHeading = withLoudTitle(Heading);
export function HocHost(props: { title: string }) { // @trace r-hoc forward props.title @want render-terminal
  return <LoudHeading title={props.title} />;
}

// R46 cloneElement adds a prop to a child
function Toned(props: { tone: string; children: ReactElement<{ className?: string }> }) {
  return cloneElement(props.children, { className: props.tone });
}
export function TonedHost(props: { tone: string }) { // @trace r-clone forward props.tone @want external-effect|render-terminal
  return <Toned tone={props.tone}><span>x</span></Toned>;
}

// R47 createPortal
export function Modal(props: { text: string }) { // @trace r-portal forward props.text @want render-terminal
  return createPortal(<div role="dialog">{props.text}</div>, document.body);
}

// R48 useSyncExternalStore
let online = true;
const onlineListeners = new Set<() => void>();
function subscribeOnline(notify: () => void) {
  onlineListeners.add(notify);
  return () => onlineListeners.delete(notify);
}
function readOnline() {
  return online ? "online" : "offline";
}
export function setOnline(next: boolean) {
  online = next;
  onlineListeners.forEach((notify) => notify());
}
export function OnlineBadge() {
  const status = useSyncExternalStore(subscribeOnline, readOnline);
  return <span>{status}</span>; // @trace r-external-store backward status @want literal
}

// R49 useDeferredValue and useTransition
export function Deferred(props: { text: string }) { // @trace r-deferred forward props.text @want render-terminal
  const slow = useDeferredValue(props.text);
  return <p>{slow}</p>;
}
export function Transition() {
  const [tab, setTab] = useState("home");
  const [pending, startTransition] = useTransition();
  return <div><button name="about" onClick={(e) => { const name = e.currentTarget.name; startTransition(() => setTab(name)); }}>go</button><p>{pending ? "wait" : tab}</p></div>; // @trace r-transition forward e.currentTarget.name @want render-terminal
}

// R50 effects that sync to the page and to storage
export function Title(props: { title: string }) { // @trace r-effect-title forward props.title @want external-effect|dom-terminal
  useEffect(() => {
    document.title = props.title;
  }, [props.title]);
  return null;
}
export function DraftSaver(props: { draft: string }) { // @trace r-effect-storage forward props.draft @want external-effect
  useEffect(() => {
    localStorage.setItem("draft", props.draft);
  }, [props.draft]);
  return null;
}

// R51 an event's dataset read
export function Menu() {
  const [choice, setChoice] = useState("");
  return <ul><li data-id="a" onClick={(e) => setChoice(e.currentTarget.dataset.id ?? "")}>A</li><li>{choice}</li></ul>; // @trace r-dataset forward e.currentTarget.dataset.id @want render-terminal
}

// R52 a class component: state from props, and an error boundary
export class ClassCounter extends Component<{ step: number }, { count: number }> {
  state = { count: 0 };
  bump = () => this.setState((prev) => ({ count: prev.count + this.props.step })); // @trace r-class-state forward this.props.step @want render-terminal
  render() {
    return <button onClick={this.bump}>{this.state.count}</button>;
  }
}
export class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) { // @trace r-error-boundary forward symbol error @want render-terminal
    return { message: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  render() {
    return this.state.message ? <p>{this.state.message}</p> : this.props.children;
  }
}

// R53 lazy and Suspense
const LazyChart = lazy(() => import("./chart"));
export function ChartHost(props: { points: number[] }) { // @trace r-lazy forward props.points @want render-terminal
  return <Suspense fallback={null}><LazyChart points={props.points} /></Suspense>;
}

// R54 a controlled input whose state a submit handler sends
export function Login() {
  const [email, setEmail] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void fetch("/api/login", { method: "POST", body: JSON.stringify({ email }) });
  };
  return <form onSubmit={submit}><input onChange={(e) => setEmail(e.currentTarget.value)} /></form>; // @trace r-controlled-submit forward e.currentTarget.value @want external-effect
}

// R55 a list item edits its row in the parent's array
type Todo = { id: string; text: string };
function TodoRow(props: { todo: Todo; onEdit: (id: string, text: string) => void }) {
  return <input value={props.todo.text} onChange={(e) => props.onEdit(props.todo.id, e.target.value)} />; // @trace r-list-edit forward e.target.value @want dom-terminal
}
export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const edit = (id: string, text: string) => setTodos((list) => list.map((t) => (t.id === id ? { ...t, text } : t)));
  return <>{todos.map((todo) => <TodoRow key={todo.id} todo={todo} onEdit={edit} />)}</>;
}

// R56 a destructured prop with a default
function Avatar({ size = 32, name }: { size?: number; name: string }) {
  return <img width={size} alt={name} />;
}
export function AvatarHost(props: { size?: number }) { // @trace r-default-prop forward props.size @want dom-terminal
  return <Avatar size={props.size} name="a" />;
}

// R57 an async function in an effect, with an abort
export function Loader(props: { url: string }) { // @trace r-effect-async forward props.url @want external-effect
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const res = await fetch(props.url, { signal: controller.signal });
      setRows((await res.json()) as string[]);
    }
    void load();
    return () => controller.abort();
  }, [props.url]);
  return <ul>{rows.map((r) => <li key={r}>{r}</li>)}</ul>; // @trace r-effect-async-rows backward rows.map((r) => <li key={r}>{r}</li>) @want fetch-input
}
