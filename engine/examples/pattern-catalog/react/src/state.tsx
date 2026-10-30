import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

// R1 controlled input
export function NameField() {
  const [name, setName] = useState("");
  return <input value={name} onChange={(e) => setName(e.target.value)} />; // @trace r-controlled forward e.target.value @want dom-terminal
}

// R2 functional updater
export function Counter(props: { step: number }) {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + props.step)}>{count}</button>; // @trace r-updater forward props.step @want render-terminal
}

// R3 prop drilled to a child
function Label(props: { text: string }) {
  return <span>{props.text}</span>;
}
export function Card(props: { title: string }) { // @trace r-prop-drill forward props.title @want render-terminal
  return <div><Label text={props.title} /></div>;
}

// R4 destructured callback prop called by the child
function Picker({ onPick }: { onPick: (id: string) => void }) {
  return <button onClick={() => onPick("a")}>pick</button>;
}
export function PickerHost() {
  const [picked, setPicked] = useState<string | null>(null);
  return <div><Picker onPick={(id) => setPicked(id)} />{picked}</div>; // @trace r-callback-prop backward picked @want literal
}

// R5 effect fetch into state
export function Profile(props: { id: string }) { // @trace r-effect-fetch forward props.id @want external-effect
  const [user, setUser] = useState<{ name: string } | null>(null);
  useEffect(() => {
    fetch(`/api/users/${props.id}`).then((r) => r.json()).then((u: { name: string }) => setUser(u));
  }, [props.id]);
  return <p>{user?.name}</p>;
}

// R6 useMemo derived value
export function Total(props: { prices: number[] }) { // @trace r-memo forward props.prices @want render-terminal
  const sum = useMemo(() => props.prices.reduce((a, b) => a + b, 0), [props.prices]);
  return <b>{sum}</b>;
}

// R7 useCallback handler passed down
function SaveButton(props: { onSave: () => void }) {
  return <button onClick={props.onSave}>save</button>;
}
export function Editor(props: { draft: string; save: (text: string) => void }) { // @trace r-use-callback forward props.draft @want render-terminal
  const handleSave = useCallback(() => props.save(props.draft), [props]);
  return <SaveButton onSave={handleSave} />;
}
export function EditorHost() {
  const [saved, setSaved] = useState("");
  return <div><Editor draft="note" save={setSaved} /><p>{saved}</p></div>;
}

// R8 useReducer
type Action = { type: "add"; amount: number };
function reducer(state: number, action: Action) {
  return action.type === "add" ? state + action.amount : state;
}
export function Wallet(props: { amount: number }) { // @trace r-reducer forward props.amount @want render-terminal
  const [total, dispatch] = useReducer(reducer, 0);
  return <button onClick={() => dispatch({ type: "add", amount: props.amount })}>{total}</button>;
}

// R9 context provider to consumer
const Theme = createContext("light");
function Themed() {
  const theme = useContext(Theme);
  return <div className={theme}>x</div>;
}
export function ThemeRoot(props: { theme: string }) { // @trace r-context forward props.theme @want dom-terminal
  return <Theme.Provider value={props.theme}><Themed /></Theme.Provider>;
}

// R10 custom hook returning an object
function useToggle(initial: boolean) {
  const [on, setOn] = useState(initial);
  return { on, toggle: () => setOn((v) => !v) };
}
export function Toggle(props: { initial: boolean }) { // @trace r-custom-hook forward props.initial @want dom-terminal|render-terminal
  const { on, toggle } = useToggle(props.initial);
  return <button onClick={toggle}>{on ? "on" : "off"}</button>;
}

// R11 useRef current
export function Focuser() {
  const ref = useRef<HTMLInputElement>(null); // @trace r-ref forward symbol ref @want external-effect
  return <div><input ref={ref} /><button onClick={() => ref.current?.focus()}>f</button></div>;
}

// R12 list rendering
export function List(props: { items: { id: string; label: string }[] }) { // @trace r-list forward props.items @want render-terminal
  return <ul>{props.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>;
}

// R13 form object state with computed key
export function Form() {
  const [form, setForm] = useState({ name: "", email: "" });
  return <input name="name" value={form.name} onChange={(e) => setForm({ ...form, [e.target.name]: e.target.value })} />; // @trace r-form-object forward e.target.value @want dom-terminal
}

// R14 children
function Panel(props: { children: ReactNode }) {
  return <section>{props.children}</section>;
}
export function Page(props: { body: string }) { // @trace r-children forward props.body @want render-terminal
  return <Panel><p>{props.body}</p></Panel>;
}

// R15 conditional render
export function Warning(props: { message?: string }) { // @trace r-conditional forward props.message @want render-terminal
  return <div>{props.message && <strong>{props.message}</strong>}</div>;
}

// R16 lazy initial state
export function Lazy(props: { seed: number }) { // @trace r-lazy-init forward props.seed @want render-terminal
  const [value] = useState(() => props.seed * 2);
  return <i>{value}</i>;
}

// R17 spread props
function Inner(props: { label: string; tone: string }) {
  return <em className={props.tone}>{props.label}</em>;
}
export function Outer(props: { label: string; tone: string }) { // @trace r-spread-props forward props @want render-terminal
  return <Inner {...props} />;
}

// R18 state lifted: setter passed as prop
function Search(props: { onQuery: (q: string) => void }) {
  return <input onChange={(e) => props.onQuery(e.target.value)} />; // @trace r-lifted forward e.target.value @want render-terminal
}
export function SearchPage() {
  const [query, setQuery] = useState("");
  return <div><Search onQuery={setQuery} /><p>{query}</p></div>;
}
